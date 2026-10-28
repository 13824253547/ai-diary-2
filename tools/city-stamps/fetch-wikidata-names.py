#!/usr/bin/env python3
"""Fetch exact English-label/alias and Chinese city-name candidates for WUP."""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ENDPOINT = "https://qlever.dev/api/wikidata"
USER_AGENT = "OrangeGlowCityCatalog/1.0 (local data research)"


def literal_value(value: str) -> str:
    value = value.strip()
    value = re.sub(r"@[A-Za-z]+(?:-[A-Za-z0-9]+)*$", "", value)
    return value.strip('"')


def load_builder(path: Path):
    spec = importlib.util.spec_from_file_location("city_stamp_builder", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load city catalog builder: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sparql_literal(value: str) -> str:
    return f"{json.dumps(value, ensure_ascii=False)}@en"


def build_query(names: list[str]) -> str:
    values = " ".join(sparql_literal(name) for name in names)
    return (
        "SELECT ?item ?en ?zh ?zhKind ?coord ?geonameId WHERE { "
        f"VALUES ?en {{ {values} }} "
        "?item <http://www.wikidata.org/prop/direct/P625> ?coord . "
        "{ ?item <http://www.w3.org/2000/01/rdf-schema#label> ?zh . "
        'BIND("label" AS ?zhKind) } UNION '
        "{ ?item <http://www.w3.org/2004/02/skos/core#altLabel> ?zh . "
        'BIND("alias" AS ?zhKind) } '
        "{ ?item <http://www.w3.org/2000/01/rdf-schema#label> ?en } UNION "
        "{ ?item <http://www.w3.org/2004/02/skos/core#altLabel> ?en } "
        "OPTIONAL { ?item <http://www.wikidata.org/prop/direct/P1566> ?geonameId } "
        'FILTER(LANG(?en) = "en" && LANGMATCHES(LANG(?zh), "zh")) }'
    )


def fetch_query(query: str, timeout: int, retries: int) -> str:
    body = urllib.parse.urlencode(
        {"query": query, "action": "tsv_export"}
    ).encode("utf-8")
    request = urllib.request.Request(
        ENDPOINT,
        data=body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": USER_AGENT,
        },
    )
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read().decode("utf-8")
        except urllib.error.HTTPError as error:
            if error.code not in {429, 500, 502, 503, 504} or attempt == retries:
                raise
            retry_after = error.headers.get("Retry-After")
            delay = int(retry_after) if retry_after and retry_after.isdigit() else min(
                60, 2 ** attempt
            )
            print(
                f"QLever HTTP {error.code}; retrying in {delay}s",
                file=sys.stderr,
            )
            time.sleep(delay)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            if attempt == retries:
                raise
            delay = min(60, 2 ** attempt)
            print(
                f"QLever network error ({error}); retrying in {delay}s",
                file=sys.stderr,
            )
            time.sleep(delay)
    raise RuntimeError("Wikidata query retries exhausted")


def select_unresolved_cities(cities: list[dict[str, str]], path: Path) -> list[dict[str, str]]:
    unresolved = json.loads(path.read_text(encoding="utf-8"))
    wanted_keys = {row["wupKey"] for row in unresolved}
    cities_by_key = {city["wupKey"]: city for city in cities}
    missing_keys = wanted_keys - cities_by_key.keys()
    if missing_keys:
        raise ValueError(f"Unresolved report contains unknown WUP keys: {sorted(missing_keys)[:5]}")
    return [city for city in cities if city["wupKey"] in wanted_keys]


def read_existing_candidates(path: Path) -> set[tuple[str, str, str, str]]:
    records: set[tuple[str, str, str, str]] = set()
    with path.open(encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream, delimiter="\t"):
            english = literal_value(row.get("?en", "").removesuffix("@en"))
            chinese = literal_value(row.get("?zh", ""))
            point = row.get("?coord", "")
            geoname_id = row.get("?geonameId", "").strip('"')
            if english and chinese and point:
                records.add((english, chinese, point, geoname_id))
    return records


def read_query_candidates(response: str) -> set[tuple[str, str, str, str]]:
    names_by_entity: dict[
        tuple[str, str, str, str],
        dict[str, set[str]],
    ] = {}
    for row in csv.DictReader(response.splitlines(), delimiter="\t"):
        item = row.get("?item", "").strip("<>")
        english = literal_value(row.get("?en", "").removesuffix("@en"))
        chinese = literal_value(row.get("?zh", ""))
        point = row.get("?coord", "")
        geoname_id = row.get("?geonameId", "").strip('"')
        kind = row.get("?zhKind", "").strip('"')
        if (
            not item
            or not english
            or not chinese
            or not point
            or kind not in {"label", "alias"}
            or not any("\u4e00" <= character <= "\u9fff" for character in chinese)
        ):
            continue
        entity_key = (item, english, point, geoname_id)
        names_by_entity.setdefault(entity_key, {"label": set(), "alias": set()})[
            kind
        ].add(chinese)

    records: set[tuple[str, str, str, str]] = set()
    for (_, english, point, geoname_id), names in names_by_entity.items():
        labels = names["label"]
        aliases = names["alias"]
        selected_names = labels if labels else aliases
        if len(selected_names) == 1:
            records.add((english, next(iter(selected_names)), point, geoname_id))
    return records


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wup-xlsx", required=True, type=Path)
    parser.add_argument("--builder", default=Path(__file__).with_name("build-catalog.py"), type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--unresolved-json", type=Path)
    parser.add_argument("--existing-tsv", type=Path)
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--limit-cities", type=int)
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--retries", type=int, default=5)
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 2000:
        parser.error("--batch-size must be between 1 and 2000")

    builder = load_builder(args.builder)
    cities = builder.read_wup_cities(args.wup_xlsx)
    if args.unresolved_json:
        cities = select_unresolved_cities(cities, args.unresolved_json)
    if args.limit_cities is not None:
        if args.limit_cities < 1:
            parser.error("--limit-cities must be positive")
        cities = cities[:args.limit_cities]
    unique_names = sorted({city["City_Name"] for city in cities})
    batches = [
        unique_names[index:index + args.batch_size]
        for index in range(0, len(unique_names), args.batch_size)
    ]
    records = (
        read_existing_candidates(args.existing_tsv)
        if args.existing_tsv
        else set()
    )

    for index, names in enumerate(batches, start=1):
        response = fetch_query(build_query(names), args.timeout, args.retries)
        records.update(read_query_candidates(response))
        print(f"Queried {index}/{len(batches)} name batches", file=sys.stderr)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, delimiter="\t", lineterminator="\n")
        writer.writerow(["?en", "?zh", "?coord", "?geonameId"])
        writer.writerows(sorted(records))
    print(f"Wrote {len(records)} candidate labels to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
