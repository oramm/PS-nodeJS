import { describe, expect, it, jest } from '@jest/globals';

const postMock = jest.fn();
const putMock = jest.fn();
const getMock = jest.fn();
const deleteMock = jest.fn();

jest.mock('../PersonsController', () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
        addFromDto: jest.fn(),
        editFromDto: jest.fn(),
        editUserFromDto: jest.fn(),
        deleteFromDto: jest.fn(),
        addNewSystemUser: jest.fn(),
        getPersonAccountV2: jest.fn(),
        upsertPersonAccountV2: jest.fn(),
        getPersonProfileV2: jest.fn(),
        upsertPersonProfileV2: jest.fn(),
    },
}));

jest.mock('../../index', () => ({
    app: {
        post: postMock,
        put: putMock,
        get: getMock,
        delete: deleteMock,
    },
}));

const PersonsController = (jest.requireMock('../PersonsController') as any)
    .default;

describe('PersonsRouters P3-D transition validation', () => {
    let accountPutHandler: any;

    it('keeps legacy routes and v2 account/profile metadata routes', async () => {
        await import('../PersonsRouters');

        const postRoutes = postMock.mock.calls.map((call) => call[0]);
        const putRoutes = putMock.mock.calls.map((call) => call[0]);
        const getRoutes = getMock.mock.calls.map((call) => call[0]);
        const deleteRoutes = deleteMock.mock.calls.map((call) => call[0]);
        accountPutHandler = putMock.mock.calls.find(
            (call) => call[0] === '/v2/persons/:personId/account',
        )?.[1];

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
                '/v2/persons/:personId/profile',
            ]),
        );
        expect(putRoutes).toEqual(
            expect.arrayContaining([
                '/v2/persons/:personId/account',
                '/v2/persons/:personId/profile',
            ]),
        );

        // Verify removed routes (all experience endpoints)
        expect(getRoutes).not.toContain(
            '/v2/persons/:personId/profile/experiences',
        );
        expect(postRoutes).not.toContain(
            '/v2/persons/:personId/profile/experiences',
        );
        expect(putRoutes).not.toContain(
            '/v2/persons/:personId/profile/experiences/:experienceId',
        );
        expect(deleteRoutes).not.toContain(
            '/v2/persons/:personId/profile/experiences/:experienceId',
        );
    });

    it('rejects empty account update payload with HTTP 400 before controller call', async () => {
        const req = {
            params: { personId: '591' },
            parsedBody: {},
            body: {},
        } as any;
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
            send: jest.fn(),
        } as any;
        const next = jest.fn();

        await accountPutHandler(req, res, next);

        expect(PersonsController.upsertPersonAccountV2).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: 'Brak danych konta do aktualizacji. Przekaż co najmniej jedno pole konta.',
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('accepts isActive-only payload as a valid account update', async () => {
        const req = {
            params: { personId: '591' },
            parsedBody: { isActive: false },
            body: {},
        } as any;
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
            send: jest.fn(),
        } as any;
        const next = jest.fn();

        PersonsController.upsertPersonAccountV2.mockResolvedValueOnce({
            personId: 591,
            isActive: false,
        });

        await accountPutHandler(req, res, next);

        expect(PersonsController.upsertPersonAccountV2).toHaveBeenCalledWith({
            personId: 591,
            systemRoleId: undefined,
            systemEmail: undefined,
            googleId: undefined,
            googleRefreshToken: undefined,
            microsoftId: undefined,
            microsoftRefreshToken: undefined,
            isActive: false,
        });
        expect(res.send).toHaveBeenCalledWith({
            personId: 591,
            isActive: false,
        });
        expect(res.status).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });
});
