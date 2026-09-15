import {
    PersonReferenceCount,
    describeBlockers,
} from './PersonReferencesRepository';

/**
 * Odmowa skasowania osoby, ktora ma powiazania w bazie.
 *
 * RODO, checkpoint ROD-6, decyzja ownera D-ROD-2 = (c) (2026-09-10): „zakaz kasowania osob
 * z powiazaniami". Twarde kasowanie zostaje wylacznie dla osoby bez zadnego odwolania; osoba
 * z historia (zadania, urlopy, pisma, oferty, konto, profil, slady edycji) nie da sie usunac
 * z ekranu - prawo do bycia zapomnianym realizuje sie wtedy recznie w bazie (swiadomy wybor
 * ownera; odrzucone: (a) anonimizacja, (b) kasowanie ze spisem skutkow).
 *
 * Status 409: to normalna odpowiedz dla klienta (rekord w uzyciu), nie awaria serwera - globalny
 * handler w src/index.ts nie wysyla maila-raportu przy 4xx. Ale oddaje tylko { errorMessage },
 * dlatego trasa DELETE /person/:id sama nadaje cialu ksztalt { errorMessage, blockers[] },
 * lapiac ten blad przez instanceof (zamiast przez next(error)).
 */
export default class PersonDeleteBlockedError extends Error {
    readonly status = 409;
    readonly blockers: PersonReferenceCount[];

    constructor(personId: number, blockers: PersonReferenceCount[]) {
        const summary = describeBlockers(blockers);
        super(
            `Nie mozna usunac osoby (nr ${personId}) - ma powiazania w systemie` +
                (summary
                    ? `: ${summary}. Najpierw usun albo przenies te powiazania, albo zachowaj osobe.`
                    : '.'),
        );
        this.name = 'PersonDeleteBlockedError';
        this.blockers = blockers;
        Object.setPrototypeOf(this, PersonDeleteBlockedError.prototype);
    }
}
