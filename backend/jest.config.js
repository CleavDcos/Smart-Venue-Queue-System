module.exports = {
  testEnvironment: 'node',
  verbose: true,
  testMatch: ['**/tests/**/*.test.js'],
  forceExit: true, // Needed sometimes for mongoose
  clearMocks: true,
};
