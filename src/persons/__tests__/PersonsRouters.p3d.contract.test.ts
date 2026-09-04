import { describe, expect, it, jest } from '@jest/globals';
import requireUserManagementRole, {
    requireStaffRole,
} from '../../setup/Sessions/requireUserManagementRole';

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
        // PER-2: trasy mają teraz bramkę roli PRZED handlerem, więc handler jest ostatnim
        // argumentem, nie drugim.
        accountPutHandler = putMock.mock.calls
            .find((call) => call[0] === '/v2/persons/:personId/account')
            ?.slice(-1)[0];

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

        // PER-2 - bramki ról. Assercje siedzą w tym samym teście co import routera:
        // `clearMocks` czyści mock.calls między testami, a moduł rejestruje trasy tylko raz
        // (kolejny `import` dostaje wersję z cache i niczego nie zapisuje).
        // Bez tego testu bramkę można usunąć przy refaktorze i nikt tego nie zauważy -
        // luka wzięła się właśnie stąd: trasa konta powstała obok trasy przypisań,
        // która bramkę miała.
        const middlewareOf = (calls: unknown[][], path: string): unknown[] => {
            const call = calls.find((entry) => entry[0] === path);
            expect(call).toBeDefined();
            return (call as unknown[]).slice(1, -1);
        };

        const getCalls = getMock.mock.calls as unknown[][];
        const putCalls = putMock.mock.calls as unknown[][];
        const postCalls = postMock.mock.calls as unknown[][];
        const deleteCalls = deleteMock.mock.calls as unknown[][];

        expect(
            middlewareOf(getCalls, '/v2/persons/:personId/account'),
        ).toContain(requireUserManagementRole);
        expect(
            middlewareOf(putCalls, '/v2/persons/:personId/account'),
        ).toContain(requireUserManagementRole);
        expect(middlewareOf(putCalls, '/user/:id')).toContain(
            requireUserManagementRole,
        );
        expect(middlewareOf(postCalls, '/systemUser')).toContain(
            requireUserManagementRole,
        );

        expect(middlewareOf(postCalls, '/person')).toContain(requireStaffRole);
        expect(middlewareOf(putCalls, '/person/:id')).toContain(
            requireStaffRole,
        );
        expect(middlewareOf(deleteCalls, '/person/:id')).toContain(
            requireStaffRole,
        );

        // Lista osób zostaje otwarta dla każdej zalogowanej roli (zawężenie danych dla ról
        // zewnętrznych to temat packa RODO, nie tego).
        expect(middlewareOf(postCalls, '/persons')).toHaveLength(0);
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

    it('zapis WŁASNEJ roli kasuje sesję wołającego i mówi o tym w odpowiedzi (D-PER-10)', async () => {
        // Bez tego kroku mechanizm sesji próbowałby po odpowiedzi odświeżyć sesję, którą
        // kontroler już skasował z magazynu, i serwer zgłaszałby „Cannot set headers".
        const destroy = jest.fn((cb: () => void) => cb());
        const req = {
            params: { personId: '591' },
            parsedBody: { systemRoleId: 2 },
            body: {},
            session: { userData: { enviId: 591, systemRoleId: 3 }, destroy },
        } as any;
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
            send: jest.fn(),
        } as any;
        const next = jest.fn();
        PersonsController.upsertPersonAccountV2.mockResolvedValueOnce({
            personId: 591,
            systemRoleId: 2,
        });

        await accountPutHandler(req, res, next);

        expect(destroy).toHaveBeenCalledTimes(1);
        expect(res.send).toHaveBeenCalledWith({
            personId: 591,
            systemRoleId: 2,
            _selfSessionRevoked: true,
        });
        expect(next).not.toHaveBeenCalled();
    });

    it.each([
        ['cudza rola', { enviId: 7, systemRoleId: 3 }, { systemRoleId: 2 }],
        ['własna, ale ta sama rola', { enviId: 591, systemRoleId: 3 }, { systemRoleId: 3 }],
        ['własne konto bez roli w treści', { enviId: 591, systemRoleId: 3 }, { fidmanEnabled: true }],
    ])('%s: sesja wołającego zostaje, odpowiedź bez znacznika', async (_label, userData, body) => {
        const destroy = jest.fn((cb: () => void) => cb());
        const req = {
            params: { personId: '591' },
            parsedBody: body,
            body: {},
            session: { userData, destroy },
        } as any;
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
            send: jest.fn(),
        } as any;
        PersonsController.upsertPersonAccountV2.mockResolvedValueOnce({
            personId: 591,
            systemRoleId: (body as any).systemRoleId ?? 3,
        });

        await accountPutHandler(req, res, jest.fn());

        expect(destroy).not.toHaveBeenCalled();
        expect(res.send.mock.calls[0][0]).not.toHaveProperty('_selfSessionRevoked');
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
