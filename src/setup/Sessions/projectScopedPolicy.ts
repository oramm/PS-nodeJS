import { NextFunction, Request, Response } from 'express';
import { SystemRoleName } from '../../types/sessionTypes';
import ProjectAssignmentRepository from '../../persons/projectAssignments/ProjectAssignmentRepository';

/**
 * Warstwa autoryzacji dla ról ograniczonych do przypisań (kręgi zewnętrzne):
 * CONTRACT_WORKER (pracownik kontraktowy), CLIENT (klient), ENVI_COOPERATOR (współpracownik)
 * i EXTERNAL_USER (użytkownik zewnętrzny).
 *
 * PO CO. requireSession odpowiada tylko na pytanie "czy jest sesja" - każdy zalogowany
 * dociera do każdej trasy. Te role to osoby z zewnątrz, które pracują wyłącznie na tym,
 * do czego są przypisane, i nie mają widzieć faktur, ofert, dotacji ani zarządzania
 * użytkownikami. Dla nich domyślna odpowiedź brzmi 403, a dostęp dają wyłącznie trasy
 * z list poniżej.
 *
 * DWA PYTANIA, DWIE STAŁE. PROJECT_SCOPED_ROLES odpowiada "kto jest ograniczony do
 * przypisań". To, kto nie dostaje poczty projektu i nie może być osobą dodatkową kontraktu,
 * rozstrzyga osobno NO_PROJECT_MAIL_ROLES w mailboxAccessPolicy - współpracownik jest
 * ograniczony, ale pocztę przypisanych projektów ma (plan DOSTEP, decyzja D7).
 *
 * DLACZEGO ALLOWLISTA, A NIE BLOKLISTA. Nowa trasa dodana w przyszłości ma być domyślnie
 * niedostępna dla tych ról. Blocklista milcząco otwierałaby każdy nowy endpoint.
 *
 * ZAKRES DANYCH TO OSOBNA SPRAWA. Przepuszczenie trasy nie znaczy, że rola widzi na niej
 * wszystko - req.projectScope ustawiany niżej zawęża odczyty do przypisanych projektów
 * (repozytoria), a zapisy sprawdza ProjectScopeGuard. Ta warstwa decyduje "czy w ogóle",
 * tamte "które rekordy".
 *
 * MONTOWANIE. Bezpośrednio po requireSession, przed trasami rejestrowanymi inline w
 * index.ts i przed require() routerów. Odpowiada 403 wprost zamiast rzucać wyjątkiem,
 * bo globalny error handler raportowałby to jako 500 i wysyłał zgłoszenie błędu do zespołu.
 */

type RoutePattern = { method: string; path: string };

/**
 * Komplet tras wspólnych dla obu ról zakresowych. Wszystko spoza tej listy i spoza
 * dodatków per rola = 403. `:param` dopasowuje jeden segment ścieżki.
 */
