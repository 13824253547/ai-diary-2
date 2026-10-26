# City Stamp Catalog

The target catalog boundary is all 16,828 city records in the United Nations
World Urbanization Prospects 2025 Cities table F21 across 194 countries and
areas. WUP 2025 defines cities as contiguous areas with at least 50,000
inhabitants and a density of at least 1,500 inhabitants per square kilometre.
The bundled JSON must not be considered complete until the builder resolves
every WUP row and the unresolved report is empty.

## Sources and attribution

- UN DESA Population Division, *World Urbanization Prospects: The 2025
  Revision*, Cities table F21. Data workbook:  
  https://population.un.org/wup/assets/Download/Cities/WUP2025-F21-DEGURBA-Cities_Pop.xlsx
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

The UN workbook identifies each WUP city by its country/area and city code and
provides the centroid used for geographic matching. GeoNames supplies candidate
Chinese names. Only aliases explicitly entered in `name-overrides.json` are
used for diary unlocking; other GeoNames alternate names are not treated as
verified aliases. The generated catalog retains the UN city spelling and area
as its primary English values. Unresolved city names and area labels must be
reviewed before a catalog can be generated. Cross-border WUP records must not
be given aliases for their constituent cities.

## Build inputs

Download the WUP workbook, GeoNames `cities500.zip`, `cities1000.zip` and
`allCountries.zip`, the UNGEGN API response as JSON, the two Wikidata TSV query
results, the OSM candidate TSV, and the GeoNames alternate-name data. The alternate-name country
extracts are available at:

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
  --unresolved /path/to/city-stamp-unresolved.json
```

The build uses Python's standard library to parse the source archives and
Node.js `Intl` for Simplified Chinese region display names and pinyin sorting.
Stable city IDs are based on the WUP ISO3 area code and City_Code. Sequence
numbers are product display order, padded to at least two digits, and restart
within each displayed country/area.

The builder fails closed when a WUP city has no Chinese name or reliable
GeoNames/UNGEGN/Wikidata/OSM match, unless a reviewed city-name override
explicitly covers it. Conflicting source labels and ambiguous nearest-city
matches are not guessed. Add a reviewed spelling to `name-overrides.json` and
rebuild; do not replace a missing Chinese name with the English name.

The distributed catalog records source URLs, licenses, and citations in its
metadata. The city browser directly displays OpenStreetMap contributor
attribution and an ODbL notice when the catalog includes OSM-derived names; a
source panel lists the catalog's complete citations, licenses, and links. The
catalog/database is treated as ODbL-1.0 when it contains OSM-derived data; this
does not relicense the application code. The Hong Kong, Macao and Taiwan
display labels are explicit policy overrides and are not inferred from
geographic name sources. Their product labels are `中国香港` /
`HONG KONG · CHINA`, `中国澳门` / `MACAO · CHINA`, and `中国台湾` /
`TAIWAN · CHINA`.
