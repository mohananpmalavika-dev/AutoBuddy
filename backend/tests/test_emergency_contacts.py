import unittest

import server


class EmergencyContactTests(unittest.TestCase):
    def test_build_emergency_contact_document_accepts_passenger_payload(self):
        doc = server.build_emergency_contact_document(
            {
                "contact_name": "Asha",
                "phone_number": "99999 99999",
                "relation": "Family",
                "notify_on_rides": True,
            },
            "passenger-1",
        )

        self.assertEqual(doc["user_id"], "passenger-1")
        self.assertEqual(doc["name"], "Asha")
        self.assertEqual(doc["contact_name"], "Asha")
        self.assertEqual(doc["phone"], "9999999999")
        self.assertEqual(doc["phone_number"], "9999999999")
        self.assertEqual(doc["relation"], "Family")
        self.assertTrue(doc["active"])

    def test_serialize_emergency_contact_exposes_both_contact_shapes(self):
        serialized = server.serialize_emergency_contact(
            {
                "id": "contact-1",
                "contact_name": "Asha",
                "phone_number": "9999999999",
                "relationship": "Family",
            }
        )

        self.assertEqual(serialized["id"], "contact-1")
        self.assertEqual(serialized["name"], "Asha")
        self.assertEqual(serialized["contact_name"], "Asha")
        self.assertEqual(serialized["phone"], "9999999999")
        self.assertEqual(serialized["phone_number"], "9999999999")
        self.assertEqual(serialized["relation"], "Family")
        self.assertEqual(serialized["relationship"], "Family")


if __name__ == "__main__":
    unittest.main()
