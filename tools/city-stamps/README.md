# City Stamp Catalog

## Current audit status

The bundled runtime catalog is still a mixed legacy snapshot: 14,368
non-mainland WUP populated places plus 297 reviewed Mainland China
administrative city units, for 14,665 entries across 194 areas. It has not yet
been rebuilt to the approved global administrative-city scope. Do not use the
legacy builder below to regenerate the production catalog: its non-mainland
path still treats WUP rows as the catalog boundary.

The approved scope is official city-level or explicitly urban municipal units
for each area. WUP 2025 Cities table F21, GeoNames populated-place entries,
OSM place tags, and name suffixes may help discover candidates but do not prove
administrative status. Only source-verified units may be published; unresolved
areas and candidates belong in `area-audit.json` and must not be backfilled
from WUP.

The ordered audit ledger is `area-audit.json`. Its order follows the current
runtime area array. `initialize-area-audit.py` generated its initial baseline
from the bundled catalog; it refuses to overwrite an existing ledger unless
`--force` supplied. Do not use `--force` after findings are added directly
to the ledger, because that recreates the initial baseline. Initial source
checks currently reach Liberia at position 31; the Central African Republic
at position 7 has an official administrative-hierarchy source but still lacks
city-category evidence, and other unchecked rows remain explicitly not
started.

Mainland China uses the reviewed Ministry of Civil Affairs hierarchy:
4 municipalities and 293 prefecture-level cities only. County-level cities,
counties, districts, towns, subdistricts, autonomous prefectures, regions, and
leagues are excluded.

## Sources and attribution

- UN DESA Population Division, *World Urbanization Prospects: The 2025
  Revision*, Cities table F21. Data workbook:  
  https://population.un.org/wup/assets/Download/Cities/WUP2025-F21-DEGURBA-Cities_Pop.xlsx
- Ministry of Civil Affairs administrative code database, data cutoff
  2025-12-31:
  https://dmfw.mca.gov.cn/XzqhVersionPublish.html
  The checked-in snapshot `mainland-city-units.json` includes only nodes with
  administrative type `直辖市` or `地级市`; its six-digit codes and official
  Chinese names are retained. Latin display names are toneless Hanyu Pinyin
  transliterations of those official names, generated with `pypinyin` 0.55.0.
- GeoNames `cities500`, `cities1000`, and optionally `allCountries` extracts.
  All are limited to populated-place features in spatial cells around WUP
  centroids; records are deduplicated by GeoNames ID and matched to the
  WUP-provided centroid. The WUP spelling remains the English display name:
  https://download.geonames.org/export/dump/cities500.zip
  https://download.geonames.org/export/dump/cities1000.zip
  https://download.geonames.org/export/dump/allCountries.zip
- GeoNames `alternateNamesV2` country extracts. The data is licensed under
  CC BY 4.0. Chinese aliases provide candidate display names and English
  aliases improve WUP-to-GeoNames entity matching; attribution is included in
  the application catalog metadata and the project's data documentation:
  https://download.geonames.org/export/dump/readme.txt
- UNGEGN World Geographical Names public read-only API. Its Chinese names are
  used only when an English-name and coordinate match is unambiguous; it is an
  additional names source, not a replacement for the WUP city boundary:
  https://ungegn-api.azurewebsites.net/API/GetAllCities
- Wikidata Chinese labels linked through the GeoNames identifier (P1566),
  queried from the public QLever Wikidata endpoint. This is a supplementary
  fallback only: the builder accepts a label only when a GeoNames city match
  exists and that identifier has exactly one Chinese label in the supplied
  result. Conflicting labels remain unresolved. Wikidata data is CC0:
  https://qlever.dev/api/wikidata
- Wikidata city labels and aliases are also queried directly by exact WUP
  English name with coordinates. Both `rdfs:label` and `skos:altLabel` are
  eligible English candidates; a unique nearest candidate within 50 km of the
  WUP centroid is required. A Chinese `rdfs:label` takes precedence; if none
  exists, only a single distinct Chinese `skos:altLabel` is accepted.
  Conflicts remain unresolved. Wikidata data is CC0:
  https://qlever.dev/api/wikidata
- OpenStreetMap `name:en` / `name:zh` tags from the QLever OSM Planet index.
  Candidates must be tagged as a city or town, match the WUP English name
  exactly after normalization, and have a POINT geometry that is the unique
  nearest point within 50 km of the WUP centroid. OSM-derived catalog data is
  attributed to OpenStreetMap contributors and released under ODbL-1.0. When a
  `name:zh` value lists alternatives separated by `/` or `;`, the first listed
  name is retained; the other values are not treated as unlock aliases:
  https://www.openstreetmap.org/copyright

The UN workbook identifies WUP populated places by country/area and city code
and provides centroids for candidate discovery and cross-checking. It does not
define the approved administrative-city roster. GeoNames and other geographic
name sources may help match names only after an official administrative unit
has been established. Mainland records use the MCA administrative code as
their stable identity. Only aliases explicitly entered in
`name-overrides.json` are used for diary unlocking; other GeoNames alternate
names are not treated as verified aliases. Cross-border WUP records must not be
given aliases for their constituent cities.

## Build inputs

Download the WUP workbook, GeoNames `cities500.zip`, `cities1000.zip` and
`allCountries.zip`, the UNGEGN API response as JSON, the two Wikidata TSV query
results, the OSM candidate TSV, and the GeoNames alternate-name data. The MCA
city-unit snapshot is checked in; refresh it from the official API with:

