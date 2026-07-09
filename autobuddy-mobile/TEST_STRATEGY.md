# Mobile App Test Strategy

## Overview

This document outlines the comprehensive testing strategy for the AutoBuddy mobile application to achieve 80%+ code coverage and ensure production quality.

## Test Structure

```
src/
├── __tests__/
│   ├── services/
│   │   ├── apiClient.test.ts           ✅ API client, auth, error handling
│   │   └── socketService.test.ts       □ WebSocket connections
│   ├── utils/
│   │   ├── validation.test.ts          ✅ Input validation functions
│   │   ├── safeStorage.test.ts         ✅ AsyncStorage wrapper
│   │   ├── userValidator.test.ts       ✅ User object validation
│   │   ├── typeGuards.test.ts          ✅ Type guard utilities
│   │   └── errorMessages.test.ts       □ Error handling utilities
│   ├── hooks/
│   │   ├── useSafeAsync.test.ts        ✅ Async operation hook
│   │   ├── useSafeBooking.test.ts      ✅ Booking hook
│   │   ├── useVoiceBooking.test.ts     □ Voice booking hook
│   │   └── useAuth.test.ts             □ Authentication hook
│   ├── components/
│   │   ├── DriverInfoCard.test.tsx     □ Driver info display
│   │   ├── RideCard.test.tsx           □ Ride card component
│   │   ├── LocationPicker.test.tsx     □ Location selection
│   │   └── PaymentMethodSelector.test.tsx □ Payment method UI
│   └── screens/
│       ├── PassengerDashboard.test.tsx □ Main passenger screen
│       └── Login.test.tsx              □ Login screen
└── e2e/
    ├── booking.e2e.ts                  □ End-to-end booking flow
    ├── authentication.e2e.ts           □ Login/logout flow
    └── payment.e2e.ts                  □ Payment processing flow

Legend: ✅ Complete | □ To be created
```

## Test Categories

### 1. Unit Tests (70% of test coverage)

#### Priority 1: Core Utilities (Must Have)
- **validation.test.ts** - Input validation (coordinates, fare, phone, email, dates)
- **safeStorage.test.ts** - AsyncStorage error handling
- **userValidator.test.ts** - User object validation
- **typeGuards.test.ts** - Runtime type checking
- **errorMessages.test.ts** - Error message formatting

#### Priority 2: API Layer (Must Have)
- **apiClient.test.ts** - HTTP client, authentication, token refresh, error handling
- **socketService.test.ts** - WebSocket connections, reconnection logic

#### Priority 3: Custom Hooks (Must Have)
- **useSafeAsync.test.ts** - Async operation wrapper with error handling
- **useSafeBooking.test.ts** - Booking state management
- **useVoiceBooking.test.ts** - Voice command processing
- **useAuth.test.ts** - Authentication state management

### 2. Integration Tests (20% of test coverage)

#### Priority 1: Component Tests
- **DriverInfoCard.test.tsx** - Driver information display with API data
- **RideCard.test.tsx** - Ride information display and actions
- **LocationPicker.test.tsx** - Location selection with Google Maps API
- **PaymentMethodSelector.test.tsx** - Payment method selection and validation

#### Priority 2: Screen Tests
- **PassengerDashboard.test.tsx** - Main passenger interface with all features
- **DriverDashboard.test.tsx** - Driver interface with ride acceptance
- **Login.test.tsx** - Authentication flow with API calls

### 3. End-to-End Tests (10% of test coverage)

#### Critical User Journeys
- **Booking Flow**: Passenger books ride → Driver accepts → Ride completes
- **Authentication Flow**: Registration → Login → Token refresh → Logout
- **Payment Flow**: Select payment method → Process payment → Confirm

## Test Coverage Goals

| Category | Target Coverage | Priority |
|----------|----------------|----------|
| **Utilities** | 95% | P0 (Critical) |
| **Services** | 90% | P0 (Critical) |
| **Hooks** | 85% | P1 (High) |
| **Components** | 75% | P2 (Medium) |
| **Screens** | 60% | P2 (Medium) |
| **Overall** | 80% | Target |

## Testing Tools & Setup

### Frameworks
- **Jest** - Test runner and assertion library
- **React Testing Library** - Component testing
- **@testing-library/react-native** - Native component testing
- **@testing-library/react-hooks** - Hook testing
- **Detox** - End-to-end testing

### Mocking Strategy
- **axios** - Mock HTTP requests
- **@react-native-async-storage/async-storage** - Mock storage
- **react-native** - Mock native modules (Alert, Platform, etc.)
- **Socket.IO** - Mock WebSocket connections
- **Google Maps** - Mock map components

## Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- validation.test.ts

# Run tests in watch mode
npm test -- --watch

# Run tests matching pattern
npm test -- --testNamePattern="validateCoordinates"

# Update snapshots
npm test -- -u

# Run E2E tests (Detox)
detox test --configuration android.emu.debug
```

## Test File Template

```typescript
/**
 * [Component/Utility] Test Suite
 * Tests for [brief description of what's being tested]
 */

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { functionToTest } from '../path/to/function';

// Mock dependencies
jest.mock('dependency', () => ({
  method: jest.fn(),
}));

describe('[Component/Utility Name]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('feature group 1', () => {
    it('should handle success case', () => {
      // Arrange
      const input = 'test';
      
      // Act
      const result = functionToTest(input);
      
      // Assert
      expect(result).toBe('expected');
    });

    it('should handle error case', () => {
      // Test error handling
      expect(() => functionToTest(null)).toThrow();
    });

    it('should handle edge case', () => {
      // Test boundary conditions
      expect(functionToTest('')).toBeUndefined();
    });
  });

  describe('feature group 2', () => {
    // More tests...
  });
});
```

## Test Best Practices

### 1. Test Structure (AAA Pattern)
```typescript
it('should do something', () => {
  // Arrange - Set up test data
  const input = 'test input';
  
  // Act - Execute the function/action
  const result = functionToTest(input);
  
  // Assert - Verify the result
  expect(result).toBe('expected output');
});
```

### 2. Descriptive Test Names
✅ Good:
```typescript
it('should return error when latitude exceeds 90 degrees', () => {})
it('should format Indian phone number with +91 country code', () => {})
```

❌ Bad:
```typescript
it('test 1', () => {})
it('should work', () => {})
```

### 3. Test One Thing at a Time
```typescript
// ❌ Bad - testing multiple things
it('should validate and format phone', () => {
  expect(validatePhone('9876543210').isValid).toBe(true);
  expect(formatPhone('9876543210')).toBe('+91 98765 43210');
});

// ✅ Good - separate tests
it('should validate correct phone number', () => {
  const result = validatePhone('9876543210');
  expect(result.isValid).toBe(true);
});

it('should format phone number with country code', () => {
  const result = formatPhone('9876543210');
  expect(result).toBe('+91 98765 43210');
});
```

### 4. Test Edge Cases
Always test:
- Empty/null/undefined inputs
- Boundary values (min, max)
- Invalid data types
- Error conditions
- Async success and failure

### 5. Mock External Dependencies
```typescript
// Mock API calls
jest.mock('axios', () => ({
  request: jest.fn(),
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock native modules
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Alert: { alert: jest.fn() },
}));
```

### 6. Clean Up After Tests
```typescript
describe('MyComponent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
```

## Test Coverage Thresholds

Configure in `jest.config.js`:
```javascript
module.exports = {
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/utils/': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    './src/services/': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
```

## CI/CD Integration

### GitHub Actions Workflow
```yaml
- name: Run Tests
  run: npm test -- --coverage --maxWorkers=2

- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
    fail_ci_if_error: true

- name: Check Coverage Thresholds
  run: |
    if [ $(cat coverage/coverage-summary.json | jq '.total.lines.pct') -lt 80 ]; then
      echo "Coverage below 80%"
      exit 1
    fi
```

## Troubleshooting

### Common Issues

#### 1. "Cannot find module" errors
```bash
# Clear Jest cache
npm test -- --clearCache

# Reinstall node_modules
rm -rf node_modules
npm install
```

#### 2. Async tests timing out
```typescript
// Increase timeout for specific test
it('should complete async operation', async () => {
  // Test code
}, 10000); // 10 second timeout
```

#### 3. Mock not working
```typescript
// Ensure mock is hoisted before imports
jest.mock('module', () => ({...}));

// Mock must be at top of file, before imports
import { Component } from './Component';
```

## Continuous Improvement

### Weekly Goals
- Week 1: Core utilities (95% coverage)
- Week 2: API services (90% coverage)
- Week 3: Custom hooks (85% coverage)
- Week 4: Components (75% coverage)
- Week 5: E2E tests (3 critical flows)

### Code Review Checklist
- [ ] New code has corresponding tests
- [ ] Test coverage meets threshold
- [ ] Tests follow naming conventions
- [ ] Edge cases are covered
- [ ] Mocks are properly set up
- [ ] Tests are deterministic (no flakiness)

---

**Last Updated:** July 9, 2026  
**Target Completion:** July 30, 2026  
**Status:** In Progress (15/45 test files complete)
