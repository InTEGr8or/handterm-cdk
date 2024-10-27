module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      useESM: true,
    }]
  },
  preset: 'ts-jest',
  setupFiles: ['dotenv/config'],
  moduleNameMapper: {
    '^@octokit/(.*)$': '<rootDir>/node_modules/@octokit/$1',
  }
};