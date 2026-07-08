# AutoBuddy - Immediate Action Plan

**Priority-Ordered Tasks with Exact Commands**

---

## 🔥 WEEK 1: Critical Blockers (Must Complete)

### Day 1: Documentation & Quick Wins

#### Task 1.1: Create Root README.md (1 hour)
**Owner:** Tech Lead  
**File:** `README.md` (create at project root)

```markdown
# AutoBuddy - Smart Ride Hailing Platform

## Quick Start

### Backend Setup
```bash
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# Edit .env with your MongoDB URL
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

### Mobile App Setup
```bash
cd autobuddy-mobile
npm install
copy .env.example .env
# Edit .env with your API URL
npm start
```

## Architecture
- **Backend:** Python 3.11 + FastAPI
- **Mobile:** React Native (Expo) + TypeScript
- **Database:** MongoDB (primary) + PostgreSQL (features)
- **Real-time:** WebSockets via Socket.IO
- **Payment:** Stripe + UPI
```

#### Task 1.2: Remove Secrets from Git (30 min)
**Owner:** DevOps

```powershell
# Remove .env files from git tracking
cd C:\Users\Dhanya\Documents\AutoBuddy
git rm --cached backend/.env
git rm --cached autobuddy-mobile/.env
git rm --cached backend/.env.sample

# Update .gitignore to ensure they stay ignored
# Commit the changes
git commit -m "chore: remove sensitive .env files from git"
```

#### Task 1.3: Enable Dependabot (10 min)
**Owner:** DevOps  
**File:** `.github/dependabot.yml` (create if not exists)

```yaml
version: 2
updates:
  - package-ecosystem: "pip"
    directory: "/backend"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    
  - package-ecosystem: "npm"
    directory: "/autobuddy-mobile"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

### Day 2: Database Migrations

#### Task 2.1: Create Alembic Initial Migration (2 hours)
**Owner:** Backend Developer

```powershell
cd backend

# Check alembic configuration
cat alembic.ini

# Create initial migration
alembic revision --autogenerate -m "initial_passenger_features_schema"

# Review generated migration
cat alembic\versions\*_initial_passenger_features_schema.py

# Test migration
alembic upgrade head

# Test rollback
alembic downgrade -1
alembic upgrade head
```

**Deliverable:** `backend/alembic/versions/XXXX_initial_passenger_features_schema.py`

#### Task 2.2: Document MongoDB Schema (2 hours)
**Owner:** Backend Developer  
**File:** `backend/docs/MONGODB_SCHEMA.md`

```markdown
# MongoDB Collections

## users
- `_id`: ObjectId
- `email`: string (unique, indexed)
- `phone`: string (unique, indexed)
- `name`: string
- `role`: enum ["passenger", "driver", "admin"]
- `password_hash`: string
- `created_at`: datetime (indexed)

Required Indexes:
```python
db.users.createIndex({"email": 1}, {"unique": true})
db.users.createIndex({"phone": 1}, {"unique": true})
db.users.createIndex({"created_at": -1})
```

[Continue for all collections...]
```

#### Task 2.3: Create MongoDB Index Script (1 hour)
**Owner:** Backend Developer  
**File:** `backend/scripts/create_mongo_indexes.py`

```python
"""Create required MongoDB indexes for production."""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

async def create_indexes():
    client = AsyncIOMotorClient(os.getenv("MONGO_URL"))
    db = client[os.getenv("DB_NAME", "autobuddy_db")]
    
    # Users collection
    await db.users.create_index("email", unique=True)
    await db.users.create_index("phone", unique=True)
    await db.users.create_index("created_at")
    
    # Rides collection
    await db.rides.create_index("passenger_id")
    await db.rides.create_index("driver_id")
    await db.rides.create_index("status")
    await db.rides.create_index("created_at")
    
    # Add more indexes as needed
    print("✅ All indexes created successfully")
    
if __name__ == "__main__":
    asyncio.run(create_indexes())
```

### Day 3: Basic Monitoring Setup

#### Task 3.1: Configure Structured Logging (2 hours)
**Owner:** Backend Developer  
**File:** `backend/app/core/logging_config.py` (create)

