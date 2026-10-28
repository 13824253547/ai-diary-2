#!/usr/bin/env python3
"""Build the bundled catalog from WUP and official Mainland city units."""

from __future__ import annotations

import argparse
import csv
import difflib
import io
import json
import math
import re
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS = {"m": MAIN_NS}
SPECIAL_AREAS = {
    "HK": {
        "id": "CN-HK",
        "nameZh": "中国香港",
        "nameEn": "HONG KONG · CHINA",
    },
    "MO": {
        "id": "CN-MO",
        "nameZh": "中国澳门",
        "nameEn": "MACAO · CHINA",
    },
    "TW": {
        "id": "CN-TW",
        "nameZh": "中国台湾",
        "nameEn": "TAIWAN · CHINA",
    },
    "CN": {
        "id": "CN",
        "nameZh": "中国大陆",
        "nameEn": "MAINLAND CHINA",
    },
}


def column_name(reference: str) -> str:
    return "".join(character for character in reference if character.isalpha())


def read_xlsx_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    return [
        "".join(node.text or "" for node in item.findall(".//m:t", NS))
        for item in root.findall("m:si", NS)
    ]


def cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    value = cell.find("m:v", NS)
    if value is None:
        return ""
    if cell.attrib.get("t") == "s":
        return shared_strings[int(value.text or "0")]
    return value.text or ""


def read_wup_cities(path: Path) -> list[dict[str, str]]:
    with zipfile.ZipFile(path) as archive:
        shared_strings = read_xlsx_shared_strings(archive)
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationship = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        relationship_ns = "{http://schemas.openxmlformats.org/package/2006/relationships}"
        relationship_targets = {
            node.attrib["Id"]: node.attrib["Target"]
            for node in relationship.findall(f"{relationship_ns}Relationship")
        }
        sheet_name = "Data"
        workbook_ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
        relationship_id_ns = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
        sheet = next(
            (
                node
                for node in workbook.find(f"{workbook_ns}sheets")
                if node.attrib.get("name") == sheet_name
            ),
            None,
        )
        if sheet is None:
            raise ValueError(f"Could not find the {sheet_name!r} worksheet")
        target = relationship_targets[sheet.attrib[f"{relationship_id_ns}id"]]
        worksheet_path = f"xl/{target.lstrip('/')}"
        if not worksheet_path.startswith("xl/"):
            worksheet_path = f"xl/{worksheet_path}"
        worksheet = ET.fromstring(archive.read(worksheet_path))
        rows = worksheet.findall(".//m:sheetData/m:row", NS)
        if not rows:
            raise ValueError("The WUP city worksheet is empty")

        header = {
            column_name(cell.attrib["r"]): cell_value(cell, shared_strings)
            for cell in rows[0].findall("m:c", NS)
        }
        required = {
            "Location",
            "ISO3_Code",
            "ISO2_Code",
            "City_Code",
            "City_Name",
            "PWCent_Longitude",
            "PWCent_Latitude",
            "2025",
        }
        missing = required - set(header.values())
        if missing:
            raise ValueError(f"WUP city worksheet is missing columns: {sorted(missing)}")
        cities: list[dict[str, str]] = []
        for row in rows[1:]:
            values = {
                header[column_name(cell.attrib["r"])]: cell_value(cell, shared_strings)
                for cell in row.findall("m:c", NS)
                if column_name(cell.attrib["r"]) in header
            }
            if not values.get("City_Name") or not values.get("ISO2_Code"):
                continue
            values["wupKey"] = f"{values['ISO3_Code']}-{values['City_Code']}"
            cities.append(values)
        return cities


def read_mainland_city_units(path: Path) -> list[dict[str, str]]:
    source_data = json.loads(path.read_text(encoding="utf-8"))
    cities = source_data.get("cities")
    if (
        source_data.get("source") != "https://dmfw.mca.gov.cn/XzqhVersionPublish.html"
        or source_data.get("sourceDataAsOf") != "2025-12-31"
        or not isinstance(cities, list)
    ):
        raise ValueError("Mainland city input must be the reviewed MCA 2025-12-31 snapshot")

    records = []
    for city in cities:
        code = str(city.get("code", ""))
        name = str(city.get("cityName", "")).strip()
        level = city.get("administrativeLevel")
        code_prefix = code[2:4] if len(code) == 6 else ""
        is_city_code = (
            code_prefix.isdigit()
            and (
                1 <= int(code_prefix) <= 20
                or 51 <= int(code_prefix) <= 70
            )
            and code.endswith("00")
        )
        is_municipality_code = code in {"110000", "120000", "310000", "500000"}
        if (
            not re.fullmatch(r"\d{6}", code)
            or not (
                (level == "municipality" and is_municipality_code)
                or (level == "prefecture-level-city" and is_city_code)
            )
            or not name.endswith("市")
            or level not in {"municipality", "prefecture-level-city"}
            or not city.get("provinceName")
            or not city.get("provinceCode", "").startswith(code[:2])
            or not city.get("latinName")
            or city.get("latinNameSource") != "Hanyu Pinyin, toneless transliteration"
        ):
            raise ValueError(f"Invalid mainland municipal unit in MCA snapshot: {city!r}")
        records.append(
            {
                **city,
                "catalogKey": f"mca-{code}",
                "catalogId": f"cn-admin-{code}",
                "ISO2_Code": "CN",
                "ISO3_Code": "CHN",
                "Location": "China",
                "City_Code": code,
                "City_Name": name,
            }
        )

    codes = [city["City_Code"] for city in records]
    if (
        len(records) != 297
        or len(codes) != len(set(codes))
        or sum(city["administrativeLevel"] == "municipality" for city in records) != 4
        or sum(city["administrativeLevel"] == "prefecture-level-city" for city in records) != 293
    ):
        raise ValueError("MCA snapshot must contain 4 municipalities and 293 prefecture-level cities")
    required_city_names = {"汕头市", "揭阳市"}
    if not required_city_names.issubset({city["City_Name"] for city in records}):
        raise ValueError("MCA snapshot is missing Shantou or Jieyang")
    return records


