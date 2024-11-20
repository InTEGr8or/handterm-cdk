/**
 * Test Suite for listRecentRepos Lambda Function
 *
 * Context:
 * The Lambda function uses dynamic import for @octokit/rest because it's an ESM module.
 * This has caused issues in the AWS Lambda environment where the bundled code attempts
 * to use require() instead of dynamic import, resulting in ERR_REQUIRE_ESM errors.
 *
 * Test Strategy:
 * 1. We deliberately DO NOT mock @octokit/rest to ensure the dynamic import is actually tested
 * 2. This helps verify that our bundling process correctly handles ESM modules
 * 3. The test environment should match AWS Lambda's environment as closely as possible
 *
 * If this test passes but the Lambda still fails in AWS, it indicates:
 * - Our bundling process might be converting dynamic imports to require()
 * - Or our test environment doesn't match AWS Lambda's environment closely enough
 */

import { handler } from '../listRecentRepos';

// Mock AWS SDK
jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
    CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
        send: jest.fn().mockResolvedValue({
            Username: 'test-user-id'
        })
    })),
    GetUserCommand: jest.fn()
}));

// Mock githubUtils
jest.mock('../githubUtils', () => ({
    getValidGitHubToken: jest.fn().mockResolvedValue('mock-github-token')
}));

// Deliberately NOT mocking @octokit/rest to test actual dynamic import behavior

describe('listRecentRepos Lambda', () => {
    it('should successfully perform dynamic import of @octokit/rest', async () => {
        // This test specifically verifies that the dynamic import works
        // If it fails with ERR_REQUIRE_ESM, our bundling process isn't handling ESM correctly
        const mockEvent = {
            headers: {
                Authorization: 'Bearer test-token'
            }
        };

        // Execute handler - this will attempt the dynamic import
        const result = await handler(mockEvent as any);

        // Verify response structure
        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(Array.isArray(body)).toBe(true);
        if (body.length > 0) {
            expect(body[0]).toHaveProperty('name');
            expect(body[0]).toHaveProperty('full_name');
            expect(body[0]).toHaveProperty('html_url');
            expect(body[0]).toHaveProperty('updated_at');
        }
    });

    it('should handle missing authorization token', async () => {
        const mockEvent = {
            headers: {}
        };

        const result = await handler(mockEvent as any);
        expect(result.statusCode).toBe(401);

        const body = JSON.parse(result.body);
        expect(body.error).toBe('No authorization token provided');
    });
});