```python
"""Structured logging configuration."""
import logging
import json
import sys
from datetime import datetime
from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar("request_id", default="")

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
            "request_id": request_id_var.get(),
        }
        
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
            
        return json.dumps(log_data)

def setup_logging():
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())
    
    root_logger = logging.getLogger()
    root_logger.addHandler(handler)
    root_logger.setLevel(logging.INFO if os.getenv("ENVIRONMENT") == "production" else logging.DEBUG)
```

**Update:** `backend/app/main.py` - Add request ID middleware

```python
from uuid import uuid4
from backend.app.core.logging_config import request_id_var, setup_logging

@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = str(uuid4())
    request_id_var.set(request_id)
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response

setup_logging()
```

#### Task 3.2: Set Up Basic Alerting (1 hour)
**Owner:** DevOps  
**File:** `backend/app/core/alerts.py` (create)

```python
"""Simple alerting via Slack webhook."""
import httpx
import os
from datetime import datetime

SLACK_WEBHOOK = os.getenv("SLACK_ALERT_WEBHOOK")

async def send_alert(severity: str, message: str, details: dict = None):
    """Send alert to Slack."""
    if not SLACK_WEBHOOK:
        return
        
    payload = {
        "text": f"🚨 {severity.upper()} Alert",
        "blocks": [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*{severity.upper()}*: {message}\n*Time:* {datetime.utcnow().isoformat()}"
                }
            }
        ]
    }
    
    if details:
        payload["blocks"].append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"```{json.dumps(details, indent=2)}```"
            }
        })
    
    async with httpx.AsyncClient() as client:
        await client.post(SLACK_WEBHOOK, json=payload)
```

### Day 4-5: Essential Mobile Tests

#### Task 4.1: Set Up Test Infrastructure (1 hour)
**Owner:** Frontend Developer

```powershell
cd autobuddy-mobile

# Verify Jest setup
npm test -- --version

# Create test directory structure
mkdir src\__tests__
mkdir src\__tests__\services
mkdir src\__tests__\utils
mkdir src\__tests__\hooks
mkdir src\__tests__\components
```

#### Task 4.2: Write API Client Tests (2 hours)
**Owner:** Frontend Developer  
**File:** `autobuddy-mobile/src/__tests__/services/apiClient.test.ts`

```typescript
import { apiRequest, setAuthToken } from '../../services/apiClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

jest.mock('axios');
jest.mock('@react-native-async-storage/async-storage');

describe('apiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('apiRequest', () => {
    it('should make successful GET request', async () => {
      const mockData = { id: 1, name: 'Test' };
      (axios.request as jest.Mock).mockResolvedValue({ data: mockData });

      const result = await apiRequest('GET', '/test');

      expect(result).toEqual(mockData);
      expect(axios.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: expect.stringContaining('/test'),
        })
      );
    });

    it('should handle 401 and refresh token', async () => {
      // Mock token refresh logic
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('refresh_token');
      (axios.request as jest.Mock)
        .mockRejectedValueOnce({ response: { status: 401 } })
        .mockResolvedValueOnce({ data: { access_token: 'new_token' } })
        .mockResolvedValueOnce({ data: { success: true } });

      const result = await apiRequest('GET', '/protected');

      expect(result).toEqual({ success: true });
      expect(axios.request).toHaveBeenCalledTimes(3);
    });

    it('should handle network errors gracefully', async () => {
      (axios.request as jest.Mock).mockRejectedValue(new Error('Network Error'));

      await expect(apiRequest('GET', '/test')).rejects.toThrow('Network Error');
    });
  });
});
```

#### Task 4.3: Write Validation Tests (2 hours)
**Owner:** Frontend Developer  
**File:** `autobuddy-mobile/src/__tests__/utils/validation.test.ts`

