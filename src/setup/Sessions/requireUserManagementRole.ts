import { NextFunction, Request, Response } from 'express';
import { SystemRoleName } from '../../types/sessionTypes';

/**
 * Bramki ról dla tras konta systemowego i tras osoby (pack PER, checkpoint PER-2).
 *
 * DLACZEGO OSOBNY MODUŁ. Bramka na przypisania projektów mieszkała jako funkcja lokalna
 * w `ProjectAssignmentsRouters`, więc trasy zapisu konta - `PUT /v2/persons/:id/account`
 * i zaszłe `PUT /user/:id`, `POST /systemUser` - nie dostały jej wcale. Skutek z odczytu
 * kodu 2026-09-03: każda zalogowana osoba, także rola zewnętrzna z e-mailem systemowym,
 * mogła bezpośrednim żądaniem nadać sobie rolę ADMIN. Lista ról w jednym miejscu, żeby
 * decyzja "kto zarządza kontami" (D-PER-3) zmieniała jedną stałą, a nie cztery routery.
 *
 * DLACZEGO NIE PREFIKS /admin. Trasy konta i osoby są używane też przez ekrany spoza panelu
 * administracyjnego (okno "Osoby", agent nagłówkowy z rolą ENVI_EMPLOYEE), więc zamknięcie
 * ich rolami panelu (ADMIN, ENVI_MANAGER) odcięłoby dzisiejszych użytkowników. Bramka jest
 * per trasa i szersza niż `adminPanelGuard`.
 *
 * DLACZEGO ODPOWIEDŹ WPROST, A NIE next(error). Globalny handler w `src/index.ts` mapuje
 * rzucony błąd na 500 z mailem-raportem do zespołu. Odmowa uprawnień to normalna odpowiedź
 * dla klienta, nie awaria serwera.
 *
 * 401 zostaje w `requireSession` (montowana globalnie, przed trasami); sprawdzenie braku
 * sesji tutaj jest drugą, redundantną linią - tak samo jak w `adminPanelGuard`.
 */

/**
 * Kto zarządza kontami: rola systemowa, e-mail logowania, flaga FIDmana, zakres projektów.
 *
 * ADMIN + ENVI_MANAGER (D-PER-3 wariant (a), wykonane w PER-3 razem z przeniesieniem ekranu).
 * To ta sama lista, co bramka panelu administracyjnego (`adminPanelGuard`) i front
 * `MainSetup.ADMIN_PANEL_ROLES`, bo od PER-3 konta zakłada się i zmienia WYŁĄCZNIE z okna
 * „Personel i uprawnienia", które stoi pod prefiksem /admin. Ekran „Dodawanie użytkowników"
 * (widoczny dla ENVI_EMPLOYEE) zniknął, więc pracownik nie traci nic, co dziś widzi.
 *
 * Skutek uboczny do zapamiętania: `GET /v2/persons/:id/account` też jest za tą bramką, więc
 * modal edycji osoby w oknie „Osoby" dostaje dla ENVI_EMPLOYEE 403 zamiast konta. Nic tam
 * tego nie wyświetla (pola konta są w tym modalu zakomentowane), a klient łapie błąd i podaje
 * `null` - zostaje ostrzeżenie w konsoli.
 *
 * STAFF_ROLES niżej zostaje szersza: książkę adresową dalej prowadzi pracownik.
 */
export const USER_MANAGEMENT_ROLES: SystemRoleName[] = [
    SystemRoleName.ADMIN,
    SystemRoleName.ENVI_MANAGER,
];

/**
 * Kto edytuje książkę adresową (dodanie, edycja i skasowanie osoby). Dziś ta sama lista co
 * wyżej, ale to osobna decyzja: książkę adresową prowadzi pracownik, kontami zarządza wąskie
 * grono. Zlanie obu list w jedną sprawiłoby, że zawężenie z D-PER-3 odebrałoby przy okazji
 * pracownikom dodawanie osób, czego nikt nie chciał.
 *
 * Musi odpowiadać `MainSetup.STAFF_ROLES` po stronie frontu - tą listą front zasłania okno
 * "Osoby" i moduł ofert, w którym da się założyć osobę z lotu. Rozjechanie obu list daje
 * albo przycisk prowadzący w 403, albo funkcję ukrytą w menu i dostępną żądaniem.
 * Backend rozstrzyga.
 */
export const STAFF_ROLES: SystemRoleName[] = [
    SystemRoleName.ADMIN,
    SystemRoleName.ENVI_MANAGER,
    SystemRoleName.ENVI_EMPLOYEE,
];

const FORBIDDEN_MESSAGE = 'Brak uprawnień do zarządzania kontami';

function makeRoleGuard(allowedRoles: SystemRoleName[]) {
    return function roleGuard(
        req: Request,
        res: Response,
        next: NextFunction,
    ): void {
        const userData = req.session?.userData;
        if (!userData) {
            res.status(401).send({ errorMessage: 'Użytkownik niezalogowany' });
            return;
        }
        if (!allowedRoles.includes(userData.systemRoleName)) {
            res.status(403).send({ errorMessage: FORBIDDEN_MESSAGE });
            return;
        }
        next();
    };
}

/** Trasy konta systemowego i przypisań projektów. */
const requireUserManagementRole = makeRoleGuard(USER_MANAGEMENT_ROLES);

/** Trasy osoby: POST /person, PUT /person/:id, DELETE /person/:id. */
export const requireStaffRole = makeRoleGuard(STAFF_ROLES);

export default requireUserManagementRole;
