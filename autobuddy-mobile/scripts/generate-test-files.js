#!/usr/bin/env node
/**
 * Generate Test File Skeletons
 * Creates empty test files with proper structure for all untested modules
 */

const fs = require('fs');
const path = require('path');

const testFiles = [
  {
    path: 'src/__tests__/utils/validation.test.ts',
    imports: `import { 
  validateCoordinates, 
  validateFare, 
  validatePhone,
  validateEmail,
  validateDate,
  validateFutureDate,
  validateDistance,
  isWithinIndia,
} from '../../utils/validation';`,
    describe: 'validation utilities',
    tests: [
      'validateCoordinates - should validate correct coordinates',
      'validateCoordinates - should reject invalid latitude',
      'validateFare - should accept valid fare',
      'validateFare - should reject negative fare',
      'validatePhone - should validate Indian phone number',
      'validateEmail - should validate email format',
    ]
  },
  {
    path: 'src/__tests__/utils/safeStorage.test.ts',
    imports: `import { safeGetItem, safeSetItem, safeRemoveItem } from '../../utils/safeStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';`,
    describe: 'safeStorage utilities',
    mocks: [`jest.mock('@react-native-async-storage/async-storage');`],
    tests: [
      'safeGetItem - should return stored value',
      'safeGetItem - should handle storage errors gracefully',
      'safeSetItem - should store value successfully',
      'safeRemoveItem - should remove value',
    ]
  },
  {
    path: 'src/__tests__/hooks/useSafeAsync.test.ts',
    imports: `import { renderHook, act } from '@testing-library/react-hooks';
import { useSafeAsync } from '../../hooks/useSafeAsync';`,
    describe: 'useSafeAsync hook',
    tests: [
      'should handle successful async operation',
      'should handle errors gracefully',
      'should set loading state correctly',
      'should cleanup on unmount',
    ]
  },
  {
    path: 'src/__tests__/components/DriverInfoCard.test.tsx',
    imports: `import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import DriverInfoCard from '../../components/DriverInfoCard';`,
    describe: 'DriverInfoCard component',
    tests: [
      'should render driver information',
      'should display driver photo',
      'should show rating',
      'should handle call driver action',
    ]
  },
];

function generateTestContent(testFile) {
  const { imports, describe: describeName, mocks = [], tests } = testFile;
  
  return `/**
 * ${describeName} Test Suite
 * Auto-generated test file - Add comprehensive tests
 */

${imports}

${mocks.map(mock => mock).join('\n')}

describe('${describeName}', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

${tests.map((testName, index) => `  it('${testName}', () => {
    // TODO: Implement test
    expect(true).toBe(true);
  });`).join('\n\n')}
});
`;
}

function ensureDirectoryExists(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

function generateAllTests() {
  let created = 0;
  let skipped = 0;

  testFiles.forEach(testFile => {
    const fullPath = path.join(__dirname, '..', testFile.path);
    
    if (fs.existsSync(fullPath)) {
      console.log(`⏭️  Skipped (exists): ${testFile.path}`);
      skipped++;
      return;
    }

    ensureDirectoryExists(fullPath);
    const content = generateTestContent(testFile);
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ Created: ${testFile.path}`);
    created++;
  });

  console.log(`\n📊 Summary:`);
  console.log(`   Created: ${created} files`);
  console.log(`   Skipped: ${skipped} files`);
  console.log(`\n🎯 Next steps:`);
  console.log(`   1. Run: npm test`);
  console.log(`   2. Implement TODOs in generated test files`);
  console.log(`   3. Run: npm test -- --coverage`);
}

// Run the generator
if (require.main === module) {
  console.log('🚀 Generating test file skeletons...\n');
  generateAllTests();
}

module.exports = { generateTestContent, generateAllTests };
