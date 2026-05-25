#!/usr/bin/env python3
"""
Quick local import test to verify backend can be imported.
"""
import os
import sys
import traceback

print(f"Python: {sys.version}")
print(f"CWD: {os.getcwd()}")
print(f"PYTHONPATH: {os.environ.get('PYTHONPATH', 'not set')}")

# Ensure backend is in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("\n=== Testing imports ===")

try:
    print("1. Importing core dependencies...")
    import fastapi
    import motor.motor_asyncio
    import cryptography.fernet
    import jwt
    import bcrypt
    print("   ✓ Core dependencies OK")
except Exception as e:
    print(f"   ✗ Core dependencies failed: {e}")
    traceback.print_exc()
    sys.exit(1)

try:
    print("2. Importing app.core.config...")
    from app.core.config import get_settings
    print("   ✓ app.core.config OK")
except Exception as e:
    print(f"   ✗ app.core.config failed: {e}")
    traceback.print_exc()
    sys.exit(1)

try:
    print("3. Importing app.db.client...")
    from app.db.client import create_mongo_client, create_database
    print("   ✓ app.db.client OK")
except Exception as e:
    print(f"   ✗ app.db.client failed: {e}")
    traceback.print_exc()
    sys.exit(1)

try:
    print("4. Importing app.state...")
    from app.state import RuntimeStateConfig, RuntimeStateStore
    print("   ✓ app.state OK")
except Exception as e:
    print(f"   ✗ app.state failed: {e}")
    traceback.print_exc()
    sys.exit(1)

try:
    print("5. Importing app.routers.auth...")
    from app.routers.auth import router
    print("   ✓ app.routers.auth OK")
except Exception as e:
    print(f"   ✗ app.routers.auth failed: {e}")
    traceback.print_exc()
    sys.exit(1)

try:
    print("6. Importing server module (main app)...")
    import server
    print("   ✓ server module OK")
    print(f"   - app object: {server.app}")
    print(f"   - app type: {type(server.app)}")
except Exception as e:
    print(f"   ✗ server module failed: {e}")
    traceback.print_exc()
    sys.exit(1)

print("\n✓ All imports successful!")