def normalize_name(value: str) -> str:
    value = re.sub(r"\([^)]*\)", "", value)
    folded = unicodedata.normalize("NFKD", value).casefold()
    return "".join(
        character
        for character in folded
        if not unicodedata.combining(character) and character.isalnum()
    )


def strip_language_tag(value: str) -> str:
    value = re.sub(r"@[A-Za-z]+(?:-[A-Za-z0-9]+)*$", "", value.strip())
    return value.strip('"')


def name_variants(value: str) -> set[str]:
    pieces = re.split(r"\s+(?:/|–|—)\s+", value)
    variants = set()
    for piece in pieces:
        variants.add(normalize_name(piece))
        before_parenthesis = piece.split("(", maxsplit=1)[0].strip()
        if before_parenthesis:
            variants.add(normalize_name(before_parenthesis))
    return {variant for variant in variants if variant}


def distance_km(first_lat: float, first_lon: float, second_lat: float, second_lon: float) -> float:
    radius_km = 6371.0088
    lat1, lat2 = math.radians(first_lat), math.radians(second_lat)
    delta_lat = lat2 - lat1
    delta_lon = math.radians(second_lon - first_lon)
    haversine = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    )
    return radius_km * 2 * math.asin(min(1, math.sqrt(haversine)))


def wrap_longitude_cell(cell: int) -> int:
    return ((cell + 180) % 360) - 180