const BASE_ROUTES: RoutePattern[] = [
    // Pomoc nadal wymaga osobistej sesji i dostępu przez POMOC_ROLES lub POMOC_USERS.
    { method: 'GET', path: '/pomoc/available' },
    { method: 'POST', path: '/pomoc/ask' },
    { method: 'GET', path: '/v2/privacy/system' },
    { method: 'POST', path: '/v2/privacy/system/acknowledgements' },
    // --- Start aplikacji: repozytoria ładowane przez frontend dla każdego zalogowanego.
    // Bez nich aplikacja kliencka nie wstaje (MainControllerReact.setRepostories).
    { method: 'POST', path: '/persons' }, // odpowiedź okrojona do danych podstawowych
    { method: 'POST', path: '/contractTypes' },
    { method: 'POST', path: '/documentTemplates' },
    { method: 'POST', path: '/contractRanges' },

    // --- Kontrakty i ich drzewo (odczyt zawężony do przypisanych projektów).
    { method: 'POST', path: '/contracts' },
    { method: 'POST', path: '/contractsWithChildren' },
    { method: 'POST', path: '/contractsSettlementData' },
    { method: 'POST', path: '/projects' },
    { method: 'POST', path: '/milestones' },
    { method: 'POST', path: '/cases' },
    { method: 'POST', path: '/tasks' },
    { method: 'POST', path: '/milestoneDates' },
    { method: 'POST', path: '/securities' },
    { method: 'GET', path: '/risks' },
    { method: 'GET', path: '/risk/:id' },
    { method: 'GET', path: '/caseEvents' },
    { method: 'GET', path: '/caseEvent/:id' },
    // Świadomie NIE ma tu /materialCards, /processes ani /contractRangesContracts:
    // ich routery nie są rejestrowane w index.ts (MaterialCardsRouters tworzy nawet
    // własną instancję express). Gdyby ktoś je kiedyś podpiął, rola nie ma ich dostać
    // w prezencie - wtedy trzeba świadomie dopisać wpis tutaj.

    // --- Słowniki i szablony (odczyt do formularzy; zapisy zostają zablokowane).
    { method: 'POST', path: '/milestoneTypes' },
    { method: 'POST', path: '/milestoneTemplates' },
    { method: 'POST', path: '/caseTypes' },
    { method: 'GET', path: '/caseTemplates' },
    { method: 'GET', path: '/caseTemplate/:id' },
    { method: 'GET', path: '/taskTemplates' },
    { method: 'GET', path: '/taskTemplate/:id' },
    { method: 'POST', path: '/milestoneTypeContractTypeAssociations' },
    { method: 'POST', path: '/cities' },

    // --- Sprawy i zadania: pełna praca operacyjna w przypisanych projektach.
    { method: 'POST', path: '/case' },
    { method: 'PUT', path: '/case/:id' },
    { method: 'DELETE', path: '/case/:id' },
    { method: 'POST', path: '/task' },
    { method: 'PUT', path: '/task/:id' },
    { method: 'DELETE', path: '/task/:id' },

    // --- Pisma przypisanych kontraktów.
    { method: 'POST', path: '/contractsLetters' },
    { method: 'POST', path: '/letters/incoming-number-check' },
    { method: 'POST', path: '/letterReact' },
    { method: 'PUT', path: '/letter/:id' },
    { method: 'DELETE', path: '/letter/:id' },
    { method: 'PUT', path: '/approveOurLetter/:id' },
    { method: 'PUT', path: '/exportOurLetterToPDF' },
    { method: 'PUT', path: '/appendLetterAttachments/:id' },
    { method: 'POST', path: '/letters/analyze' },
    { method: 'GET', path: '/sessionTaskStatus/:taskId' },

    // --- Spotkania i notatki ze spotkań.
    { method: 'POST', path: '/meetings' },
    { method: 'POST', path: '/meeting' },
    { method: 'PUT', path: '/meeting/:id' },
    { method: 'DELETE', path: '/meeting/:id' },
    { method: 'POST', path: '/contractMeetingNotes' },
    { method: 'POST', path: '/contractMeetingNote' },
    { method: 'PUT', path: '/contractMeetingNote/:id' },
    { method: 'DELETE', path: '/contractMeetingNote/:id' },
    { method: 'POST', path: '/meetingArrangements' },
    { method: 'POST', path: '/meetingArrangement' },
    { method: 'PUT', path: '/meetingArrangement/:id' },
    { method: 'PUT', path: '/meetingArrangement/:id/status' },
    { method: 'DELETE', path: '/meetingArrangement/:id' },

    // --- Podmioty: odczyt wszystkich + dodawanie (adresaci pism). Bez edycji i usuwania.
    { method: 'POST', path: '/entities' },
    { method: 'POST', path: '/entity' },
    { method: 'POST', path: '/entities/lookup-nip' },

    // --- Osoby: tylko lista podstawowa do pickerów (patrz POST /persons wyżej).
    { method: 'GET', path: '/persons/registering-editors' },

    // --- Moduły flagowe. Trasy są przepuszczone, ale faktyczny dostęp daje dopiero
    // flaga w StaffMembers (CanLogSiteVisits / IsDriver) sprawdzana wewnątrz modułu.
    { method: 'GET', path: '/site-visits' },
    { method: 'GET', path: '/site-visits/access' },
    { method: 'GET', path: '/site-visits/contracts' },
    { method: 'GET', path: '/site-visits/:id' },
    { method: 'GET', path: '/site-visits/photo/:gdFileId' },
    { method: 'POST', path: '/site-visits' },
    { method: 'GET', path: '/mileage/access' },
    { method: 'GET', path: '/mileage/drivers' },
    { method: 'GET', path: '/mileage/vehicles' },
    { method: 'POST', path: '/mileage/trip' },

    // --- Sesja i raportowanie błędów klienta.
    { method: 'GET', path: '/session' },
    { method: 'POST', path: '/logout' },
    { method: 'POST', path: '/client-error' },
];

