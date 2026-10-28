#!/usr/bin/env python3
"""Fetch official prefecture-level city and municipality units from MCA."""

from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path
from typing import Callable

API_URL = "https://dmfw.mca.gov.cn/xzqh/getList"
SOURCE_URL = "https://dmfw.mca.gov.cn/XzqhVersionPublish.html"
SOURCE_DATA_AS_OF = "2025-12-31"
USER_AGENT = "OrangeGlowCityCatalog/1.0 (administrative unit catalog)"
MAINLAND_EXCLUDED_PROVINCE_CODES = {"81", "82"}


def padded_code(code: str) -> str:
    if not code.isdigit() or len(code) not in {2, 4, 6}:
        raise ValueError(f"Invalid Ministry of Civil Affairs code: {code!r}")
    return code.ljust(6, "0")


def pinyin_transliterator() -> Callable[[str], str]:
    try:
        from pypinyin import Style, lazy_pinyin
    except ImportError as error:
        raise RuntimeError(
            "Install pypinyin==0.55.0 to generate Hanyu Pinyin display names"
        ) from error

    def transliterate(city_name: str) -> str:
        base_name = city_name.removesuffix("市")
        syllables = lazy_pinyin(base_name, style=Style.NORMAL, strict=False)
        value = "".join(syllables).capitalize()
        if not value or not value.isascii() or not value.isalpha():
            raise ValueError(f"Could not romanize official city name {city_name!r}")
        return value

    return transliterate


def make_record(
    node: dict,
    province: dict,
    admin_level: str,
    transliterate: Callable[[str], str],
) -> dict[str, str]:
    name = str(node.get("name") or "").strip()
    if not name.endswith("市"):
        raise ValueError(f"Expected an official city unit name, got {name!r}")
    return {
        "code": padded_code(str(node.get("code") or "")),
        "cityName": name,
        "latinName": transliterate(name),
        "latinNameSource": "Hanyu Pinyin, toneless transliteration",
        "provinceCode": padded_code(str(province.get("code") or "")),
        "provinceName": str(province.get("name") or "").strip(),
        "administrativeLevel": admin_level,
    }


def collect_mainland_city_units(
    root: dict,
    transliterate: Callable[[str], str],
    expected_count: int | None = 297,
) -> list[dict[str, str]]:
    if root.get("level") != 0 or not isinstance(root.get("children"), list):
        raise ValueError("MCA response must contain the level-0 administrative root")

    records = []
    for province in root["children"]:
        province_code = str(province.get("code") or "")
        if province_code in MAINLAND_EXCLUDED_PROVINCE_CODES:
            continue

        if province.get("type") == "直辖市":
            records.append(
                make_record(province, province, "municipality", transliterate)
            )

        for unit in province.get("children") or []:
            if unit.get("type") != "地级市":
                continue
            records.append(
                make_record(unit, province, "prefecture-level-city", transliterate)
            )

    records.sort(key=lambda city: city["code"])
    codes = [city["code"] for city in records]
    if len(codes) != len(set(codes)):
        raise ValueError("MCA source contains duplicate city administrative codes")
    if expected_count is not None and len(records) != expected_count:
        raise ValueError(
            f"Expected {expected_count} mainland city-level units, found {len(records)}"
        )
    if expected_count == 297 and (
        sum(city["administrativeLevel"] == "municipality" for city in records) != 4
        or sum(city["administrativeLevel"] == "prefecture-level-city" for city in records) != 293
    ):
        raise ValueError("Expected 4 municipalities and 293 prefecture-level cities")
    return records


def fetch_tree(timeout: int) -> dict:
    query = "code=0&trimCode=true&maxLevel=3"
    request = urllib.request.Request(
        f"{API_URL}?{query}",
        headers={
            "Accept": "application/json",
            "Referer": SOURCE_URL,
            "User-Agent": USER_AGENT,
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), dict):
        raise ValueError("MCA administrative-code API returned an unexpected payload")
    return payload["data"]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--timeout", type=int, default=60)
    args = parser.parse_args()

    records = collect_mainland_city_units(
        fetch_tree(args.timeout),
        pinyin_transliterator(),
    )
    payload = {
        "source": SOURCE_URL,
        "sourceDataAsOf": SOURCE_DATA_AS_OF,
        "selection": "4 municipalities and nodes with administrative type 地级市; excludes county-level units, autonomous prefectures, regions, leagues, Hong Kong and Macao",
        "latinNameSource": "Hanyu Pinyin transliteration generated with pypinyin 0.55.0; tone marks and 市 suffix omitted",
        "cities": records,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(records)} official mainland city units to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
