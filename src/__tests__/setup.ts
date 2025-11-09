// Global test setup
// This file is run before all tests

// Extend Jest matchers if needed
// expect.extend({...});

// Setup global mocks
global.console = {
    ...console,
    // Suppress console.log in tests unless needed
    log: jest.fn(),
    group: jest.fn(),
    groupEnd: jest.fn(),
};

// Setup environment variables for tests
process.env.NODE_ENV = 'test';
