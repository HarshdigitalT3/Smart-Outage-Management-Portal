'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test_*.test.js', '**/test_*.int.test.js', '**/test_*.spec.js'],
  verbose: true,
  // Integration tests may be slower due to network.
  testTimeout: 30000,
};
