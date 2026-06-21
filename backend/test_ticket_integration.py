"""
Quick integration test for ticket detection router
Verifies that routes are properly registered and accessible
"""
import asyncio
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


async def test_router_registration():
    """Test that ticket detection router is properly registered"""
    from app.routers.ticket_detection import router
    
    # Check router has correct prefix
    assert router.prefix == "/api/tickets", f"Router prefix is {router.prefix}, expected /api/tickets"
    
    # Check routes exist
    route_paths = [route.path for route in router.routes]
    expected_routes = ["/detect", "/create-ride-from-ticket", "/detect-and-create-ride"]
    
    for expected in expected_routes:
        full_path = f"/api/tickets{expected}"
        assert any(expected in path for path in route_paths), f"Route {expected} not found in {route_paths}"
    
    print("✓ Router has correct prefix: /api/tickets")
    print(f"✓ Router has {len(router.routes)} endpoints:")
    for route in router.routes:
        if hasattr(route, 'name'):
            print(f"  - {route.path} ({route.name})")
    
    return True


async def test_service_initialization():
    """Test that ticket detection service can be initialized"""
    from app.services.ticket_detection import TicketDetectionService, get_ticket_detection_service
    
    # Initialize with test key
    service = TicketDetectionService(api_key="test_key")
    assert service is not None
    print("✓ Service initialized successfully")
    
    # Test singleton
    service2 = get_ticket_detection_service(api_key="test_key")
    assert service2 is not None
    print("✓ Singleton service retrieval works")
    
    return True


async def test_bootstrap_integration():
    """Test that bootstrap properly registers the router"""
    try:
        from app.bootstrap import register_modular_routers
        print("✓ Bootstrap imports successfully")
        
        # Create mock FastAPI app
        from fastapi import FastAPI
        app = FastAPI()
        
        # Register routes
        register_modular_routers(app)
        
        # Check if ticket routes are registered
        routes = [route.path for route in app.routes]
        ticket_routes = [r for r in routes if "/api/tickets" in r]
        
        assert len(ticket_routes) > 0, "No ticket routes found in app"
        print(f"✓ Bootstrap registered {len(ticket_routes)} ticket detection routes")
        print(f"  Routes: {ticket_routes}")
        
        return True
    except Exception as e:
        print(f"✗ Bootstrap integration failed: {e}")
        raise


async def main():
    """Run all integration tests"""
    print("=" * 60)
    print("TICKET DETECTION - INTEGRATION TESTS")
    print("=" * 60)
    print()
    
    tests = [
        ("Router Registration", test_router_registration),
        ("Service Initialization", test_service_initialization),
        ("Bootstrap Integration", test_bootstrap_integration),
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            print(f"Testing: {test_name}...")
            result = await test_func()
            results.append((test_name, True, None))
            print()
        except Exception as e:
            results.append((test_name, False, str(e)))
            print(f"✗ FAILED: {e}")
            print()
    
    # Summary
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for _, success, _ in results if success)
    total = len(results)
    
    for test_name, success, error in results:
        status = "✓ PASS" if success else "✗ FAIL"
        print(f"{status}: {test_name}")
        if error:
            print(f"       Error: {error}")
    
    print()
    print(f"Total: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All integration tests passed!")
        return 0
    else:
        print(f"\n❌ {total - passed} test(s) failed")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
