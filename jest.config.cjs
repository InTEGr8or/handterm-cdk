/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '@octokit/app': '<rootDir>/test/lambda-sim/mock-app.js',
    '@octokit/rest': '<rootDir>/test/lambda-sim/mock-rest.js'
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      useESM: true
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@octokit)/)'
  ],
  testMatch: [
    '**/lambda/**/__tests__/**/*.ts?(x)',
    '!**/dist/**',
    '!**/cdk.out/**',
    '!**/*.d.ts'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  globals: {
    'ts-jest': {
      isolatedModules: true,
      useESM: true
    },
  },
  testTimeout: 60000,
  verbose: true,
  testEnvironmentOptions: {
    url: 'http://localhost'
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/cdk.out/',
    '\\.d\\.ts$',
    'tests/github_auth\\.test\\.ts',
    'tests/e2e\\.test\\.ts'
  ]
};
