/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  // electron is a native module — map it to our manual mock
  moduleNameMapper: {
    '^electron$': '<rootDir>/tests/__mocks__/electron.js',
  },
};