```typescript
import { validateCoordinates, validateFare, validatePhone } from '../../utils/validation';

describe('validation utilities', () => {
  describe('validateCoordinates', () => {
    it('should validate correct coordinates', () => {
      const result = validateCoordinates(40.7128, -74.0060);
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid latitude', () => {
      const result = validateCoordinates(100, -74.0060);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('latitude');
    });

    it('should reject non-numeric values', () => {
      const result = validateCoordinates(NaN, -74.0060);
      expect(result.isValid).toBe(false);
    });
  });

  describe('validateFare', () => {
    it('should accept positive numbers', () => {
      const result = validateFare(100.50);
      expect(result.isValid).toBe(true);
    });

    it('should reject negative numbers', () => {
      const result = validateFare(-10);
      expect(result.isValid).toBe(false);
    });

    it('should reject zero', () => {
      const result = validateFare(0);
      expect(result.isValid).toBe(false);
    });
  });
});
```

#### Task 4.4: Write Hook Tests (2 hours)
**Owner:** Frontend Developer  
**File:** `autobuddy-mobile/src/__tests__/hooks/useSafeAsync.test.ts`

```typescript
import { renderHook, act } from '@testing-library/react-native';
import { useSafeAsync } from '../../hooks/useSafeAsync';

describe('useSafeAsync', () => {
  it('should handle successful async operation', async () => {
    const mockFn = jest.fn().mockResolvedValue('success');
    const { result } = renderHook(() => useSafeAsync(mockFn));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.data).toBe('success');
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('should handle errors gracefully', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
    const { result } = renderHook(() => useSafeAsync(mockFn));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Test error');
    expect(result.current.loading).toBe(false);
  });

  it('should set loading state correctly', async () => {
    const mockFn = jest.fn(() => new Promise(resolve => setTimeout(() => resolve('done'), 100)));
    const { result } = renderHook(() => useSafeAsync(mockFn));

    act(() => {
      result.current.execute();
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 150));
    });

    expect(result.current.loading).toBe(false);
  });
});
```

#### Task 4.5: Run Tests and Check Coverage (30 min)

```powershell
cd autobuddy-mobile

# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# View coverage report
start coverage\lcov-report\index.html
```

**Target:** Achieve 80% coverage for utils and hooks

---

## 🔥 WEEK 2: Security & Deployment

### Day 6-7: Secrets Management

#### Task 5.1: Set Up AWS Secrets Manager (2 hours)
**Owner:** DevOps

```powershell
# Install AWS CLI if not already installed
# Configure AWS credentials
aws configure

# Create secrets
aws secretsmanager create-secret \
  --name autobuddy/production/jwt-secret \
  --secret-string "your-32-char-secret-here"

aws secretsmanager create-secret \
  --name autobuddy/production/mongodb-url \
  --secret-string "mongodb+srv://..."

aws secretsmanager create-secret \
  --name autobuddy/production/stripe-key \
  --secret-string "sk_live_..."
```

#### Task 5.2: Update Backend to Load Secrets (2 hours)
**Owner:** Backend Developer  
**File:** `backend/app/core/secrets.py` (create)

```python
"""Secrets management for production."""
import os
import boto3
import json
from functools import lru_cache

@lru_cache()
def get_secret(secret_name: str) -> str:
    """Fetch secret from AWS Secrets Manager."""
    if os.getenv("ENVIRONMENT") != "production":
        # In dev, use .env files
        return os.getenv(secret_name)
    
    session = boto3.session.Session()
    client = session.client(
        service_name='secretsmanager',
        region_name=os.getenv("AWS_REGION", "us-east-1")
    )
    
    try:
        response = client.get_secret_value(SecretId=f"autobuddy/production/{secret_name}")
        return response['SecretString']
    except Exception as e:
        raise RuntimeError(f"Failed to fetch secret {secret_name}: {e}")

# Usage in app
JWT_SECRET = get_secret("jwt-secret")
MONGO_URL = get_secret("mongodb-url")
STRIPE_KEY = get_secret("stripe-key")
```

### Day 8: Security Scanning

#### Task 6.1: Enforce Security Scans in CI (1 hour)
**Owner:** DevOps  
**File:** `.github/workflows/backend-pipeline.yml` (update)

