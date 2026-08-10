import projectScopedPolicy, { isAllowedForRole } from '../projectScopedPolicy';
import { SystemRoleName } from '../../../types/sessionTypes';
import ProjectAssignmentRepository from '../../../persons/projectAssignments/ProjectAssignmentRepository';

jest.mock('../../../persons/projectAssignments/ProjectAssignmentRepository');

const mockedRepository = ProjectAssignmentRepository as jest.Mocked<
    typeof ProjectAssignmentRepository
>;

function makeSession(systemRoleName: SystemRoleName, systemRoleId: number) {
    return {
        enviId: 900,
        systemEmail: 'ktos@example.com',
        userName: 'Rola zakresowa',
        picture: '',
        systemRoleName,
        systemRoleId,
    };
}

const CONTRACT_WORKER = makeSession(SystemRoleName.CONTRACT_WORKER, 6);
const CLIENT = makeSession(SystemRoleName.CLIENT, 7);

/** Zrąb uprawnień jest wspólny dla obu ról zakresowych - różnice testujemy osobno. */
const SCOPED_ROLES: [string, ReturnType<typeof makeSession>][] = [
    ['pracownik kontraktowy', CONTRACT_WORKER],
    ['klient', CLIENT],
];

const allowed = (role: SystemRoleName) => (method: string, path: string) =>
    isAllowedForRole(role, method, path);
const workerAllows = allowed(SystemRoleName.CONTRACT_WORKER);
const clientAllows = allowed(SystemRoleName.CLIENT);

async function run(method: string, path: string, userData: any) {
    const req: any = { method, path, ip: '::1', session: { userData } };
    const res: any = {
        statusCode: undefined,
        body: undefined,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        send(payload: any) {
            this.body = payload;
            return this;
        },
    };
    const next = jest.fn();

    await projectScopedPolicy(req, res, next);
    return { req, res, next };
}

