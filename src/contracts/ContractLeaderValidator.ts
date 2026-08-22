import Contract from './Contract';
import { BadRequestError } from '../persons/projectAssignments/ProjectScopeGuard';
import { ContractData } from '../types/types';

/**
 * Walidacja wskazania lidera konsorcjum przy zapisie kontraktu.
 *
 * Rzuca BadRequestError (400), a nie zwykły Error - zwykły poszedłby jako 500
 * razem z mailem-raportem o awarii serwera, a to jest zła treść żądania.
 *
 * Kontrakt bez wskazanego lidera przechodzi bez słowa: brak lidera to stan
 * normalny, nie brak danych, i nie ma tu domyślnego kandydata.
 *
 * Walidujemy to, co dany zapis faktycznie niesie do bazy. Kontroler przed wywołaniem
 * kasuje wskazanie lidera, którego ten zapis i tak nie zapisze (edycja częściowa
 * nietykająca powiązań), więc taka edycja nie dostaje 400 za coś, czego nie zmienia.
 */
export default class ContractLeaderValidator {
    static validate(contract: ContractData): void {
        const leaderEntityId = contract._leaderEntityId;
        if (leaderEntityId === undefined || leaderEntityId === null) return;

        if (Number.isNaN(leaderEntityId))
            throw new BadRequestError(
                'Wskazanie lidera konsorcjum nie jest identyfikatorem podmiotu. ' +
                    'Spodziewana jest liczba - numer firmy z listy wykonawców.'
            );

        const contractors = contract._contractors ?? [];
        if (!contractors.length)
            throw new BadRequestError(
                'Wskazano lidera konsorcjum, ale kontrakt nie ma żadnego wykonawcy. ' +
                    'Liderem może być tylko jedna z firm wpisanych jako wykonawca.'
            );

        if (
            !contractors.some((contractor) =>
                Contract.isSameEntityId(contractor.id, leaderEntityId)
            )
        ) {
            const names = contractors
                .map((contractor) => contractor.name ?? contractor.shortName)
                .filter(Boolean)
                .join(', ');
            throw new BadRequestError(
                'Liderem konsorcjum może być tylko firma z listy wykonawców tego kontraktu. ' +
                    `Wskazany podmiot (Id ${leaderEntityId}) nie jest na tej liście` +
                    (names ? `; wykonawcy to: ${names}.` : '.')
            );
        }
    }
}
