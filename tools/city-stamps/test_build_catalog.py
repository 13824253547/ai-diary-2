import csv
from collections import defaultdict
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError


BUILDER_PATH = Path(__file__).with_name("build-catalog.py")
SPEC = importlib.util.spec_from_file_location("city_stamp_builder", BUILDER_PATH)
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)

MCA_FETCHER_SPEC = importlib.util.spec_from_file_location(
    "city_stamp_mca_fetcher",
    Path(__file__).with_name("fetch-mainland-city-units.py"),
)
MCA_FETCHER = importlib.util.module_from_spec(MCA_FETCHER_SPEC)
MCA_FETCHER_SPEC.loader.exec_module(MCA_FETCHER)

MCA_FETCHER_SPEC = importlib.util.spec_from_file_location(
    "city_stamp_mca_fetcher",
    Path(__file__).with_name("fetch-mainland-city-units.py"),
)
MCA_FETCHER = importlib.util.module_from_spec(MCA_FETCHER_SPEC)
MCA_FETCHER_SPEC.loader.exec_module(MCA_FETCHER)

OSM_FETCHER_SPEC = importlib.util.spec_from_file_location(
    "city_stamp_osm_fetcher",
    Path(__file__).with_name("fetch-osm-name-translations.py"),
)
OSM_FETCHER = importlib.util.module_from_spec(OSM_FETCHER_SPEC)
OSM_FETCHER_SPEC.loader.exec_module(OSM_FETCHER)

WIKIDATA_FETCHER_SPEC = importlib.util.spec_from_file_location(
    "city_stamp_wikidata_fetcher",
    Path(__file__).with_name("fetch-wikidata-names.py"),
)
WIKIDATA_FETCHER = importlib.util.module_from_spec(WIKIDATA_FETCHER_SPEC)
WIKIDATA_FETCHER_SPEC.loader.exec_module(WIKIDATA_FETCHER)


class MainlandCityUnitSourceTests(unittest.TestCase):
    def test_only_municipalities_and_prefecture_level_cities_are_selected(self):
        tree = {
            "level": 0,
            "children": [
                {
                    "code": "11",
                    "name": "北京市",
                    "type": "直辖市",
                    "children": [
                        {"code": "110101", "name": "东城区", "type": "市辖区"}
                    ],
                },
                {
                    "code": "44",
                    "name": "广东省",
                    "type": "省",
                    "children": [
                        {
                            "code": "4405",
                            "name": "汕头市",
                            "type": "地级市",
                            "children": [
                                {"code": "440507", "name": "龙湖区", "type": "市辖区"}
                            ],
                        },
                        {"code": "4452", "name": "揭阳市", "type": "地级市", "children": []},
                        {"code": "445222", "name": "揭西县", "type": "县"},
                        {"code": "4453", "name": "自治州示例", "type": "自治州"},
                    ],
                },
                {
                    "code": "81",
                    "name": "香港特别行政区",
                    "type": "特别行政区",
                    "children": [],
                },
            ],
        }

        cities = MCA_FETCHER.collect_mainland_city_units(
            tree,
            lambda name: name.removesuffix("市"),
            expected_count=3,
        )

        self.assertEqual(
            [(city["code"], city["cityName"], city["administrativeLevel"]) for city in cities],
            [
                ("110000", "北京市", "municipality"),
                ("440500", "汕头市", "prefecture-level-city"),
                ("445200", "揭阳市", "prefecture-level-city"),
            ],
        )


