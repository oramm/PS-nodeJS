import { SystemRoleName } from '../types/sessionTypes';
import { STAFF_ROLES } from '../setup/Sessions/requireUserManagementRole';
import Person from './Person';

/**
 * RODO (pack ROD, checkpoint ROD-1, decyzja D-ROD-1 wariant (a) z 2026-09-07): pełną książkę
 * adresową z listy osób — telefony, podmiot, stanowisko, komentarz, rola systemowa, e-mail
 * logowania, specjalizacje — dostaje TYLKO personel ENVI (STAFF_ROLES, ta sama lista, którą
 * pack PER ustawił dla zarządzania kontami). Każda inna rola dostaje kształt listy wyboru:
 * numer, imię, nazwisko, e-mail kontaktowy — tyle, ile potrzebuje selektor osoby (właściciel
 * zadania, osoba na piśmie). Brak albo nieznana rola = najwęższy kształt (fail-safe).
 *
 * DLACZEGO JEDNA REGUŁA OBOK STAFF_ROLES. Przed ROD-1 zawężenie dotyczyło tylko dwóch ról
 * zakresowych (CONTRACT_WORKER, CLIENT z packa TSK/RODO-lite), a EXTERNAL_USER i ENVI_COOPERATOR —
 * mimo że front nie pokazuje im okna „Osoby" — dostawały z serwera pełne dane wszystkich osób
 * „bezpośrednim żądaniem" na POST /persons (zmierzone na żywo 2026-09-07, ROD-0). Reguła
 * „pełny kształt = wyłącznie STAFF_ROLES" zamyka tę drogę jednym warunkiem i obejmuje każdą
 * przyszłą rolę nie-personelną automatycznie.
 */
export type PublicPersonListItem = {
    id?: number;
    name: string;
    surname: string;
    email: string;
    /**
     * Etykieta listy wyboru: `imię nazwisko e-mail` (`Person._nameSurnameEmail`). Selektor osób
     * na froncie (`BussinesObjectSelectors`, `labelKey="_nameSurnameEmail"`) używa jej do wyświetlenia
     * i wyszukiwania opcji; bez tego pola role zawężone widziałyby puste etykiety. To nie jest nowa
     * dana — to konkatenacja pól, które i tak są w tym kształcie (imię, nazwisko, e-mail), więc nic
     * ponad `D-ROD-1` (a) nie wychodzi. Podmiot (`_entity`) świadomie pomijamy — selektor pokaże
     * „[Brak encji]", bo podmiot to jedna z rzeczy, które przed rolami zewnętrznymi zasłaniamy.
     */
    _nameSurnameEmail: string;
};

export function personsListReceivesFullShape(
    role: SystemRoleName | undefined,
): boolean {
    return !!role && STAFF_ROLES.includes(role);
}

export function projectPersonsForRole(
    persons: Person[],
    role: SystemRoleName | undefined,
): Person[] | PublicPersonListItem[] {
    if (personsListReceivesFullShape(role)) return persons;
    return persons.map((person) => ({
        id: person.id,
        name: person.name,
        surname: person.surname,
        email: person.email,
        _nameSurnameEmail: person._nameSurnameEmail,
    }));
}
