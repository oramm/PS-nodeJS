/**
 * Integration Test Example
 *
 * Integration tests verify that multiple components work together correctly.
 * Unlike unit tests, they may use real database connections or external services.
 *
 * Run separately from unit tests: npm run test:integration
 */

// Mock BusinessObject to avoid circular dependencies
jest.mock('../../BussinesObject');
// Mock dependencies - Jest will use __mocks__ folder automatically
jest.mock('../OfferRepository');

import OffersController from '../OffersController';
import OfferRepository from '../OfferRepository';
import ToolsDb from '../../tools/ToolsDb';
import { OffersSearchParams } from '../OfferRepository';

// Mark as integration test
describe('OffersController Integration Tests', () => {
    let connection: any;

    beforeAll(async () => {
        // Setup: Connect to test database
        // connection = await ToolsDb.getPoolConnectionWithTimeout();

        // NOTE: These tests are COMMENTED OUT because they require:
        // 1. Test database setup
        // 2. Test data seeding
        // 3. Database cleanup after tests

        console.log('Integration tests require database setup');
    });

    afterAll(async () => {
        // Cleanup: Close database connection
        // if (connection) connection.release();
    });

    describe('getOffersList with real database', () => {
        it.skip('should retrieve offers from database', async () => {
            // Arrange
            const searchParams: OffersSearchParams[] = [
                { alias: 'TEST-001', offerBondStatuses: [] },
            ];

            // Act
            const offers = await OffersController.getOffersList(searchParams);

            // Assert
            expect(offers).toBeDefined();
            expect(Array.isArray(offers)).toBe(true);
            // expect(offers.length).toBeGreaterThan(0);
        });

        it.skip('should handle empty results', async () => {
            // Arrange
            const searchParams: OffersSearchParams[] = [
                { alias: 'NON-EXISTENT', offerBondStatuses: [] },
            ];

            // Act
            const offers = await OffersController.getOffersList(searchParams);

            // Assert
            expect(offers).toBeDefined();
            expect(offers.length).toBe(0);
        });
    });

    describe('Full workflow: create -> edit -> delete', () => {
        it.skip('should complete full offer lifecycle', async () => {
            // This would test the complete flow:
            // 1. Create offer (addNew)
            // 2. Verify it exists in DB
            // 3. Update offer (edit)
            // 4. Verify changes in DB
            // 5. Delete offer
            // 6. Verify it's gone from DB
            // NOTE: Requires transaction support and rollback for test isolation
        });
    });
});

/**
 * Setup Guide for Integration Tests:
 *
 * 1. Create test database:
 *    CREATE DATABASE ps_nodejs_test;
 *
 * 2. Add test database config in .env.test:
 *    DB_HOST=localhost
 *    DB_USER=test_user
 *    DB_PASSWORD=test_password
 *    DB_NAME=ps_nodejs_test
 *
 * 3. Seed test data:
 *    - Create script to populate test data
 *    - Use beforeAll() to run seeding
 *    - Use afterAll() to cleanup
 *
 * 4. Run integration tests separately:
 *    npm run test:integration
 *
 * 5. Best practices:
 *    - Use transactions and rollback for each test
 *    - Don't rely on test execution order
 *    - Clean up all test data
 *    - Use unique IDs/aliases for test data
 */
