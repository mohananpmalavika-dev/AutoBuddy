"""
AI Travel Intent Engine - Integration Tests
Tests all components working together
"""

import requests
import json
from typing import Dict, Any

BASE_URL = "http://localhost:8000"
API_PREFIX = "/api/intent"


class IntegrationTestSuite:
    """Complete integration test suite for AI Travel Intent Engine"""

    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url
        self.results = []

    def test_intent_recognition(self) -> bool:
        """Test 1: Intent Recognition"""
        print("\n🧪 Test 1: Intent Recognition")
        try:
            response = requests.post(
                f"{self.base_url}{API_PREFIX}/recognize",
                json={
                    "query": "Movie with friends",
                    "num_passengers": 2,
                },
                timeout=5,
            )
            
            if response.status_code != 200:
                print(f"  ❌ Failed: {response.status_code}")
                return False
            
            data = response.json()
            print(f"  ✅ Recognized: {data.get('intent', 'unknown')}")
            print(f"  ✅ Confidence: {data.get('confidence', 0):.2f}")
            self.results.append(("Intent Recognition", True))
            return True
        except Exception as e:
            print(f"  ❌ Error: {e}")
            self.results.append(("Intent Recognition", False))
            return False

    def test_suggestions(self) -> bool:
        """Test 2: Get Suggestions"""
        print("\n🧪 Test 2: Get Suggestions")
        try:
            response = requests.get(
                f"{self.base_url}{API_PREFIX}/suggest",
                params={
                    "query": "Movie with friends",
                    "latitude": 10.1582,
                    "longitude": 76.3889,
                    "num_passengers": 2,
                    "limit": 5,
                },
                timeout=5,
            )
            
            if response.status_code != 200:
                print(f"  ❌ Failed: {response.status_code}")
                return False
            
            data = response.json()
            count = len(data)
            print(f"  ✅ Got {count} suggestions")
            
            if count > 0:
                first = data[0]
                print(f"  📍 Top: {first.get('location', {}).get('name', 'Unknown')}")
                print(f"  ⭐ Rating: {first.get('location', {}).get('rating', 'N/A')}")
            
            self.results.append(("Get Suggestions", True))
            return True
        except Exception as e:
            print(f"  ❌ Error: {e}")
            self.results.append(("Get Suggestions", False))
            return False

    def test_trending(self) -> bool:
        """Test 3: Trending Destinations"""
        print("\n🧪 Test 3: Trending Destinations")
        try:
            response = requests.get(
                f"{self.base_url}{API_PREFIX}/trending",
                params={"limit": 10},
                timeout=5,
            )
            
            if response.status_code != 200:
                print(f"  ❌ Failed: {response.status_code}")
                return False
            
            data = response.json()
            count = len(data)
            print(f"  ✅ Got {count} trending destinations")
            
            if count > 0:
                for i, item in enumerate(data[:3], 1):
                    print(f"  {i}. {item.get('name', 'Unknown')} - ⭐ {item.get('rating', 'N/A')}")
            
            self.results.append(("Trending", True))
            return True
        except Exception as e:
            print(f"  ❌ Error: {e}")
            self.results.append(("Trending", False))
            return False

    def test_locations(self) -> bool:
        """Test 4: List Locations"""
        print("\n🧪 Test 4: List Locations")
        try:
            response = requests.get(
                f"{self.base_url}{API_PREFIX}/locations",
                params={"limit": 20},
                timeout=5,
            )
            
            if response.status_code != 200:
                print(f"  ❌ Failed: {response.status_code}")
                return False
            
            data = response.json()
            count = len(data)
            print(f"  ✅ Got {count} locations")
            
            categories = set()
            for loc in data[:5]:
                categories.add(loc.get('category', 'unknown'))
                print(f"  📍 {loc.get('name', 'Unknown')} ({loc.get('category', 'unknown')})")
            
            self.results.append(("List Locations", True))
            return True
        except Exception as e:
            print(f"  ❌ Error: {e}")
            self.results.append(("List Locations", False))
            return False

    def test_pricing_estimate(self) -> bool:
        """Test 5: Pricing Estimate"""
        print("\n🧪 Test 5: Pricing Estimate")
        try:
            response = requests.get(
                f"{self.base_url}{API_PREFIX}/pricing/estimate",
                params={
                    "from_lat": 10.1582,
                    "from_lng": 76.3889,
                    "to_lat": 9.9689,
                    "to_lng": 76.3295,
                    "vehicle_type": "auto",
                    "num_passengers": 2,
                },
                timeout=5,
            )
            
            if response.status_code != 200:
                print(f"  ❌ Failed: {response.status_code}")
                return False
            
            data = response.json()
            distance = data.get('distance_km', 0)
            fare = data.get('estimated_fare', 0)
            duration = data.get('estimated_duration_minutes', 0)
            
            print(f"  ✅ Distance: {distance:.1f} km")
            print(f"  ✅ Estimated Fare: ₹{fare:.0f}")
            print(f"  ✅ Duration: {duration} min")
            
            self.results.append(("Pricing Estimate", True))
            return True
        except Exception as e:
            print(f"  ❌ Error: {e}")
            self.results.append(("Pricing Estimate", False))
            return False

    def test_search_metrics(self) -> bool:
        """Test 6: Search Metrics"""
        print("\n🧪 Test 6: Search Metrics")
        try:
            response = requests.get(
                f"{self.base_url}{API_PREFIX}/search/metrics",
                params={"limit": 5},
                timeout=5,
            )
            
            if response.status_code != 200:
                print(f"  ❌ Failed: {response.status_code}")
                return False
            
            data = response.json()
            count = len(data)
            print(f"  ✅ Got {count} search metrics")
            
            if count > 0:
                for i, item in enumerate(data[:2], 1):
                    print(f"  {i}. '{item.get('query', 'unknown')}' - {item.get('total_searches', 0)} searches")
            
            self.results.append(("Search Metrics", True))
            return True
        except Exception as e:
            print(f"  ❌ Error: {e}")
            self.results.append(("Search Metrics", False))
            return False

    def run_all_tests(self) -> Dict[str, Any]:
        """Run all tests and return summary"""
        print("=" * 60)
        print("🚀 AI TRAVEL INTENT ENGINE - INTEGRATION TESTS")
        print("=" * 60)

        tests = [
            self.test_intent_recognition,
            self.test_suggestions,
            self.test_trending,
            self.test_locations,
            self.test_pricing_estimate,
            self.test_search_metrics,
        ]

        for test_func in tests:
            try:
                test_func()
            except Exception as e:
                print(f"⚠️  Test error: {e}")

        # Print summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)

        passed = sum(1 for _, result in self.results if result)
        total = len(self.results)

        for name, result in self.results:
            status = "✅ PASS" if result else "❌ FAIL"
            print(f"{status}: {name}")

        print(f"\n{passed}/{total} tests passed")

        if passed == total:
            print("\n🎉 ALL TESTS PASSED! Integration complete.")
        else:
            print(f"\n⚠️  {total - passed} tests failed. Check logs above.")

        return {
            "passed": passed,
            "total": total,
            "results": self.results,
            "success": passed == total,
        }


if __name__ == "__main__":
    suite = IntegrationTestSuite()
    summary = suite.run_all_tests()
    
    # Exit with appropriate code
    exit(0 if summary["success"] else 1)
