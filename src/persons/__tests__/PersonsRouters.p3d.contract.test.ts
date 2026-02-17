import { describe, expect, it, jest } from '@jest/globals';

const postMock = jest.fn();
const putMock = jest.fn();
const getMock = jest.fn();
const deleteMock = jest.fn();

jest.mock('../../index', () => ({
    app: {
        post: postMock,
        put: putMock,
        get: getMock,
        delete: deleteMock,
    },
}));

describe('PersonsRouters P3-D transition validation', () => {
    it('keeps legacy routes and v2 account/profile metadata routes', async () => {
        await import('../PersonsRouters');

        const postRoutes = postMock.mock.calls.map((call) => call[0]);
        const putRoutes = putMock.mock.calls.map((call) => call[0]);
        const getRoutes = getMock.mock.calls.map((call) => call[0]);
        const deleteRoutes = deleteMock.mock.calls.map((call) => call[0]);

        // Legacy person routes
        expect(postRoutes).toEqual(
            expect.arrayContaining(['/persons', '/person', '/systemUser']),
        );
        expect(putRoutes).toEqual(
            expect.arrayContaining(['/person/:id', '/user/:id']),
        );
        expect(deleteRoutes).toEqual(expect.arrayContaining(['/person/:id']));

        // V2 routes (account and profile metadata only - experiences moved to ExperienceRouters)
        expect(getRoutes).toEqual(
            expect.arrayContaining([
                '/v2/persons/:personId/account',
            ]),
        );
        expect(putRoutes).toEqual(
            expect.arrayContaining([
                '/v2/persons/:personId/account',
                '/v2/persons/:personId/profile',
            ]),
        );

        // Verify removed routes (GET /profile aggregation endpoint and all experience endpoints)
        expect(getRoutes).not.toContain('/v2/persons/:personId/profile');
        expect(getRoutes).not.toContain('/v2/persons/:personId/profile/experiences');
        expect(postRoutes).not.toContain('/v2/persons/:personId/profile/experiences');
        expect(putRoutes).not.toContain('/v2/persons/:personId/profile/experiences/:experienceId');
        expect(deleteRoutes).not.toContain('/v2/persons/:personId/profile/experiences/:experienceId');
    });
});
