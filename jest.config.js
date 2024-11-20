module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/lambda'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      useESM: false,
    }]
  },
  preset: 'ts-jest',
  setupFiles: ['dotenv/config'],
  moduleFileExtensions: [
    "ts",
    "tsx",
    "js",
    "jsx",
    "json",
    "node"
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  // Transform @octokit modules
  transformIgnorePatterns: [
    '/node_modules/(?!(@octokit)/)'
  ],
  transform: {
    '^.+\\.(ts|tsx|js|jsx|mjs)$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      useESM: true
    }]
  }
};
