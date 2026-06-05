// Intentionally minimal test setup; avoid importing unavailable matchers.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