def read_geonames_cities(
    paths: list[Path],
    wup_cities: list[dict[str, str]],
) -> tuple[
    dict[str, dict[str, list[dict]]],
    dict[str, dict[tuple[int, int], list[dict]]],
    dict[str, dict],
]:
    by_country_name: dict[str, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    by_country_grid: dict[str, dict[tuple[int, int], list[dict]]] = defaultdict(
        lambda: defaultdict(list)
    )
    relevant_cells: dict[str, set[tuple[int, int]]] = defaultdict(set)
    for city in wup_cities:
        try:
            latitude = float(city["PWCent_Latitude"])
            longitude = float(city["PWCent_Longitude"])
        except (KeyError, ValueError):
            continue
        lon_span = min(
            8,
            max(1, math.ceil(1.2 / max(0.2, abs(math.cos(math.radians(latitude)))))),
        )
        for lat_cell in range(math.floor(latitude) - 1, math.floor(latitude) + 2):
            for lon_cell in range(
                math.floor(longitude) - lon_span,
                math.floor(longitude) + lon_span + 1,
            ):
                relevant_cells[city["ISO2_Code"]].add(
                    (lat_cell, wrap_longitude_cell(lon_cell))
                )

    seen_geoname_ids: set[str] = set()
    records_by_id: dict[str, dict] = {}
    for path in paths:
        with zipfile.ZipFile(path) as archive:
            member = next(
                (
                    name
                    for name in archive.namelist()
                    if name.lower().endswith(".txt")
                    and Path(name).name.lower() != "readme.txt"
                ),
                None,
            )
            if member is None:
                raise ValueError(f"GeoNames city archive has no data file: {path}")
            with io.TextIOWrapper(archive.open(member), encoding="utf-8") as stream:
                for line in stream:
                    fields = line.rstrip("\n").split("\t")
                    if len(fields) < 19 or fields[6] != "P" or fields[0] in seen_geoname_ids:
                        continue
                    try:
                        latitude, longitude = float(fields[4]), float(fields[5])
                    except ValueError:
                        continue
                    country = fields[8]
                    country_cells = relevant_cells.get(country)
                    if country_cells is None or (math.floor(latitude), math.floor(longitude)) not in country_cells:
                        continue
                    seen_geoname_ids.add(fields[0])
                    record = {
                        "geonameId": fields[0],
                        "name": fields[1],
                        "asciiName": fields[2],
                        "latitude": latitude,
                        "longitude": longitude,
                        "population": int(fields[14] or "0"),
                        "country": country,
                    }
                    records_by_id[fields[0]] = record
                    by_country_grid[country][(math.floor(latitude), math.floor(longitude))].append(
                        record
                    )
                    for variant in name_variants(record["name"]) | name_variants(record["asciiName"]):
                        by_country_name[country][variant].append(record)
    return by_country_name, by_country_grid, records_by_id


def nearby_candidates(
    country: str,
    city: dict[str, str],
    grids: dict[str, dict[tuple[int, int], list[dict]]],
) -> list[dict]:
    try:
        latitude = float(city["PWCent_Latitude"])
        longitude = float(city["PWCent_Longitude"])
    except (KeyError, ValueError):
        return []
    country_grid = grids.get(country, {})
    lat_span = 1
    lon_span = min(8, max(1, math.ceil(1.2 / max(0.2, abs(math.cos(math.radians(latitude)))))))
    candidates: list[dict] = []
    for lat_cell in range(math.floor(latitude) - lat_span, math.floor(latitude) + lat_span + 1):
        for lon_cell in range(
            math.floor(longitude) - lon_span,
            math.floor(longitude) + lon_span + 1,
        ):
            candidates.extend(
                country_grid.get((lat_cell, wrap_longitude_cell(lon_cell)), [])
            )
    return candidates


def match_geoname(
    city: dict[str, str],
    by_country_name: dict[str, dict[str, list[dict]]],
    grids: dict[str, dict[tuple[int, int], list[dict]]],
) -> tuple[dict | None, str]:
    country = city.get("ISO2_Code", "")
    variants = name_variants(city["City_Name"])
    exact_candidates = {
        record["geonameId"]: record
        for variant in variants
        for record in by_country_name.get(country, {}).get(variant, [])
    }
    candidates = list(exact_candidates.values())
    if not candidates:
        candidates = nearby_candidates(country, city, grids)
    try:
        latitude, longitude = float(city["PWCent_Latitude"]), float(city["PWCent_Longitude"])
    except (KeyError, ValueError):
        return None, "missing-centroid"
    scored = []
    for record in candidates:
        distance = distance_km(
            latitude,
            longitude,
            record["latitude"],
            record["longitude"],
        )
        if distance > 50:
            continue
        candidate_names = {
            normalize_name(record["name"]),
            normalize_name(record["asciiName"]),
        }
        similarity = max(
            (
                difflib.SequenceMatcher(None, variant, candidate_name).ratio()
                for variant in variants
                for candidate_name in candidate_names
                if candidate_name
            ),
            default=0,
        )
        if exact_candidates or similarity >= 0.72:
            scored.append((distance, -similarity, record))
    if not scored:
        return None, "no-nearby-name-match"
    scored.sort(key=lambda item: (item[0], item[1]))
    if len(scored) > 1 and abs(scored[0][0] - scored[1][0]) < 1:
        return None, "ambiguous-geoname-match"
    return scored[0][2], "exact-name" if exact_candidates else "nearby-name"


def nearest_geoname_candidate(
    city: dict[str, str],
    grids: dict[str, dict[tuple[int, int], list[dict]]],
) -> dict | None:
    try:
        latitude = float(city["PWCent_Latitude"])
        longitude = float(city["PWCent_Longitude"])
    except (KeyError, ValueError):
        return None

    scored = []
    for record in nearby_candidates(city.get("ISO2_Code", ""), city, grids):
        distance = distance_km(
            latitude,
            longitude,
            record["latitude"],
            record["longitude"],
        )
        if distance <= 50:
            scored.append((distance, record["geonameId"], record))
    if not scored:
        return None
    scored.sort(key=lambda item: (item[0], item[1]))
    return scored[0][2]


def read_geonames_alternates(
    directory: Path,
    wanted_ids: set[str],
) -> tuple[dict[str, list[dict[str, str]]], dict[str, list[str]]]:
    chinese_aliases: dict[str, list[dict[str, str]]] = defaultdict(list)
    english_aliases: dict[str, set[str]] = defaultdict(set)
    chinese_languages = {"zh", "zh-CN", "zh-Hans", "zh-Hant"}
    for path in sorted(directory.glob("*.zip")):
        with zipfile.ZipFile(path) as archive:
            member = next(
                (
                    name
                    for name in archive.namelist()
                    if name.lower().endswith(".txt")
                    and Path(name).name.lower() != "readme.txt"
                ),
                None,
            )
            if member is None:
                continue
            with io.TextIOWrapper(archive.open(member), encoding="utf-8") as stream:
                for line in stream:
                    fields = line.rstrip("\n").split("\t")
                    if len(fields) < 4 or fields[2] not in chinese_languages | {"en"}:
                        continue
                    geoname_id = fields[1]
                    if geoname_id not in wanted_ids:
                        continue
                    if (len(fields) > 6 and fields[6] == "1") or (
                        len(fields) > 7 and fields[7] == "1"
                    ):
                        continue
                    name = fields[3].strip()
                    if not name:
                        continue
                    if fields[2] == "en":
                        english_aliases[geoname_id].add(name)
                    elif any("\u4e00" <= character <= "\u9fff" for character in name):
                        chinese_aliases[geoname_id].append(
                            {
                                "name": name,
                                "language": fields[2],
                                "preferred": fields[4] if len(fields) > 4 else "0",
                                "short": fields[5] if len(fields) > 5 else "0",
                            }
                        )
    return chinese_aliases, {
        geoname_id: sorted(names)
        for geoname_id, names in english_aliases.items()
    }


def add_geonames_english_aliases(
    by_country_name: dict[str, dict[str, list[dict]]],
    records_by_id: dict[str, dict],
    aliases_by_id: dict[str, list[str]],
) -> None:
    for geoname_id, aliases in aliases_by_id.items():
        record = records_by_id.get(geoname_id)
        if not record:
            continue
        for alias in aliases:
            for variant in name_variants(alias):
                matches = by_country_name[record["country"]][variant]
                if not any(item["geonameId"] == geoname_id for item in matches):
                    matches.append(record)


def read_ungegn_cities(path: Path) -> dict[str, list[dict]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    by_english_name: dict[str, list[dict]] = defaultdict(list)
    for feature in data.get("features", []):
        properties = feature.get("properties", {})
        toponyms = properties.get("toponyms", [])
        chinese_names = [
            name.get("nameShort", "").strip()
            for name in toponyms
            if name.get("language") == "Chinese"
            and name.get("nameShort")
            and any("\u4e00" <= character <= "\u9fff" for character in name["nameShort"])
        ]
        if not chinese_names:
            continue
        coordinates = feature.get("geometry", {}).get("coordinates", [])
        if len(coordinates) < 2:
            continue
        city = {
            "cityId": str(next(
                (name.get("cityID") for name in toponyms if name.get("cityID") is not None),
                "",
            )),
            "cityName": sorted(set(chinese_names))[0],
            "latitude": float(coordinates[1]),
            "longitude": float(coordinates[0]),
        }
        for name in toponyms:
            if name.get("language") != "English" or not name.get("nameShort"):
                continue
            key = normalize_name(name["nameShort"])
            if key and not any(item["cityId"] == city["cityId"] for item in by_english_name[key]):
                by_english_name[key].append(city)
    return by_english_name


def read_wikidata_geonames_chinese_names(path: Path) -> dict[str, str]:
    labels: dict[str, set[str]] = defaultdict(set)
    with path.open(encoding="utf-8", newline="") as stream:
        for fields in csv.reader(stream, delimiter="\t"):
            if len(fields) < 2 or fields[0] in {"?geonameId", "geonameId"}:
                continue
            geoname_id = fields[0].strip().strip('"')
            label = re.sub(r"@zh(?:-[A-Za-z0-9-]+)?$", "", fields[1]).strip().strip('"')
            if geoname_id.isdigit() and label and any(
                "\u4e00" <= character <= "\u9fff" for character in label
            ):
                labels[geoname_id].add(label)
    return {
        geoname_id: next(iter(names))
        for geoname_id, names in labels.items()
        if len(names) == 1
    }


def read_wikidata_wup_candidates(path: Path) -> dict[str, list[dict]]:
    by_english_name: dict[str, list[dict]] = defaultdict(list)
    with path.open(encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream, delimiter="\t"):
            english = strip_language_tag(row.get("?en", ""))
            chinese = strip_language_tag(row.get("?zh", ""))
            point = row.get("?coord", "")
            if not english or not chinese or not point:
                continue
            coordinates = re.search(
                r"POINT\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)",
                point,
            )
            if not coordinates or not any(
                "\u4e00" <= character <= "\u9fff" for character in chinese
            ):
                continue
            candidate = {
                "englishName": english,
                "cityName": chinese,
                "latitude": float(coordinates.group(2)),
                "longitude": float(coordinates.group(1)),
                "geonameId": (
                    ""
                    if row.get("?geonameId", "") in {"", "UNDEF"}
                    else row.get("?geonameId", "").strip('"')
                ),
            }
            key = normalize_name(english)
            if key and candidate not in by_english_name[key]:
                by_english_name[key].append(candidate)
    return by_english_name


def read_osm_wup_candidates(path: Path) -> dict[str, list[dict]]:
    by_english_name: dict[str, list[dict]] = defaultdict(list)
    with path.open(encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream, delimiter="\t"):
            english = row.get("?en", "").strip('"')
            chinese = re.split(r"[;/]", row.get("?zh", "").strip('"'), maxsplit=1)[0].strip()
            osm_id = row.get("?osm", "").strip("<>")
            point = row.get("?geometry", "").strip('"')
            if not english or not chinese or not osm_id or not point:
                continue
            coordinates = re.search(
                r"^\s*POINT\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)\s*$",
                point,
            )
            if not coordinates or not any(
                "\u4e00" <= character <= "\u9fff" for character in chinese
            ):
                continue
            candidate = {
                "osmId": osm_id,
                "englishName": english,
                "cityName": chinese,
                "latitude": float(coordinates.group(2)),
                "longitude": float(coordinates.group(1)),
            }
            key = normalize_name(english)
            if key and candidate not in by_english_name[key]:
                by_english_name[key].append(candidate)
    return by_english_name


def match_wikidata_wup_city(
    city: dict[str, str],
    by_english_name: dict[str, list[dict]],
) -> dict | None:
    candidates = {
        (item["cityName"], item["latitude"], item["longitude"], item["geonameId"]): item
        for variant in name_variants(city["City_Name"])
        for item in by_english_name.get(variant, [])
    }
    try:
        latitude = float(city["PWCent_Latitude"])
        longitude = float(city["PWCent_Longitude"])
    except (KeyError, ValueError):
        return None
    scored = []
    for candidate in candidates.values():
        distance = distance_km(
            latitude,
            longitude,
            candidate["latitude"],
            candidate["longitude"],
        )
        if distance <= 50:
            scored.append((distance, candidate))
    scored.sort(key=lambda item: item[0])
    if not scored:
        return None
    if len(scored) > 1 and abs(scored[0][0] - scored[1][0]) < 1:
        return None
    return scored[0][1]


def match_osm_wup_city(
    city: dict[str, str],
    by_english_name: dict[str, list[dict]],
) -> dict | None:
    candidates = {
        item["osmId"]: item
        for variant in name_variants(city["City_Name"])
        for item in by_english_name.get(variant, [])
    }
    try:
        latitude = float(city["PWCent_Latitude"])
        longitude = float(city["PWCent_Longitude"])
    except (KeyError, ValueError):
        return None
    scored = []
    for candidate in candidates.values():
        distance = distance_km(
            latitude,
            longitude,
            candidate["latitude"],
            candidate["longitude"],
        )
        if distance <= 50:
            scored.append((distance, candidate))
    scored.sort(key=lambda item: item[0])
    if not scored:
        return None
    if len(scored) > 1 and abs(scored[0][0] - scored[1][0]) < 1:
        return None
    return scored[0][1]


def match_ungegn_city(
    city: dict[str, str],
    by_english_name: dict[str, list[dict]],
) -> dict | None:
    variants = name_variants(city["City_Name"])
    candidates = {
        candidate["cityId"]: candidate
        for variant in variants
        for candidate in by_english_name.get(variant, [])
    }
    try:
        latitude = float(city["PWCent_Latitude"])
        longitude = float(city["PWCent_Longitude"])
    except (KeyError, ValueError):
        return None
    scored = []
    for candidate in candidates.values():
        distance = distance_km(
            latitude,
            longitude,
            candidate["latitude"],
            candidate["longitude"],
        )
        if distance <= 50:
            scored.append((distance, candidate))
    scored.sort(key=lambda item: item[0])
    if not scored:
        return None
    if len(scored) > 1 and abs(scored[0][0] - scored[1][0]) < 1:
        return None
    return scored[0][1]


def reviewed_aliases(override: dict) -> list[str]:
    aliases = override.get("aliases", [])
    if not isinstance(aliases, list):
        raise ValueError("Reviewed aliases must be a JSON array")
    return sorted(
        {
            alias.strip()
            for alias in aliases
            if isinstance(alias, str) and alias.strip()
        }
    )


def localized_area_names(area_codes: list[str]) -> dict[str, str]:
    script = (
        "const codes=JSON.parse(require('fs').readFileSync(0,'utf8'));"
        "const d=new Intl.DisplayNames(['zh-CN'],{type:'region'});"
        "process.stdout.write(JSON.stringify(Object.fromEntries(codes.map(c=>[c,d.of(c)]))));"
    )
    result = __import__("subprocess").run(
        ["node", "-e", script],
        input=json.dumps(area_codes),
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(result.stdout)


def sort_records_by_pinyin(records: list[dict]) -> list[dict]:
    script = (
        "let rows='';process.stdin.setEncoding('utf8');"
        "process.stdin.on('data',chunk=>rows+=chunk);"
        "process.stdin.on('end',()=>{"
        "const data=JSON.parse(rows);"
        "const c=new Intl.Collator('zh-CN-u-co-pinyin',{sensitivity:'base'});"
        "data.sort((a,b)=>c.compare(a.cityName,b.cityName)"
        "||a.cityName.localeCompare(b.cityName)"
        "||a.latinName.localeCompare(b.latinName)"
        "||a.id.localeCompare(b.id));"
        "process.stdout.write(JSON.stringify(data));});"
    )
    result = __import__("subprocess").run(
        ["node", "-e", script],
        input=json.dumps(records, ensure_ascii=False),
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(result.stdout)


def stable_area(area_code: str) -> dict[str, str]:
    if area_code in SPECIAL_AREAS:
        return SPECIAL_AREAS[area_code]
    return {
        "id": area_code or "UN",
        "nameZh": "",
        "nameEn": "",
    }


def sort_areas_for_display(areas: list[dict]) -> list[dict]:
    def sort_key(area: dict) -> tuple[str, int, str]:
        if area["id"] == "CN":
            return "中国台湾", 0, area["id"]
        if area["id"] == "CN-TW":
            return "中国台湾", 1, area["id"]
        return area["nameZh"], 0, area["id"]

    return sorted(areas, key=sort_key)


def choose_chinese_name(candidates: list[dict[str, str]]) -> str:
    if not candidates:
        return ""
    priority = {"zh-CN": 0, "zh-Hans": 1, "zh": 2, "zh-Hant": 3}
    candidates.sort(
        key=lambda item: (
            priority.get(item["language"], 4),
            item["preferred"] != "1",
            item["short"] != "1",
            len(item["name"]),
            item["name"],
        )
    )
    return candidates[0]["name"]


def validate_catalog(wup_cities: list[dict[str, str]], areas: list[dict], cities: list[dict]) -> None:
    expected_keys = {
        city.get("catalogKey", city.get("wupKey", ""))
        for city in wup_cities
    }
    if len(expected_keys) != len(wup_cities):
        raise ValueError("Catalog source contains duplicate administrative/city keys")
    if len(cities) != len(wup_cities):
        raise ValueError(f"Expected {len(wup_cities)} cities, found {len(cities)}")
    city_ids = [city["id"] for city in cities]
    if len(city_ids) != len(set(city_ids)):
        raise ValueError("Catalog contains duplicate city IDs")
    expected_ids = {
        city.get("catalogId") or f"wup-{city['ISO3_Code'].lower()}-{city['City_Code']}"
        for city in wup_cities
    }
    if set(city_ids) != expected_ids:
        raise ValueError("Catalog city IDs do not exactly cover the WUP source keys")
    area_ids = {area["id"] for area in areas}
    grouped: dict[str, list[dict]] = defaultdict(list)
    for city in cities:
        if city["areaId"] not in area_ids:
            raise ValueError(f"City {city['id']} references an unknown area")
        if not city["cityName"].strip():
            raise ValueError(f"City {city['id']} has no display name")
        if not city["latinName"].strip() or not city["areaNameZh"] or not city["areaNameEn"]:
            raise ValueError(f"City {city['id']} is missing a required display field")
        if city["nameSource"] not in {
            "geonames",
            "geonames-nearest",
            "ungegn",
            "wikidata",
            "openstreetmap",
            "reviewed-override",
            "wup-original",
            "mca-administrative-code",
        }:
            raise ValueError(f"City {city['id']} has an unsupported name source")
        if city["matchConfidence"] not in {"verified", "approximate", "unmatched"}:
            raise ValueError(f"City {city['id']} has an unsupported match confidence")
        if city["areaId"] == "CN":
            if (
                city["nameSource"] != "mca-administrative-code"
                or city["matchConfidence"] != "verified"
                or city.get("administrativeLevel")
                not in {"municipality", "prefecture-level-city"}
                or not re.fullmatch(r"\d{4}00", city.get("administrativeCode", ""))
                or not city["cityName"].endswith("市")
                or not city.get("provinceName")
                or city.get("latinNameSource") != "hanyu-pinyin"
            ):
                raise ValueError(f"Mainland city {city['id']} is not a verified municipal unit")
        grouped[city["areaId"]].append(city)
    for group in grouped.values():
        group.sort(key=lambda city: int(city["serial"]))
        for index, city in enumerate(group, start=1):
            if city["serial"] != str(index).zfill(2):
                raise ValueError(f"City {city['id']} has an invalid area sequence")

    expected_political_labels = {
        "CN": ("中国大陆", "MAINLAND CHINA"),
        "CN-HK": ("中国香港", "HONG KONG · CHINA"),
        "CN-MO": ("中国澳门", "MACAO · CHINA"),
        "CN-TW": ("中国台湾", "TAIWAN · CHINA"),
    }
    actual_areas = {area["id"]: area for area in areas}
    for area_id, labels in expected_political_labels.items():
        area = actual_areas.get(area_id)
        if not area or (area["nameZh"], area["nameEn"]) != labels:
            raise ValueError(f"Area {area_id} does not use the approved display labels")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wup-xlsx", required=True, type=Path)
    parser.add_argument("--mainland-city-units-json", required=True, type=Path)
    parser.add_argument("--geonames-cities-zip", required=True, action="append", type=Path)
    parser.add_argument("--geonames-alternates-dir", required=True, type=Path)
    parser.add_argument("--ungegn-cities-json", type=Path)
    parser.add_argument("--wikidata-geonames-zh-tsv", type=Path)
    parser.add_argument("--wikidata-wup-zh-tsv", type=Path)
    parser.add_argument("--osm-wup-zh-tsv", type=Path)
    parser.add_argument("--name-overrides", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--quality-report", "--unresolved", dest="quality_report", type=Path)
    args = parser.parse_args()

    overrides = {}
    if args.name_overrides and args.name_overrides.exists():
        overrides = json.loads(args.name_overrides.read_text(encoding="utf-8"))

    all_wup_cities = read_wup_cities(args.wup_xlsx)
    mainland_city_units = read_mainland_city_units(args.mainland_city_units_json)
    wup_cities = [city for city in all_wup_cities if city["ISO2_Code"] != "CN"]
    catalog_source_cities = [*wup_cities, *mainland_city_units]
    by_country_name, grids, geonames_records = read_geonames_cities(
        args.geonames_cities_zip,
        wup_cities,
    )
    alternate_chinese_names, alternate_english_names = read_geonames_alternates(
        args.geonames_alternates_dir,
        set(geonames_records),
    )
    add_geonames_english_aliases(
        by_country_name,
        geonames_records,
        alternate_english_names,
    )
    matches: dict[str, tuple[dict | None, str]] = {
        city["wupKey"]: match_geoname(city, by_country_name, grids)
        for city in wup_cities
    }
    ungegn_cities = (
        read_ungegn_cities(args.ungegn_cities_json)
        if args.ungegn_cities_json
        else {}
    )
    wikidata_chinese_names = (
        read_wikidata_geonames_chinese_names(args.wikidata_geonames_zh_tsv)
        if args.wikidata_geonames_zh_tsv
        else {}
    )
    wikidata_wup_candidates = (
        read_wikidata_wup_candidates(args.wikidata_wup_zh_tsv)
        if args.wikidata_wup_zh_tsv
        else {}
    )
    wikidata_wup_matches = {
        city["wupKey"]: match_wikidata_wup_city(city, wikidata_wup_candidates)
        for city in wup_cities
    }
    wikidata_candidate_owners: dict[tuple, list[str]] = defaultdict(list)
    for wup_key, candidate in wikidata_wup_matches.items():
        if candidate:
            candidate_key = (
                ("geoname", candidate["geonameId"])
                if candidate["geonameId"]
                else (
                    candidate["englishName"],
                    candidate["cityName"],
                    candidate["latitude"],
                    candidate["longitude"],
                )
            )
            wikidata_candidate_owners[candidate_key].append(wup_key)
    for wup_key, candidate in list(wikidata_wup_matches.items()):
        if not candidate:
            continue
        candidate_key = (
            ("geoname", candidate["geonameId"])
            if candidate["geonameId"]
            else (
                candidate["englishName"],
                candidate["cityName"],
                candidate["latitude"],
                candidate["longitude"],
            )
        )
        if len(wikidata_candidate_owners[candidate_key]) > 1:
            wikidata_wup_matches[wup_key] = None
    osm_wup_candidates = (
        read_osm_wup_candidates(args.osm_wup_zh_tsv)
        if args.osm_wup_zh_tsv
        else {}
    )
    osm_wup_matches = {
        city["wupKey"]: match_osm_wup_city(city, osm_wup_candidates)
        for city in wup_cities
    }
    osm_candidate_owners: dict[str, list[str]] = defaultdict(list)
    for wup_key, candidate in osm_wup_matches.items():
        if candidate:
            osm_candidate_owners[candidate["osmId"]].append(wup_key)
    for wup_key, candidate in list(osm_wup_matches.items()):
        if candidate and len(osm_candidate_owners[candidate["osmId"]]) > 1:
            osm_wup_matches[wup_key] = None

    area_codes = sorted({city["ISO2_Code"] for city in catalog_source_cities})
    translated_names = localized_area_names(area_codes)
    quality_issues: list[dict[str, str]] = []
    cities_by_area: dict[str, list[dict]] = defaultdict(list)
    area_metadata: dict[str, dict[str, str]] = {}

    for city in wup_cities:
        area_code = city["ISO2_Code"]
        special = stable_area(area_code)
        area_id = special["id"]
        if area_code in SPECIAL_AREAS:
            area_name_zh = special["nameZh"]
            area_name_en = special["nameEn"]
        else:
            area_name_zh = translated_names.get(area_code, "")
            area_name_en = city["Location"].upper()
            if not area_name_zh or area_name_zh == area_code:
                area_name_zh = city["Location"]
        area_metadata[area_id] = {
            "id": area_id,
            "nameZh": area_name_zh,
            "nameEn": area_name_en,
            "sourceNameEn": city["Location"],
        }

        match, match_method = matches[city["wupKey"]]
        match_confidence = (
            "verified" if match_method == "exact-name" else "approximate" if match else "unmatched"
        )
        if not match:
            match = nearest_geoname_candidate(city, grids)
            if match:
                match_method = "nearest-geoname"
                match_confidence = "approximate"
        ungegn_match = match_ungegn_city(city, ungegn_cities) if ungegn_cities else None
        wikidata_wup_match = wikidata_wup_matches[city["wupKey"]]
        osm_wup_match = osm_wup_matches[city["wupKey"]]
        override = overrides.get(city["wupKey"], {})
        matched_aliases = (
            alternate_chinese_names.get(match["geonameId"], [])
            if match
            else []
        )
        wikidata_name = (
            wikidata_chinese_names.get(match["geonameId"])
            if match
            else None
        )
        geonames_name = choose_chinese_name(matched_aliases)
        if override.get("cityName"):
            city_name = override["cityName"]
            city_name_source = "reviewed-override"
        elif ungegn_match:
            city_name = ungegn_match["cityName"]
            city_name_source = "ungegn"
        elif geonames_name:
            city_name = geonames_name
            city_name_source = (
                "geonames-nearest"
                if match_method == "nearest-geoname"
                else "geonames"
            )
        elif wikidata_name:
            city_name = wikidata_name
            city_name_source = "wikidata"
        elif wikidata_wup_match:
            city_name = wikidata_wup_match["cityName"]
            city_name_source = "wikidata"
        elif osm_wup_match:
            city_name = osm_wup_match["cityName"]
            city_name_source = "openstreetmap"
        else:
            city_name = city["City_Name"]
            city_name_source = "wup-original"

        if (
            override.get("cityName")
            or ungegn_match
            or wikidata_wup_match
            or osm_wup_match
        ):
            match_confidence = "verified"
        if city_name_source == "wup-original":
            quality_issues.append(
                {
                    "wupKey": city["wupKey"],
                    "country": city["Location"],
                    "cityName": city_name,
                    "issue": (
                        "original-wup-name-used-without-chinese-translation"
                        if not any("\u4e00" <= character <= "\u9fff" for character in city_name)
                        else "original-wup-name-used"
                    ),
                    "matchMethod": match_method,
                    "matchConfidence": match_confidence,
                }
            )
        elif match_confidence != "verified":
            quality_issues.append(
                {
                    "wupKey": city["wupKey"],
                    "country": city["Location"],
                    "cityName": city_name,
                    "issue": "approximate-city-entity-match",
                    "matchMethod": match_method,
                    "matchConfidence": match_confidence,
                }
            )

        aliases = {
            alias
            for alias in reviewed_aliases(override)
            if alias != city_name
        }
        record = {
            "id": f"wup-{city['ISO3_Code'].lower()}-{city['City_Code']}",
            "cityName": city_name,
            "latinName": override.get("latinName") or city["City_Name"],
            "areaId": area_id,
            "areaNameZh": area_name_zh,
            "areaNameEn": area_name_en,
            "serial": "",
            "aliases": sorted(aliases),
            "matchConfidence": match_confidence,
        }
        record["nameSource"] = city_name_source
        cities_by_area[area_id].append(record)

    mainland_area = stable_area("CN")
    area_metadata[mainland_area["id"]] = {
        **mainland_area,
        "sourceNameEn": "China",
    }
    for city in mainland_city_units:
        cities_by_area["CN"].append(
            {
                "id": city["catalogId"],
                "cityName": city["City_Name"],
                "latinName": city["latinName"],
                "areaId": "CN",
                "areaNameZh": mainland_area["nameZh"],
                "areaNameEn": mainland_area["nameEn"],
                "serial": "",
                "aliases": [],
                "nameSource": "mca-administrative-code",
                "matchConfidence": "verified",
                "latinNameSource": "hanyu-pinyin",
                "administrativeCode": city["City_Code"],
                "administrativeLevel": city["administrativeLevel"],
                "provinceCode": city["provinceCode"],
                "provinceName": city["provinceName"],
            }
        )

    if args.quality_report:
        args.quality_report.parent.mkdir(parents=True, exist_ok=True)
        args.quality_report.write_text(
            json.dumps(quality_issues, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    records: list[dict] = []
    for area_id, group in cities_by_area.items():
        ordered = sort_records_by_pinyin(group)
        for index, record in enumerate(ordered, start=1):
            record["serial"] = str(index).zfill(2)
            records.append(record)
    records.sort(key=lambda item: (item["areaNameZh"], item["areaId"], int(item["serial"])))
    areas = sort_areas_for_display(list(area_metadata.values()))
    validate_catalog(catalog_source_cities, areas, records)

    catalog = {
        "version": "wup-2025-f21-mca-mainland-v4",
        "sources": [
            {
                "name": "Ministry of Civil Affairs administrative division codes, mainland municipalities and prefecture-level cities",
                "url": "https://dmfw.mca.gov.cn/XzqhVersionPublish.html",
                "license": "Official administrative-code database; no separate license statement",
                "citation": "Data cutoff 2025-12-31. Mainland China includes only 4 municipalities and 293 units whose official administrative type is 地级市. Latin display names are toneless Hanyu Pinyin transliterations of the official Chinese names.",
            },
            {
                "name": "United Nations World Urbanization Prospects 2025, Cities table F21",
                "url": "https://population.un.org/wup/assets/Download/Cities/WUP2025-F21-DEGURBA-Cities_Pop.xlsx",
                "license": "CC BY 3.0 IGO",
                "citation": "United Nations, Department of Economic and Social Affairs, Population Division (2025). World Urbanization Prospects: The 2025 Revision, Online Edition.",
            },
            *[
                {
                    "name": f"GeoNames {path.stem}",
                    "url": f"https://download.geonames.org/export/dump/{path.name}",
                    "license": "CC BY 4.0",
                }
                for path in args.geonames_cities_zip
            ],
            {
                "name": "GeoNames alternate names",
                "url": "https://download.geonames.org/export/dump/alternatenames/",
                "license": "CC BY 4.0",
            },
            *(
                [
                    {
                        "name": "UNGEGN World Geographical Names API",
                        "url": "https://ungegn-api.azurewebsites.net/API/GetAllCities",
                        "license": "Open Access",
                        "citation": "United Nations Group of Experts on Geographical Names, World Geographical Names Database, public read-only API.",
                    }
                ]
                if args.ungegn_cities_json
                else []
            ),
            *(
                [
                    {
                        "name": "Wikidata Chinese labels linked by GeoNames identifier",
                        "url": "https://qlever.dev/api/wikidata",
                        "license": "CC0",
                        "citation": "Wikidata data queried through the QLever Wikidata endpoint; only a unique Chinese label per GeoNames identifier is accepted.",
                    }
                ]
                if args.wikidata_geonames_zh_tsv
                else []
            ),
            *(
                [
                    {
                        "name": "Wikidata English/Chinese city labels and coordinates",
                        "url": "https://qlever.dev/api/wikidata",
                        "license": "CC0",
                        "citation": "Wikidata data queried through the QLever Wikidata endpoint; an exact WUP English label or alias and a unique nearest coordinate within 50 km of the WUP centroid are required. Chinese labels are preferred; a Chinese alias is accepted only when it is the sole alias for that entity.",
                    }
                ]
                if args.wikidata_wup_zh_tsv
                else []
            ),
            *(
                [
                    {
                        "name": "OpenStreetMap city/town name:en and name:zh tags via QLever OSM Planet",
                        "url": "https://www.openstreetmap.org/copyright",
                        "license": "ODbL-1.0",
                        "citation": "© OpenStreetMap contributors. OSM Planet snapshot indexed by QLever; exact English name and unique nearest point within 50 km of the WUP centroid are required.",
                    }
                ]
                if args.osm_wup_zh_tsv
                else []
            ),
        ],
        "areas": areas,
        "cities": records,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(
        f"Wrote {len(records)} cities in {len(catalog['areas'])} areas to {args.output}; "
        f"{len(quality_issues)} quality warnings"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
