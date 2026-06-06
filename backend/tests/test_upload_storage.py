import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
from bson.binary import Binary

import server


class FakeUpload:
    filename = "avatar.jpg"
    content_type = "image/jpeg"

    async def read(self):
        return b"fake-image-bytes"


class FakeUploadFiles:
    def __init__(self):
        self.rows = []

    async def insert_one(self, row):
        self.rows.append(row)


class FakeDb:
    def __init__(self):
        self.upload_files = FakeUploadFiles()


class UploadStorageTests(unittest.IsolatedAsyncioTestCase):
    async def test_save_upload_file_mongo_uses_bson_binary(self):
        fake_db = FakeDb()
        with patch.object(server, "db", fake_db):
            with tempfile.TemporaryDirectory() as tmpdir:
                saved = await server.save_upload_file(
                    FakeUpload(),
                    Path(tmpdir),
                    "passenger-1",
                    storage_backend="mongo",
                )

        self.assertEqual(saved["storage_backend"], "mongo")
        self.assertTrue(saved["storage_id"].startswith("upload-"))
        self.assertEqual(len(fake_db.upload_files.rows), 1)
        self.assertIsInstance(fake_db.upload_files.rows[0]["data"], Binary)


if __name__ == "__main__":
    unittest.main()
