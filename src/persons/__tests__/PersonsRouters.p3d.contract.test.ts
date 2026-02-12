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
    it('keeps legacy routes registered while dedicated v2 routes are available', async () => {
        await import('../PersonsRouters');

        const postRoutes = postMock.mock.calls.map((call) => call[0]);
        const putRoutes = putMock.mock.calls.map((call) => call[0]);
        const getRoutes = getMock.mock.calls.map((call) => call[0]);
        const deleteRoutes = deleteMock.mock.calls.map((call) => call[0]);

        expect(postRoutes).toEqual(
            expect.arrayContaining(['/persons', '/person', '/systemUser']),
        );
        expect(putRoutes).toEqual(
            expect.arrayContaining(['/person/:id', '/user/:id']),
        );
        expect(deleteRoutes).toEqual(expect.arrayContaining(['/person/:id']));

        expect(getRoutes).toEqual(
            expect.arrayContaining([
                '/v2/persons/:personId/account',
                '/v2/persons/:personId/profile',
                '/v2/persons/:personId/profile/experiences',
            ]),
        );
        expect(putRoutes).toEqual(
            expect.arrayContaining([
                '/v2/persons/:personId/account',
                '/v2/persons/:personId/profile',
                '/v2/persons/:personId/profile/experiences/:experienceId',
            ]),
        );
        expect(postRoutes).toEqual(
            expect.arrayContaining(['/v2/persons/:personId/profile/experiences']),
        );
        expect(deleteRoutes).toEqual(
            expect.arrayContaining([
                '/v2/persons/:personId/profile/experiences/:experienceId',
            ]),
        );
    });
});