/**
 * Czego klient ma ponad pracownika kontraktowego: przegląd raportów z wizyt na budowie.
 * Same trasy przeglądu zawężają dane do przypisanych projektów (SiteVisitRouters
 * przekazuje req.projectScope do repozytorium) - tutaj rozstrzyga się tylko "czy w ogóle".
 */
const CLIENT_EXTRA_ROUTES: RoutePattern[] = [
    { method: 'GET', path: '/site-visits/admin' },
    { method: 'GET', path: '/site-visits/admin/summary' },
];

/**
 * Czego współpracownik ma ponad pracownika kontraktowego: poczta przypisanych projektów
 * (D7). Którą skrzynkę konkretnie, rozstrzyga MailboxController.assertAccess (reguła
 * personMailboxes), a lista skrzynek (MailboxController.list) pokazuje tylko te, które daje ta sama reguła.
 */
const COOPERATOR_EXTRA_ROUTES: RoutePattern[] = [
    { method: 'GET', path: '/mailboxes' },
    { method: 'POST', path: '/mailboxes/:id/password' },
    { method: 'POST', path: '/mailboxes/:id/provision' },
    { method: 'POST', path: '/mailboxes/:id/agentCopy' },
    { method: 'POST', path: '/mailboxes/:id/project' },
];

/**
 * Użytkownik zewnętrzny: to, co obiecuje opis roli we froncie - wgląd w pisma kontraktów,
 * do których osoba jest przypisana (Persons_Contracts; filtr w LetterRepository). Bez zapisu
 * pism: zapisy pilnuje zakres projektów, a ta rola zakresu projektów nie ma.
 */
const EXTERNAL_USER_ROUTES: RoutePattern[] = [
    // Front pyta o Pomoc przy każdym starcie; samo pytanie odpowiada "niedostępna" (POMOC_ROLES).
    { method: 'GET', path: '/pomoc/available' },
    { method: 'GET', path: '/v2/privacy/system' },
    { method: 'POST', path: '/v2/privacy/system/acknowledgements' },
    // Start aplikacji (MainControllerReact.setRepostories) - jak w BASE_ROUTES.
    { method: 'POST', path: '/persons' },
    { method: 'POST', path: '/contractTypes' },
    { method: 'POST', path: '/documentTemplates' },
    { method: 'POST', path: '/contractRanges' },
    { method: 'POST', path: '/contractsLetters' },
    { method: 'GET', path: '/session' },
    { method: 'POST', path: '/logout' },
    { method: 'POST', path: '/client-error' },
];

/**
 * Role, których dostęp opisuje ta warstwa. Rola spoza tej mapy przechodzi dalej bez zmian
 * i bez zakresu projektów.
 */
const ROUTES_BY_ROLE: Partial<Record<SystemRoleName, RoutePattern[]>> = {
    [SystemRoleName.CONTRACT_WORKER]: BASE_ROUTES,
    [SystemRoleName.CLIENT]: [...BASE_ROUTES, ...CLIENT_EXTRA_ROUTES],
    [SystemRoleName.ENVI_COOPERATOR]: [...BASE_ROUTES, ...COOPERATOR_EXTRA_ROUTES],
    [SystemRoleName.EXTERNAL_USER]: EXTERNAL_USER_ROUTES,
};

/**
 * Role z mapy, którym zakres liczy się z przypisań do kontraktów (Persons_Contracts), a nie
 * do projektów. Pusty zakres projektów odciąłby im pisma przypisanych kontraktów, więc go
 * nie ustawiamy; ich jedyną trasę z danymi zawęża LetterRepository.
 */
