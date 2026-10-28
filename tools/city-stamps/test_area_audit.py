import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


AUDIT_SCRIPT = Path(__file__).with_name("initialize-area-audit.py")
SPEC = importlib.util.spec_from_file_location("city_stamp_area_audit", AUDIT_SCRIPT)
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


class AreaAuditLedgerTests(unittest.TestCase):
    def test_ledger_preserves_catalog_order_and_counts_existing_wup_candidates(self):
        catalog = {
            "version": "fixture",
            "areas": [
                {"id": "BT", "nameZh": "不丹", "nameEn": "BHUTAN"},
                {"id": "CN", "nameZh": "中国大陆", "nameEn": "MAINLAND CHINA"},
                {"id": "CN-TW", "nameZh": "中国台湾", "nameEn": "TAIWAN · CHINA"},
            ],
            "cities": [
                {"id": "wup-btn-1", "areaId": "BT"},
                {"id": "wup-btn-2", "areaId": "BT"},
                {"id": "cn-admin-110000", "areaId": "CN"},
                {"id": "wup-twn-1", "areaId": "CN-TW"},
            ],
        }

        with tempfile.TemporaryDirectory() as directory:
            catalog_path = Path(directory) / "catalog.json"
            catalog_path.write_text(json.dumps(catalog), encoding="utf-8")
            ledger = AUDIT.build_ledger(catalog_path)

        self.assertEqual([area["areaId"] for area in ledger["areas"]], ["BT", "CN", "CN-TW"])
        self.assertEqual([area["order"] for area in ledger["areas"]], [1, 2, 3])
        self.assertEqual(ledger["areas"][0]["previousWupRecords"], 2)
        self.assertEqual(ledger["areas"][1]["previousWupRecords"], 0)
        self.assertEqual(ledger["areas"][2]["previousCatalogRecords"], 1)

    def test_unreviewed_regions_are_explicitly_not_started(self):
        catalog = {
            "version": "fixture",
            "areas": [{"id": "ZZ", "nameZh": "测试地区", "nameEn": "TEST AREA"}],
            "cities": [{"id": "wup-zzz-1", "areaId": "ZZ"}],
        }

        with tempfile.TemporaryDirectory() as directory:
            catalog_path = Path(directory) / "catalog.json"
            catalog_path.write_text(json.dumps(catalog), encoding="utf-8")
            area = AUDIT.build_ledger(catalog_path)["areas"][0]

        self.assertEqual(area["auditStatus"], "not-started")
        self.assertIsNone(area["eligibleUnitCount"])
        self.assertTrue(area["sourceGaps"])

    def test_seeded_special_area_findings_are_not_mislabeled_as_complete(self):
        catalog = {
            "version": "fixture",
            "areas": [
                {"id": "CN-TW", "nameZh": "中国台湾", "nameEn": "TAIWAN · CHINA"},
                {"id": "CN-HK", "nameZh": "中国香港", "nameEn": "HONG KONG · CHINA"},
            ],
            "cities": [
                {"id": "wup-twn-1", "areaId": "CN-TW"},
                {"id": "wup-hkg-1", "areaId": "CN-HK"},
            ],
        }

        with tempfile.TemporaryDirectory() as directory:
            catalog_path = Path(directory) / "catalog.json"
            catalog_path.write_text(json.dumps(catalog), encoding="utf-8")
            areas = AUDIT.build_ledger(catalog_path)["areas"]

        self.assertEqual(areas[0]["auditStatus"], "source-review-started")
        self.assertEqual(areas[1]["auditStatus"], "scope-exception-pending-rebuild")
        self.assertTrue(areas[0]["sourceGaps"])
        self.assertTrue(areas[1]["sources"])


if __name__ == "__main__":
    unittest.main()
