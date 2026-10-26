#!/usr/bin/env python3
"""Fetch OSM English/Chinese city-name candidates from the QLever OSM index."""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ENDPOINT = "https://qlever.dev/api/osm-planet"
USER_AGENT = "OrangeGlowCityCatalog/1.0 (local data research)"


def load_builder(path: Path):
    spec = importlib.util.spec_from_file_location("city_stamp_builder", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load city catalog builder: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build_query(names: list[str]) -> str:
    values = " ".join(json.dumps(name, ensure_ascii=False) for name in names)
    return (
        "PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:> "
        "PREFIX geo: <http://www.opengis.net/ont/geosparql#> "
        "SELECT ?osm ?en ?zh ?place ?geometry WHERE { "
        f"VALUES ?en {{ {values} }} "
        "?osm osmkey:name:en ?en ; osmkey:name:zh ?zh ; "
        "osmkey:place ?place ; geo:hasGeometry/geo:asWKT ?geometry . "
        'FILTER(?place = "city" || ?place = "town") '
        'FILTER(STRSTARTS(STR(?geometry), "POINT(")) }'
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
            if error.code != 429 or attempt == retries:
                raise
            retry_after = error.headers.get("Retry-After")
            delay = int(retry_after) if retry_after and retry_after.isdigit() else min(
                60, 2 ** attempt
            )
            print(f"QLever rate limit; retrying in {delay}s", file=sys.stderr)
            time.sleep(delay)
    raise RuntimeError("OSM query retries exhausted")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wup-xlsx", required=True, type=Path)
    parser.add_argument("--builder", default=Path(__file__).with_name("build-catalog.py"), type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--limit-cities", type=int)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--retries", type=int, default=5)
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 2000:
        parser.error("--batch-size must be between 1 and 2000")

    builder = load_builder(args.builder)
    cities = builder.read_wup_cities(args.wup_xlsx)
    if args.limit_cities is not None:
        if args.limit_cities < 1:
            parser.error("--limit-cities must be positive")
        cities = cities[:args.limit_cities]
    unique_names = sorted({city["City_Name"] for city in cities})
    batches = [
        unique_names[index:index + args.batch_size]
        for index in range(0, len(unique_names), args.batch_size)
    ]
    records: set[tuple[str, str, str, str, str]] = set()
    csv.field_size_limit(sys.maxsize)

    for index, names in enumerate(batches, start=1):
        response = fetch_query(build_query(names), args.timeout, args.retries)
        for row in csv.DictReader(response.splitlines(), delimiter="\t"):
            osm_id = row.get("?osm", "")
            english = row.get("?en", "").strip('"')
            chinese = row.get("?zh", "").strip('"')
            place = row.get("?place", "").strip('"')
            geometry = row.get("?geometry", "").strip('"')
            if osm_id and english and chinese and geometry:
                records.add((osm_id, english, chinese, place, geometry))
        print(f"Queried {index}/{len(batches)} name batches", file=sys.stderr)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, delimiter="\t", lineterminator="\n")
        writer.writerow(["?osm", "?en", "?zh", "?place", "?geometry"])
        writer.writerows(sorted(records))
    print(f"Wrote {len(records)} OSM name candidates to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