class WikidataNameSourceTests(unittest.TestCase):
    def test_fetch_query_accepts_exact_english_labels_and_aliases(self):
        query = WIKIDATA_FETCHER.build_query(["Kyoto"])

        self.assertIn('"Kyoto"@en', query)
        self.assertIn("http://www.w3.org/2004/02/skos/core#altLabel", query)
        self.assertIn('LANG(?en) = "en"', query)
        self.assertIn('LANGMATCHES(LANG(?zh), "zh")', query)
        self.assertIn("?zhKind", query)
        self.assertIn('BIND("label" AS ?zhKind)', query)
        self.assertIn('BIND("alias" AS ?zhKind)', query)

    def test_query_candidates_prefer_labels_and_only_use_unique_aliases(self):
        response = io.StringIO()
        writer = csv.writer(response, delimiter="\t", lineterminator="\n")
        writer.writerow(["?item", "?en", "?zh", "?zhKind", "?coord", "?geonameId"])
        writer.writerow(["<Q1>", '"Kyoto"@en', '"京都"@zh', '"label"', "POINT(135.7 35)", '"1"'])
        writer.writerow(["<Q1>", '"Kyoto"@en', '"京都市"@zh', '"alias"', "POINT(135.7 35)", '"1"'])
        writer.writerow(["<Q2>", '"Nara"@en', '"奈良"@zh', '"alias"', "POINT(135.8 34.7)", '"2"'])
        writer.writerow(["<Q3>", '"Osaka"@en', '"大阪"@zh', '"alias"', "POINT(135.5 34.7)", '"3"'])
        writer.writerow(["<Q3>", '"Osaka"@en', '"大坂"@zh', '"alias"', "POINT(135.5 34.7)", '"3"'])
        writer.writerow(["<Q4>", '"Lanzhou"@en', '"兰州"@zh-Hans', '"label"', "POINT(103.8 36.1)", '"4"'])
        writer.writerow(["<Q5>", '"Tainan"@en', '"台南"@zh-Hant', '"alias"', "POINT(120.2 23)", '"5"'])

        candidates = WIKIDATA_FETCHER.read_query_candidates(response.getvalue())

        self.assertEqual(
            candidates,
            {
                ("Kyoto", "京都", "POINT(135.7 35)", "1"),
                ("Nara", "奈良", "POINT(135.8 34.7)", "2"),
                ("Lanzhou", "兰州", "POINT(103.8 36.1)", "4"),
                ("Tainan", "台南", "POINT(120.2 23)", "5"),
            },
        )

    def test_fetch_retries_transient_server_errors(self):
        error = HTTPError("https://qlever.dev", 500, "Server Error", {}, None)
        response = io.BytesIO(b"?result\nok\n")
        with (
            patch.object(
                WIKIDATA_FETCHER.urllib.request,
                "urlopen",
                side_effect=[error, response],
            ),
            patch.object(WIKIDATA_FETCHER.time, "sleep") as sleep,
        ):
            result = WIKIDATA_FETCHER.fetch_query("SELECT {}", timeout=1, retries=1)

        self.assertEqual(result, "?result\nok\n")
        sleep.assert_called_once_with(1)

    def test_unresolved_filter_selects_only_wup_reported_city_keys(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "unresolved.json"
            path.write_text(
                json.dumps([{"wupKey": "JPN-1"}]),
                encoding="utf-8",
            )
            cities = [
                {"wupKey": "JPN-1", "City_Name": "Kyoto"},
                {"wupKey": "JPN-2", "City_Name": "Tokyo"},
            ]

            selected = WIKIDATA_FETCHER.select_unresolved_cities(cities, path)

        self.assertEqual(selected, [cities[0]])

    def test_existing_wikidata_candidates_are_preserved_when_merging(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "existing.tsv"
            path.write_text(
                '?en\t?zh\t?coord\t?geonameId\n'
                '"Kyoto"@en\t"京都"@zh\t"POINT(135.7 35.0)"\t"1857910"\n',
                encoding="utf-8",
            )

            records = WIKIDATA_FETCHER.read_existing_candidates(path)

        self.assertEqual(
            records,
            {("Kyoto", "京都", "POINT(135.7 35.0)", "1857910")},
        )

    def test_builder_reads_chinese_language_variants_without_suffix(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "wikidata.tsv"
            path.write_text(
                '?en\t?zh\t?coord\t?geonameId\n'
                '"Lanzhou"@en\t"兰州"@zh-Hans\t"POINT(103.8 36.1)"\t"4"\n',
                encoding="utf-8",
            )

            candidates = BUILDER.read_wikidata_wup_candidates(path)

        self.assertEqual(candidates["lanzhou"][0]["cityName"], "兰州")

    def test_mca_snapshot_contains_only_official_mainland_city_level_units(self):
        cities = BUILDER.read_mainland_city_units(
            Path(__file__).with_name("mainland-city-units.json")
        )
        by_name = {city["City_Name"]: city for city in cities}

        self.assertEqual(len(cities), 297)
        self.assertEqual(
            sum(city["administrativeLevel"] == "municipality" for city in cities),
            4,
        )
        self.assertEqual(
            sum(city["administrativeLevel"] == "prefecture-level-city" for city in cities),
            293,
        )
        self.assertEqual(by_name["汕头市"]["City_Code"], "440500")
        self.assertEqual(by_name["汕头市"]["latinName"], "Shantou")
        self.assertEqual(by_name["揭阳市"]["City_Code"], "445200")
        self.assertEqual(by_name["揭阳市"]["latinName"], "Jieyang")
        self.assertNotIn("揭西县", by_name)
        self.assertNotIn("普宁市", by_name)
        self.assertNotIn("东莞市辖区", by_name)

    def test_mca_tree_filter_excludes_counties_and_non_city_prefectures(self):
        tree = {
            "level": 0,
            "children": [
                {
                    "code": "11",
                    "name": "北京市",
                    "level": 1,
                    "type": "直辖市",
                    "children": [
                        {"code": "110101", "name": "东城区", "type": "市辖区"}
                    ],
                },
                {
                    "code": "44",
                    "name": "广东省",
                    "level": 1,
                    "type": "省",
                    "children": [
                        {
                            "code": "4405",
                            "name": "汕头市",
                            "type": "地级市",
                            "children": [
                                {"code": "440507", "name": "龙湖区", "type": "市辖区"}
                            ],
                        },
                        {"code": "4452", "name": "揭阳市", "type": "地级市", "children": []},
                        {"code": "445200", "name": "揭西县", "type": "县"},
                        {"code": "445300", "name": "某自治州", "type": "自治州"},
                    ],
                },
                {
                    "code": "81",
                    "name": "香港特别行政区",
                    "type": "特别行政区",
                    "children": [],
                },
            ],
        }

        cities = MCA_FETCHER.collect_mainland_city_units(
            tree,
            lambda name: name,
            expected_count=3,
        )

        self.assertEqual(
            [(city["code"], city["cityName"], city["administrativeLevel"]) for city in cities],
            [
                ("110000", "北京市", "municipality"),
                ("440500", "汕头市", "prefecture-level-city"),
                ("445200", "揭阳市", "prefecture-level-city"),
            ],
        )

    def test_geonames_english_alternate_name_is_indexed_to_its_entity(self):
        by_country_name = defaultdict(lambda: defaultdict(list))
        records_by_id = {
            "123": {
                "geonameId": "123",
                "name": "Bengaluru",
                "asciiName": "Bengaluru",
                "country": "IN",
            }
        }

        BUILDER.add_geonames_english_aliases(
            by_country_name,
            records_by_id,
            {"123": ["Bangalore"]},
        )

        self.assertEqual(
            by_country_name["IN"]["bangalore"][0]["geonameId"],
            "123",
        )

    def test_geonames_mapping_ignores_ambiguous_chinese_labels(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "geonames-labels.tsv"
            path.write_text(
                '?geonameId\t?label\n'
                '"123"\t"唯一名称"@zh\n'
                '"456"\t"候选一"@zh\n'
                '"456"\t"候选二"@zh\n',
                encoding="utf-8",
            )

            names = BUILDER.read_wikidata_geonames_chinese_names(path)

        self.assertEqual(names, {"123": "唯一名称"})

    def test_nearest_geoname_fallback_uses_closest_point_without_name_match(self):
        nearest = {
            "geonameId": "near",
            "latitude": 40.01,
            "longitude": -75,
        }
        farther = {
            "geonameId": "far",
            "latitude": 40.2,
            "longitude": -75,
        }
        grids = {
            "US": {
                (39, -76): [farther],
                (40, -75): [nearest],
            }
        }

        match = BUILDER.nearest_geoname_candidate(
            {
                "ISO2_Code": "US",
                "PWCent_Latitude": "40",
                "PWCent_Longitude": "-75",
            },
            grids,
        )

        self.assertEqual(match["geonameId"], "near")

    def test_catalog_validation_allows_original_wup_name_fallback(self):
        wup_cities = [
            {
                "wupKey": "USA-1",
                "ISO3_Code": "USA",
                "City_Code": "1",
            }
        ]
        areas = [
            {"id": "US", "nameZh": "美国", "nameEn": "UNITED STATES"},
            {"id": "CN", "nameZh": "中国大陆", "nameEn": "MAINLAND CHINA"},
            {"id": "CN-HK", "nameZh": "中国香港", "nameEn": "HONG KONG · CHINA"},
            {"id": "CN-MO", "nameZh": "中国澳门", "nameEn": "MACAO · CHINA"},
            {"id": "CN-TW", "nameZh": "中国台湾", "nameEn": "TAIWAN · CHINA"},
        ]
        cities = [
            {
                "id": "wup-usa-1",
                "cityName": "Example Town",
                "latinName": "Example Town",
                "areaId": "US",
                "areaNameZh": "美国",
                "areaNameEn": "UNITED STATES",
                "serial": "01",
                "aliases": [],
                "nameSource": "wup-original",
                "matchConfidence": "unmatched",
            }
        ]

        BUILDER.validate_catalog(wup_cities, areas, cities)

    def test_catalog_uses_mainland_china_area_label(self):
        self.assertEqual(
            BUILDER.stable_area("CN"),
            {"id": "CN", "nameZh": "中国大陆", "nameEn": "MAINLAND CHINA"},
        )

    def test_mainland_china_is_listed_before_taiwan(self):
        areas = [
            {"id": "CN-TW", "nameZh": "中国台湾"},
            {"id": "CN-MO", "nameZh": "中国澳门"},
            {"id": "CN", "nameZh": "中国大陆"},
        ]

        ordered = BUILDER.sort_areas_for_display(areas)
        ids = [area["id"] for area in ordered]

        self.assertLess(ids.index("CN"), ids.index("CN-TW"))

    def test_wup_match_requires_an_unambiguous_nearest_coordinate(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "wup-labels.tsv"
            with path.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.writer(stream, delimiter="\t")
                writer.writerow(["?en", "?zh", "?coord", "?geonameId"])
                writer.writerow(["Springfield", "候选城市", "POINT(-75 40.1)", "100"])
                writer.writerow(["Springfield", "附近城市", "POINT(-75 40.4)", "101"])
            candidates = BUILDER.read_wikidata_wup_candidates(path)

        wup_city = {
            "City_Name": "Springfield",
            "PWCent_Latitude": "40",
            "PWCent_Longitude": "-75",
        }
        match = BUILDER.match_wikidata_wup_city(wup_city, candidates)
        self.assertEqual(match["cityName"], "候选城市")
        self.assertEqual(match["geonameId"], "100")

    def test_wup_match_rejects_equal_distance_candidates(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "wup-labels.tsv"
            with path.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.writer(stream, delimiter="\t")
                writer.writerow(["?en", "?zh", "?coord", "?geonameId"])
                writer.writerow(["Springfield", "西城", "POINT(-75.1 40)", "100"])
                writer.writerow(["Springfield", "东城", "POINT(-74.9 40)", "101"])
            candidates = BUILDER.read_wikidata_wup_candidates(path)

        wup_city = {
            "City_Name": "Springfield",
            "PWCent_Latitude": "40",
            "PWCent_Longitude": "-75",
        }
        self.assertIsNone(BUILDER.match_wikidata_wup_city(wup_city, candidates))


class OpenStreetMapNameSourceTests(unittest.TestCase):
    def test_fetch_query_limits_candidates_to_point_geometry(self):
        query = OSM_FETCHER.build_query(["Kyoto"])

        self.assertIn('"Kyoto"', query)
        self.assertIn('STRSTARTS(STR(?geometry), "POINT(")', query)

    def test_osm_tsv_reader_keeps_chinese_city_candidates(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "osm-labels.tsv"
            path.write_text(
                '?osm\t?en\t?zh\t?place\t?geometry\n'
                '<https://www.openstreetmap.org/node/123>\t'
                '"Kyoto"\t"京都/京都市"\t"city"\t"POINT(135.7681 35.0116)"\n'
                '<https://www.openstreetmap.org/node/456>\t'
                '"Kyoto"\t"Kyoto"\t"town"\t"POINT(135.8 35.0)"\n',
                encoding="utf-8",
            )
            with path.open("a", encoding="utf-8") as stream:
                stream.write(
                    '<https://www.openstreetmap.org/node/789>\t'
                    '"Kyoto"\t"不应匹配"\t"city"\t"MULTIPOINT(135.7 35.0)"\n'
                )

            candidates = BUILDER.read_osm_wup_candidates(path)

        self.assertEqual(len(candidates["kyoto"]), 1)
        self.assertEqual(candidates["kyoto"][0]["osmId"], "https://www.openstreetmap.org/node/123")
        self.assertEqual(candidates["kyoto"][0]["cityName"], "京都")

    def test_osm_match_requires_exact_english_name_and_nearest_point(self):
        candidates = {
            "springfield": [
                {
                    "osmId": "node/near",
                    "englishName": "Springfield",
                    "cityName": "近处",
                    "latitude": 40.1,
                    "longitude": -75,
                },
                {
                    "osmId": "node/far",
                    "englishName": "Springfield",
                    "cityName": "远处",
                    "latitude": 40.4,
                    "longitude": -75,
                },
            ],
            "springfieldtown": [
                {
                    "osmId": "node/other",
                    "englishName": "Springfield Town",
                    "cityName": "斯普林菲尔德镇",
                    "latitude": 40,
                    "longitude": -75,
                }
            ],
        }
        wup_city = {
            "City_Name": "Springfield",
            "PWCent_Latitude": "40",
            "PWCent_Longitude": "-75",
        }

        match = BUILDER.match_osm_wup_city(wup_city, candidates)

        self.assertEqual(match["osmId"], "node/near")
        self.assertEqual(match["cityName"], "近处")

    def test_osm_match_does_not_use_partial_english_names(self):
        candidates = {
            "springfieldtown": [
                {
                    "osmId": "node/town",
                    "englishName": "Springfield Town",
                    "cityName": "斯普林菲尔德镇",
                    "latitude": 40,
                    "longitude": -75,
                }
            ]
        }
        wup_city = {
            "City_Name": "Springfield",
            "PWCent_Latitude": "40",
            "PWCent_Longitude": "-75",
        }

        self.assertIsNone(BUILDER.match_osm_wup_city(wup_city, candidates))

    def test_osm_match_rejects_equal_distance_candidates(self):
        candidates = {
            "springfield": [
                {
                    "osmId": "node/west",
                    "englishName": "Springfield",
                    "cityName": "西城",
                    "latitude": 40,
                    "longitude": -75.1,
                },
                {
                    "osmId": "node/east",
                    "englishName": "Springfield",
                    "cityName": "东城",
                    "latitude": 40,
                    "longitude": -74.9,
                },
            ]
        }
        wup_city = {
            "City_Name": "Springfield",
            "PWCent_Latitude": "40",
            "PWCent_Longitude": "-75",
        }

        self.assertIsNone(BUILDER.match_osm_wup_city(wup_city, candidates))


if __name__ == "__main__":
    unittest.main()