```sh
python3 -m pip install pypinyin==0.55.0
python3 tools/city-stamps/fetch-mainland-city-units.py \
  --output tools/city-stamps/mainland-city-units.json
```

The alternate-name country extracts are available at:

https://download.geonames.org/export/dump/alternatenames/

The GeoNames-linked Wikidata TSV is a reproducible query result from the QLever
endpoint. Its SPARQL query selects Chinese labels only for entities carrying
GeoNames identifier P1566:

```sparql
SELECT ?geonameId ?label WHERE {
  ?item <http://www.wikidata.org/prop/direct/P1566> ?geonameId ;
        <http://www.w3.org/2000/01/rdf-schema#label> ?label .
  FILTER(LANG(?label) = "zh")
}
```

To fetch the broader exact-English-name and coordinate candidates for the WUP
records, run the checked-in fetch utility. It queries in batches and honors
QLever rate-limit/server errors and transient network failures with backoff:

```sh
python3 tools/city-stamps/fetch-wikidata-names.py \
  --wup-xlsx /path/to/WUP2025-F21-DEGURBA-Cities_Pop.xlsx \
  --output /path/to/wikidata-wup-zh.tsv
```

For a supplementary run after an unresolved audit, `--unresolved-json` limits
queries to the listed WUP city keys and `--existing-tsv` preserves previously
collected candidates in the output:

```sh
python3 tools/city-stamps/fetch-wikidata-names.py \
  --wup-xlsx /path/to/WUP2025-F21-DEGURBA-Cities_Pop.xlsx \
  --unresolved-json /path/to/city-stamp-unresolved.json \
  --existing-tsv /path/to/wikidata-wup-zh.tsv \
  --output /path/to/wikidata-wup-expanded.tsv
```

Fetch the OSM English/Chinese city-name candidates from QLever OSM Planet:

```sh
python3 tools/city-stamps/fetch-osm-name-translations.py \
  --wup-xlsx /path/to/WUP2025-F21-DEGURBA-Cities_Pop.xlsx \
  --output /path/to/osm-wup-zh.tsv
```

Place the downloaded files outside the repository. Then run:

```sh
python3 tools/city-stamps/build-catalog.py \
  --wup-xlsx /path/to/WUP2025-F21-DEGURBA-Cities_Pop.xlsx \
  --mainland-city-units-json tools/city-stamps/mainland-city-units.json \
  --geonames-cities-zip /path/to/cities1000.zip \
  --geonames-cities-zip /path/to/cities500.zip \
  --geonames-cities-zip /path/to/allCountries.zip \
  --geonames-alternates-dir /path/to/geonames-alternatenames \
  --ungegn-cities-json /path/to/ungegn-cities.geojson \
  --wikidata-geonames-zh-tsv /path/to/wikidata-geonames-zh.tsv \
  --wikidata-wup-zh-tsv /path/to/wikidata-wup-zh.tsv \
  --osm-wup-zh-tsv /path/to/osm-wup-zh.tsv \
  --name-overrides tools/city-stamps/name-overrides.json \
  --output src/data/city-stamp-catalog.json \
  --quality-report /path/to/city-stamp-quality.json
```

This command currently runs the legacy mixed-scope builder and will reproduce
the non-mainland WUP rows. Do not use it to generate the approved global
administrative-city catalog until the reviewed `admin-city-units.json` input
and strict builder path are implemented.

The build uses Python's standard library to parse the source archives and
Node.js `Intl` for Simplified Chinese region display names and display-name
sorting. Non-mainland WUP city IDs use their ISO3 area code and City_Code;
Mainland city IDs use the official six-digit MCA administrative code. Sequence
numbers are product display order, padded to at least two digits, and restart
within each displayed country/area. Mainland names are sorted by Chinese
pinyin; other source names use the existing display-name order.

The legacy builder preserves every non-mainland WUP row and exactly the
reviewed 297 MCA Mainland city units. It prefers reviewed overrides,
UNGEGN, GeoNames, Wikidata, and OSM names. When exact name matching is
unavailable, it may use the nearest GeoNames candidate within 50 km and marks
the city `approximate`. If no candidate name is available, it uses the original
WUP city name and marks the city `unmatched` or retains the known entity
confidence as appropriate. Each row records `nameSource` and
`matchConfidence`; the quality report lists approximate matches and original
name fallbacks. These rules describe the existing legacy snapshot only; they
do not satisfy the newly approved administrative-city inclusion rule. The
replacement builder must take its non-mainland rows only from
`admin-city-units.json`, preserve parent-administration and source evidence,
and produce explicit gaps for anything not verified. Mainland Chinese names
and codes come from the MCA snapshot; Pinyin is explicitly marked as a
transliteration, not an official English exonym.

The distributed catalog records source URLs, licenses, and citations in its
metadata. The city browser directly displays OpenStreetMap contributor
attribution and an ODbL notice when the catalog includes OSM-derived names; a
user-facing source panel is intentionally omitted. The bundled metadata retains
the complete citations, licenses, and links. The catalog/database is treated
as ODbL-1.0 when it contains OSM-derived data; this
does not relicense the application code. The Hong Kong, Macao and Taiwan
display labels are explicit policy overrides and are not inferred from
geographic name sources. Their product labels are `中国香港` /
`HONG KONG · CHINA`, `中国澳门` / `MACAO · CHINA`, and `中国台湾` /
`TAIWAN · CHINA`. The `CN` area is displayed as `中国大陆` /
`MAINLAND CHINA` and sorts before `中国台湾`.
