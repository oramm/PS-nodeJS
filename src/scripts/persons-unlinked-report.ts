/**
 * RAPORT OSÓB BEZ POWIĄZAŃ (RODO). Pack ROD, checkpoint ROD-8 (2026-09-08), decyzja D-ROD-4:
 * raport do przeglądu ręcznego + procedura, BEZ automatycznego kasowania.
 *
 * READ-ONLY. Nic nie zmienia w bazie.
 *
 * Kto trafia na listę: osoba bez roli na kontrakcie, bez konta z e-mailem logowania, bez wiersza
 * uprawnień panelu i bez profilu (4 kryteria planu). Przy każdej osobie „ślady": gdzie jeszcze w bazie
 * występuje jej numer (pisma, oferty, zadania, nieobecności, faktury...). `ślady=brak` = nic w systemie
 * jej nie trzyma.
 *
 * Wyjście:
 *  - domyślnie SAME NUMERY osób i podmiotów, data wiersza konta i ślady - wolno wkleić do notatki;
 *  - `--review` dodaje imię, nazwisko, stanowisko i nazwę podmiotu (kolumny rozdzielone tabulatorem) -
 *    TYLKO na ekran albo do pliku lokalnego (`> plik.tsv`), nigdy do notatek, zgłoszeń ani maili.
 * Kolumna „konto" to data ostatniego zapisu pustego wiersza konta, NIE data zmiany osoby - `Persons`
 * nie ma kolumny daty; dla osób sprzed migracji 002 to jej dzień (2026-02-12).
 *
 * Procedura przeglądu: documentation/team/runbooks/rodo-przeglad-osob.md
 *
 * Użycie:
 *   yarn persons:unlinked-report [--review]                                                   # lokalnie
 *   cross-env NODE_ENV=production ts-node src/scripts/persons-unlinked-report.ts [--review]    # produkcja
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import PersonReferencesRepository from '../persons/personReferences/PersonReferencesRepository';
import UnlinkedPersonsRepository from '../persons/unlinkedPersons/UnlinkedPersonsRepository';
import {
    attachReferences,
    formatIdsOnlyLine,
    formatReviewLine,
    REVIEW_HEADER,
    summarize,
} from '../persons/unlinkedPersons/unlinkedPersonsReport';

const REVIEW_FLAG = '--review';

async function main() {
    const review = process.argv.slice(2).includes(REVIEW_FLAG);
    console.log(
        `[unlinked-report] env=${process.env.NODE_ENV || 'production'} db=${process.env.DB_HOST}/${process.env.DB_NAME} tryb=${
            review ? 'REVIEW (dane osobowe - nie wklejać)' : 'same numery'
        }`,
    );

    const unlinkedRepo = new UnlinkedPersonsRepository();
    const referencesRepo = new PersonReferencesRepository();

    const totalPersons = await unlinkedRepo.countAllPersons();
    const persons = await unlinkedRepo.find();
    const columns = await referencesRepo.findReferenceColumns();
    const counts = await referencesRepo.countReferences(
        persons.map((person) => person.id),
        columns,
    );
    const entries = attachReferences(persons, counts);
    const summary = summarize(entries);

    console.log(
        `[unlinked-report] osoby w bazie=${totalPersons} bez powiązań=${summary.total} (bez śladów=${summary.withoutReferences}, ze śladami=${summary.withReferences}, z pustym wierszem konta=${summary.withAccountRow}) podmiotów=${summary.entities}; sprawdzono kolumn wskazujących na osobę: ${columns.length}`,
    );
    console.log(
        '[unlinked-report] kasować wolno tylko osoby ze „ślady=brak", pojedynczo, po przeglądzie - patrz runbook rodo-przeglad-osob.md',
    );
    console.log('');

    if (review) {
        console.log(REVIEW_HEADER);
        for (const entry of entries) console.log(formatReviewLine(entry));
    } else {
        for (const entry of entries) console.log(formatIdsOnlyLine(entry));
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[unlinked-report] Błąd:', err);
        process.exit(1);
    });