```yaml
# Update security job to fail builds
- name: Run Bandit security scan
  run: |
    cd backend
    bandit -r app/ -ll -f json -o bandit-report.json
    bandit -r app/ -ll  # This will fail on high severity issues

- name: Check dependencies for vulnerabilities  
  run: |
    pip install -r backend/requirements.txt
    safety check --exit-code 1  # Fail build on vulnerabilities
```

**File:** `.github/workflows/frontend-pipeline.yml` (update)

```yaml
- name: Security audit
  run: |
    cd autobuddy-mobile
    npm audit --audit-level=high  # Fail on high severity
```

### Day 9-10: E2E Tests

#### Task 7.1: Set Up Detox for E2E (2 hours)
**Owner:** Frontend Developer

```powershell
cd autobuddy-mobile

# Install Detox
npm install --save-dev detox

# Initialize Detox configuration
npx detox init
```

**File:** `autobuddy-mobile/.detoxrc.js`

```javascript
module.exports = {
  testRunner: {
    args: {
      config: 'e2e/jest.config.js',
      maxWorkers: 1,
    },
    jest: {
      setupTimeout: 120000,
    },
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/AutoBuddy.app',
      build: 'xcodebuild -workspace ios/AutoBuddy.xcworkspace -scheme AutoBuddy -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: {
        type: 'iPhone 14',
      },
    },
    emulator: {
      type: 'android.emulator',
      device: {
        avdName: 'Pixel_5_API_31',
      },
    },
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
  },
};
```

#### Task 7.2: Write Critical E2E Tests (4 hours)
**Owner:** Frontend Developer  
**File:** `autobuddy-mobile/e2e/booking.e2e.ts`

```typescript
describe('Booking Flow', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should complete full booking journey', async () => {
    // Login
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();

    // Wait for dashboard
    await waitFor(element(by.id('passenger-dashboard')))
      .toBeVisible()
      .withTimeout(5000);

    // Enter pickup location
    await element(by.id('pickup-input')).typeText('123 Main St');
    await element(by.id('pickup-suggestion-0')).tap();

    // Enter dropoff location
    await element(by.id('dropoff-input')).typeText('456 Oak Ave');
    await element(by.id('dropoff-suggestion-0')).tap();

    // Confirm booking
    await element(by.id('book-ride-button')).tap();

    // Wait for driver assignment
    await waitFor(element(by.id('driver-assigned')))
      .toBeVisible()
      .withTimeout(10000);

    // Verify booking details
    await expect(element(by.id('ride-status'))).toHaveText('Driver Assigned');
  });
});
```

---

## 📊 Progress Tracking

### Week 1 Checklist
- [ ] Root README.md created
- [ ] Secrets removed from git
- [ ] Dependabot enabled
- [ ] Alembic migrations created
- [ ] MongoDB indexes documented
- [ ] Structured logging implemented
- [ ] Basic alerting configured
- [ ] Mobile test infrastructure set up
- [ ] API client tests written (80%+ coverage)
- [ ] Validation tests written (80%+ coverage)
- [ ] Hook tests written (80%+ coverage)

### Week 2 Checklist
- [ ] AWS Secrets Manager configured
- [ ] Backend loading secrets from manager
- [ ] Security scans enforced in CI
- [ ] Detox E2E framework set up
- [ ] Booking flow E2E test written
- [ ] Login/logout E2E test written
- [ ] Payment flow E2E test written

---

## 🎯 Success Criteria

### Week 1 Success
- ✅ New developer can set up project in < 30 minutes using README
- ✅ All mobile utils have 80%+ test coverage
- ✅ Database migrations can be run safely
- ✅ Basic monitoring provides visibility into errors

### Week 2 Success
- ✅ No secrets in source control
- ✅ CI fails on security vulnerabilities
- ✅ E2E tests cover critical user journeys
- ✅ Deployment can be done following runbook

---

## 🆘 Escalation

If blocked on any task:
1. Document the blocker in project README
2. Assign to technical lead
3. Update timeline estimate
4. Proceed with non-blocked tasks

---

*This plan prioritizes the highest-impact items first. Follow sequentially for best results.*
