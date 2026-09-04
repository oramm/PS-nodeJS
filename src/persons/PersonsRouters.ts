import PersonsController from './PersonsController';
import { app } from '../index';
import { Request, Response } from 'express';
import { PROJECT_SCOPED_ROLES } from '../setup/Sessions/projectScopedPolicy';
import requireUserManagementRole, {
    requireStaffRole,
} from '../setup/Sessions/requireUserManagementRole';

const ACCOUNT_UPSERT_WRITE_FIELDS = [
    'systemRoleId',
    'systemEmail',
    'googleId',
    'googleRefreshToken',
    'microsoftId',
    'microsoftRefreshToken',
    'isActive',
    'fidmanEnabled',
] as const;

const parsePositiveInt = (raw: string, fieldName: string): number => {
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${fieldName} must be a positive integer`);
    }
    return value;
};

const hasAccountUpsertWriteField = (payload: any): boolean => {
    return ACCOUNT_UPSERT_WRITE_FIELDS.some(
        (fieldName) => payload?.[fieldName] !== undefined,
    );
};

/**
 * Wyszukuje osoby według podanych kryteriów.
 * Body: { orConditions: PersonsSearchParams[] }
 * Returns: Person[]
 */
app.post('/persons', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await PersonsController.find(orConditions);
        // Role zakresowe (pracownik kontraktowy, klient) dostają tylko tyle, ile
        // potrzebują listy wyboru osób (np. właściciel zadania). Reszta profilu - dane
        // kontaktowe, podmiot, rola systemowa - nie jest im do niczego potrzebna i nie ma
        // po co wychodzić z serwera.
        const role = req.session.userData?.systemRoleName;
        if (role && PROJECT_SCOPED_ROLES.includes(role)) {
            res.send(
                result.map((person) => ({
                    id: person.id,
                    name: person.name,
                    surname: person.surname,
                    email: person.email,
                })),
            );
            return;
        }
        res.send(result);
    } catch (error) {
        next(error);
    }
});

/**
 * Dodaje nową osobę (dane podstawowe bez konta systemowego).
 * Body: { name, surname, entityId, position?, email?, cellphone?, phone?, comment? }
 * Returns: Person
 */
app.post(
    '/person',
    requireStaffRole,
    async (req: Request, res: Response, next) => {
        try {
            const item = await PersonsController.addFromDto(req.body);
            res.send(item);
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Edytuje dane osoby.
 * Params: id
 * Body: { id, _fieldsToUpdate: string[], ...fields }
 * Returns: Person
 */
app.put(
    '/person/:id',
    requireStaffRole,
    async (req: Request, res: Response, next) => {
        try {
            const fieldsToUpdate = req.parsedBody._fieldsToUpdate;
            const item = await PersonsController.editFromDto(
                req.parsedBody,
                fieldsToUpdate,
            );
            res.send(item);
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Edytuje użytkownika z synchronizacją ScrumSheet.
 * @deprecated Używaj PUT /person/:id dla danych osobowych i PUT /v2/persons/:id/account dla konta.
 * UWAGA: v2 nie synchronizuje ScrumSheet automatycznie - endpoint zostanie wycofany po dodaniu tej funkcjonalności do v2.
 *
 * PER-5, decyzja D-PER-5 wariant (a) (2026-09-03): trasa ZOSTAJE, za bramką
 * `requireUserManagementRole`. Front nie woła jej od PER-3 (ekran „Dodawanie użytkowników"
 * skasowany w PER-5), ale to jedyna droga, która po zmianie osoby odświeża arkusz scruma
 * (`Setup.scrumSheetSyncEnabled`, env `SCRUM_SHEET_SYNC_ENABLED`). Usunięcie to wariant (b):
 * wymaga potwierdzenia ownera, że synchronizacja arkusza jest na produkcji wyłączona -
 * inaczej ktoś kiedyś włączy przełącznik i trasa będzie potrzebna. Do tego czasu nie kasować
 * i nie rozszerzać; przy kasowaniu zaktualizować test kontraktowy PersonsRouters.p3d.
 * Params: id
 * Body: { id, name?, surname?, systemRoleId?, systemEmail?, ...fields }
 * Returns: Person
 */
app.put(
    '/user/:id',
    requireUserManagementRole,
    async (req: Request, res: Response, next) => {
        try {
            const item = await PersonsController.editUserFromDto(
                req.parsedBody ?? req.body,
            );
            res.send(item);
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Usuwa osobę z bazy danych.
 * Params: id
 * Body: { id }
 * Returns: { id }
 */
app.delete(
    '/person/:id',
    requireStaffRole,
    async (req: Request, res: Response, next) => {
        try {
            const result = await PersonsController.deleteFromDto(req.body);
            res.send(result);
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Tworzy użytkownika systemowego z kontem w jednym żądaniu.
 * @deprecated Używaj POST /person do utworzenia osoby, a następnie PUT /v2/persons/:personId/account do dodania konta.
 *
 * PER-5, decyzja D-PER-5 wariant (a) (2026-09-03): trasa ZOSTAJE, za bramką
 * `requireUserManagementRole`, choć front nie woła jej od PER-3 (zakładanie użytkownika idzie
 * POST /person → PUT /v2/.../account), a w odróżnieniu od trasy v2 nie kolejkuje pusha do
 * FIDmana ani nie unieważnia sesji. Owner nie wybrał usunięcia (wariant (b)) - obie zaszłe
 * trasy konta idą razem; kasowanie to osobna zmiana z aktualizacją testu kontraktowego
 * PersonsRouters.p3d. Nie rozszerzać.
 * Body: { name, surname, entityId, systemRoleId, systemEmail, position?, email?, cellphone?, phone?, comment? }
 * Returns: Person
 */
app.post(
    '/systemUser',
    requireUserManagementRole,
    async (req: Request, res: Response, next) => {
        try {
            const newUser = await PersonsController.addNewSystemUser(req.body);
            res.send(newUser);
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Pobiera konto systemowe osoby (v2).
 * Params: personId
 * Returns: PersonAccountV2Payload | null
 */
app.get(
    '/v2/persons/:personId/account',
    requireUserManagementRole,
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const account =
                await PersonsController.getPersonAccountV2(personId);
            res.send(account || null);
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Zapis WŁASNEJ roli (D-PER-10, 2026-09-04): wołający zmienia rolę osobie, którą sam jest.
 *
 * Kontroler po zmianie roli kasuje z magazynu WSZYSTKIE sesje tej osoby (żeby nowa rola
 * obowiązywała od razu), a więc i bieżącą sesję wołającego. Odpowiedź wychodzi, ale mechanizm
 * sesji przy końcu odpowiedzi próbuje odświeżyć sesję w magazynie, nie znajduje jej
 * („Unable to find the session to touch") i przekazuje błąd do globalnej obsługi, która próbuje
 * odpowiedzieć drugi raz („Cannot set headers after they are sent") - raport błędu do zespołu
 * za każdym razem, gdy administrator zmienia rolę sobie. Błąd starszy niż pack PER; wyszedł,
 * gdy owner testował na sobie.
 *
 * Rozwiązanie: rozpoznać zapis własnej roli PRZED zapisem, a PO zapisie skasować własną sesję
 * przez mechanizm sesji (req.session.destroy) - wtedy przy końcu odpowiedzi nie ma czego
 * odświeżać. Klient dostaje w odpowiedzi `_selfSessionRevoked: true` i sam prowadzi człowieka
 * do logowania. Odrzucone (D-PER-10): blokada zmiany własnej roli; podmiana roli w bieżącej
 * sesji zamiast kasowania (front musiałby odświeżać menu i słowniki ról).
 *
 * Porównanie z rolą w sesji, nie z bazą: sesja ma stempel roli z logowania, a jeśli ktoś
 * zmienił wołającemu rolę wcześniej, jego sesja już nie istnieje i tu nie dojdzie.
 */
function isOwnRoleChange(
    req: Request,
    personId: number,
    requestedRoleId: unknown,
): boolean {
    const userData = req.session?.userData;
    if (!userData || Number(userData.enviId) !== personId) return false;
    if (
        requestedRoleId === undefined ||
        requestedRoleId === null ||
        requestedRoleId === ''
    )
        return false;
    return Number(requestedRoleId) !== Number(userData.systemRoleId);
}

function destroyOwnSession(req: Request): Promise<void> {
    return new Promise((resolve) => {
        if (!req.session) return resolve();
        req.session.destroy(() => resolve());
    });
}

/**
 * Tworzy lub aktualizuje konto systemowe osoby (v2).
 * Params: personId
 * Body: PersonAccountV2Payload (systemRoleId?, systemEmail?, googleId?, googleRefreshToken?, microsoftId?, microsoftRefreshToken?, isActive?)
 * Returns: PersonAccountV2Payload (+ `_selfSessionRevoked: true`, gdy zapis dotyczył własnej roli)
 */
app.put(
    '/v2/persons/:personId/account',
    requireUserManagementRole,
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const payload = req.parsedBody ?? req.body;
            if (!hasAccountUpsertWriteField(payload)) {
                return res.status(400).json({
                    error: 'Brak danych konta do aktualizacji. Przekaż co najmniej jedno pole konta.',
                });
            }
            const ownRoleChange = isOwnRoleChange(
                req,
                personId,
                payload?.systemRoleId,
            );
            const account = await PersonsController.upsertPersonAccountV2({
                personId,
                systemRoleId: payload?.systemRoleId,
                systemEmail: payload?.systemEmail,
                googleId: payload?.googleId,
                googleRefreshToken: payload?.googleRefreshToken,
                microsoftId: payload?.microsoftId,
                microsoftRefreshToken: payload?.microsoftRefreshToken,
                isActive: payload?.isActive,
                fidmanEnabled: payload?.fidmanEnabled,
            });
            if (ownRoleChange) {
                await destroyOwnSession(req);
                res.send({ ...account, _selfSessionRevoked: true });
                return;
            }
            res.send(account);
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Pobiera metadane profilu użytkownika (v2).
 * Params: personId
 * Returns: PersonProfileV2Record | null
 */
app.get(
    '/v2/persons/:personId/profile',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const profile =
                await PersonsController.getPersonProfileV2(personId);
            res.send(profile || null);
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Tworzy lub aktualizuje profil użytkownika (v2).
 * Params: personId
 * Body: PersonProfileV2Payload (headline?, summary?, profileIsVisible?)
 * Returns: PersonProfileV2Payload
 */
app.put(
    '/v2/persons/:personId/profile',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const payload = req.parsedBody ?? req.body;
            const profile = await PersonsController.upsertPersonProfileV2({
                personId,
                headline: payload?.headline,
                summary: payload?.summary,
                profileIsVisible: payload?.profileIsVisible,
            });
            res.send(profile);
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Pobiera listę osób, które mogą być "osobą rejestrującą" pismo.
 * Zwraca filtrowaną listę na podstawie roli zalogowanego użytkownika:
 * - ENVI_COOPERATOR: tylko siebie
 * - Inne role: siebie + wszystkich ADMIN/ENVI_MANAGER/ENVI_EMPLOYEE
 * Returns: Person[]
 */
app.get('/persons/registering-editors', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) throw new Error('Użytkownik niezalogowany');
        const result = await PersonsController.getRegisteringEditors(
            req.session.userData
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});