export const CONTRACT_ASSIGNMENT_ROLES: SystemRoleName[] = [SystemRoleName.EXTERNAL_USER];

export const PROJECT_SCOPED_ROLES = Object.keys(
    ROUTES_BY_ROLE
) as SystemRoleName[];

/** Mirrors Express's default routing: case-insensitive, trailing slash ignored. */
function normalizePath(path: string): string {
    const lower = path.toLowerCase();
    return lower.length > 1 ? lower.replace(/\/+$/, '') : lower;
}

/**
 * '/case/:id' -> /^\/case\/[0-9]+$/
 *
 * `:id` celowo dopasowuje wyłącznie cyfry. Gdyby dopasowywał dowolny segment,
 * wpis `/site-visits/:id` otwierałby też `/site-visits/admin`, czyli przegląd wizyt
 * wszystkich osób - trasę, która ma zostać zamknięta. Identyfikatory nieliczbowe
 * (`:gdFileId`, `:taskId`) nie kolidują z żadną trasą siostrzaną, więc zostają szerokie.
 */
function patternToRegExp(path: string): RegExp {
    const escaped = normalizePath(path)
        .split('/')
        .map((segment) => {
            if (segment === ':id') return '[0-9]+';
            if (segment.startsWith(':')) return '[^/]+';
            return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('/');
    return new RegExp(`^${escaped}$`);
}

const COMPILED_ROUTES_BY_ROLE = new Map(
    Object.entries(ROUTES_BY_ROLE).map(([role, routes]) => [
        role,
        routes.map((route) => ({
            method: route.method.toUpperCase(),
            regExp: patternToRegExp(route.path),
        })),
    ])
);

export function isAllowedForRole(
    role: SystemRoleName | undefined,
    method: string,
    path: string
): boolean {
    const compiled = role && COMPILED_ROUTES_BY_ROLE.get(role);
    if (!compiled) return false;
    const normalized = normalizePath(path);
    const upperMethod = method.toUpperCase();
    return compiled.some(
        (route) =>
            route.method === upperMethod && route.regExp.test(normalized)
    );
}

/**
 * Czy rola w ogóle dociera do trasy: rola spoza tej warstwy (pracownicy ENVI) dociera
 * wszędzie, rola z mapy tylko do tras z listy. Czyta to przegląd dostępów (DOSTEP-7),
 * żeby ekran mówił to samo, co ta warstwa robi z żądaniem.
 */
export function roleReachesRoute(role: SystemRoleName | undefined, method: string, path: string): boolean {
    if (!role) return false;
    return !COMPILED_ROUTES_BY_ROLE.has(role) || isAllowedForRole(role, method, path);
}

export default async function projectScopedPolicy(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const userData = req.session?.userData;
    if (!userData) return next();
    const role = userData.systemRoleName;
    if (!COMPILED_ROUTES_BY_ROLE.has(role)) return next();

    if (!isAllowedForRole(role, req.method, req.path)) {
        // Głośno z rozmysłem: jeśli UI tej roli wywołuje trasę spoza listy, ten wpis
        // jest miejscem, w którym to widać - zamiast cichego "coś się nie ładuje".
        console.warn(
            `[ProjectScopedPolicy] Odmowa:: role: ${role} method: ${req.method} path: ${req.path} personId: ${userData.enviId}`
        );
        res.status(403).send({
            errorMessage: 'Brak uprawnień do tego zasobu.',
        });
        return;
    }

    if (CONTRACT_ASSIGNMENT_ROLES.includes(role)) return next();

    try {
        // Zakres liczony raz na żądanie i czytany dalej przez repozytoria i guardy zapisu.
        // Zakres danych daje tylko przypisanie do projektu (projectMembership.dataScopeProjectOurIds), nie rola w kontrakcie.
        // Brak przypisań daje pustą listę, którą warstwa SQL traktuje jako "nic nie widać".
        req.projectScope = {
            projectOurIds:
                await ProjectAssignmentRepository.getDataScopeProjectOurIds(
                    userData.enviId
                ),
        };
        next();
    } catch (error) {
        next(error);
    }
}