describe('projectScopedPolicy', () => {
    beforeEach(() => {
        mockedRepository.getAssignedProjectOurIds.mockResolvedValue([
            '2023.10',
        ]);
    });

    describe('moduły zamknięte dla ról zakresowych', () => {
        // Wprost z ustaleń: bez faktur, ofert, dotacji i zarządzania użytkownikami.
        const BLOCKED: [string, string][] = [
            ['POST', '/invoices'],
            ['POST', '/invoice'],
            ['PUT', '/invoice/123'],
            ['DELETE', '/invoice/123'],
            ['POST', '/invoice/123/ksef/send'],
            ['POST', '/invoiceItems'],
            ['GET', '/cost-invoices'],
            ['POST', '/bank-transfers'],
            ['POST', '/offers'],
            ['POST', '/offer'],
            ['PUT', '/deleteOfferBond/640'],
            ['POST', '/offersLetters'],
            ['POST', '/mailsToCheck'],
            ['POST', '/financialAidProgrammes'],
            ['POST', '/focusAreas'],
            ['POST', '/applicationCalls'],
            ['POST', '/needs'],
            ['POST', '/person'],
            ['PUT', '/person/5'],
            ['DELETE', '/person/5'],
            ['POST', '/systemUser'],
            ['PUT', '/user/5'],
            ['PUT', '/v2/persons/5/account'],
            ['GET', '/v2/persons/5/profile'],
            ['PUT', '/v2/persons/5/project-assignments'],
            ['POST', '/roles'],
            ['POST', '/role'],
            ['GET', '/scrumboard/persons'],
            ['POST', '/scrumboard/contractStatuses'],
            ['POST', '/get-token'],
            ['GET', '/admin/bug-events'],
            ['POST', '/maintenance/personsRefresh'],
            ['POST', '/ai/analyze-document'],
            ['PUT', '/entity/5'],
            ['DELETE', '/entity/5'],
            ['POST', '/contractReact'],
            ['PUT', '/contract/5'],
            ['DELETE', '/contract/5'],
            ['POST', '/project'],
            ['POST', '/milestone'],
            ['PUT', '/milestoneDate/5'],
            ['POST', '/security'],
            ['POST', '/city'],
        ];

        describe.each(SCOPED_ROLES)('%s', (_label, userData) => {
            it.each(BLOCKED)('odmawia %s %s', async (method, path) => {
                const { res, next } = await run(method, path, userData);

                expect(res.statusCode).toBe(403);
                expect(next).not.toHaveBeenCalled();
            });
        });
    });

    describe('trasy potrzebne do pracy operacyjnej', () => {
        const ALLOWED: [string, string][] = [
            // start aplikacji - bez tych repozytoriów aplikacja kliencka nie wstaje
            ['POST', '/persons'],
            ['POST', '/contractTypes'],
            ['POST', '/documentTemplates'],
            ['POST', '/contractRanges'],
            // kontrakty i drzewo
            ['POST', '/contracts'],
            ['POST', '/contractsWithChildren'],
            ['POST', '/contractsSettlementData'],
            ['POST', '/projects'],
            ['POST', '/cases'],
            ['POST', '/tasks'],
            ['POST', '/milestoneDates'],
            ['POST', '/securities'],
            // praca operacyjna
            ['POST', '/case'],
            ['PUT', '/case/12'],
            ['DELETE', '/case/12'],
            ['POST', '/task'],
            ['PUT', '/task/12'],
            ['DELETE', '/task/12'],
            ['POST', '/letterReact'],
            ['PUT', '/letter/12'],
            ['DELETE', '/letter/12'],
            ['POST', '/contractsLetters'],
            ['POST', '/meeting'],
            ['POST', '/entity'],
            ['POST', '/entities'],
            // moduły flagowe - dostęp rozstrzyga StaffMembers wewnątrz modułu
            ['GET', '/site-visits/access'],
            ['GET', '/mileage/access'],
        ];

        describe.each(SCOPED_ROLES)('%s', (_label, userData) => {
            it.each(ALLOWED)('przepuszcza %s %s', async (method, path) => {
                const { res, next } = await run(method, path, userData);

                expect(res.statusCode).toBeUndefined();
                expect(next).toHaveBeenCalled();
            });
        });
    });

    describe('przegląd wizyt - jedyna różnica między rolami', () => {
        const OVERVIEW: [string, string][] = [
            ['GET', '/site-visits/admin'],
            ['GET', '/site-visits/admin/summary'],
        ];

        it.each(OVERVIEW)(
            'klient dostaje %s %s (dane zawęża req.projectScope)',
            async (method, path) => {
                const { res, next } = await run(method, path, CLIENT);

                expect(res.statusCode).toBeUndefined();
                expect(next).toHaveBeenCalled();
            }
        );

        it.each(OVERVIEW)(
            'pracownik kontraktowy nie dostaje %s %s',
            async (method, path) => {
                const { res, next } = await run(method, path, CONTRACT_WORKER);

                expect(res.statusCode).toBe(403);
                expect(next).not.toHaveBeenCalled();
            }
        );
    });

    describe.each(SCOPED_ROLES)('zakres projektów - %s', (_label, userData) => {
        it('domyślnie odmawia trasie, o której nic nie wie - nowy endpoint nie otwiera się sam', async () => {
            const { res, next } = await run(
                'POST',
                '/zupelnie-nowy-modul',
                userData
            );

            expect(res.statusCode).toBe(403);
            expect(next).not.toHaveBeenCalled();
        });

        it('ustawia zakres projektów na żądaniu po przepuszczeniu', async () => {
            const { req, next } = await run('POST', '/contracts', userData);

            expect(next).toHaveBeenCalled();
            expect(req.projectScope).toEqual({ projectOurIds: ['2023.10'] });
        });

        it('brak przypisań daje pustą listę, a nie brak filtra', async () => {
            mockedRepository.getAssignedProjectOurIds.mockResolvedValue([]);

            const { req } = await run('POST', '/contracts', userData);

            expect(req.projectScope).toEqual({ projectOurIds: [] });
        });
    });

    describe('pozostałe role', () => {
        const OTHER_ROLES = [
            makeSession(SystemRoleName.ADMIN, 1),
            makeSession(SystemRoleName.ENVI_MANAGER, 2),
            makeSession(SystemRoleName.ENVI_EMPLOYEE, 3),
            makeSession(SystemRoleName.ENVI_COOPERATOR, 4),
            makeSession(SystemRoleName.EXTERNAL_USER, 5),
        ];

        it('przepuszcza je bez zmian i bez zakresu - ta warstwa ich nie dotyczy', async () => {
            for (const userData of OTHER_ROLES) {
                for (const [method, path] of [
                    ['POST', '/invoices'],
                    ['POST', '/systemUser'],
                    ['POST', '/get-token'],
                ]) {
                    const { req, res, next } = await run(
                        method,
                        path,
                        userData
                    );

                    expect(res.statusCode).toBeUndefined();
                    expect(next).toHaveBeenCalled();
                    expect(req.projectScope).toBeUndefined();
                }
            }
        });

        it('nie pyta bazy o przypisania dla ról nieograniczonych', async () => {
            await run('POST', '/invoices', makeSession(SystemRoleName.ADMIN, 1));

            expect(
                mockedRepository.getAssignedProjectOurIds
            ).not.toHaveBeenCalled();
        });
    });

    describe('dopasowanie ścieżek', () => {
        it('ignoruje wielkość liter i końcowy ukośnik - tak jak robi to Express', () => {
            expect(workerAllows('POST', '/Contracts')).toBe(true);
            expect(workerAllows('POST', '/contracts/')).toBe(true);
        });

        it(':id dopasowuje jeden segment, nie kilka', () => {
            expect(workerAllows('PUT', '/case/12')).toBe(true);
            expect(workerAllows('PUT', '/case/12/status')).toBe(false);
        });

        it(':id to tylko cyfry - inaczej /site-visits/:id otworzyłoby /site-visits/admin', () => {
            expect(workerAllows('GET', '/site-visits/12')).toBe(true);
            expect(workerAllows('GET', '/site-visits/admin')).toBe(false);
            expect(workerAllows('GET', '/site-visits/admin/summary')).toBe(
                false
            );
            // Klient ma przegląd z jawnego wpisu, a nie z rozlanego :id - podgląd
            // pojedynczej wizyty dalej wymaga identyfikatora liczbowego.
            expect(clientAllows('GET', '/site-visits/admin')).toBe(true);
            expect(clientAllows('GET', '/site-visits/admin/cokolwiek')).toBe(
                false
            );
        });

        it('rozróżnia metodę HTTP', () => {
            expect(workerAllows('POST', '/entity')).toBe(true);
            expect(workerAllows('PUT', '/entity/5')).toBe(false);
            // Przegląd wizyt to wyłącznie odczyt.
            expect(clientAllows('POST', '/site-visits/admin')).toBe(false);
        });

        it('rola spoza mapy nie dostaje niczego z tej warstwy', () => {
            expect(allowed(SystemRoleName.ADMIN)('POST', '/contracts')).toBe(
                false
            );
        });
    });
});
