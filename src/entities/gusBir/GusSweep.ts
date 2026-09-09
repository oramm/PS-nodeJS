import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import EntityRepository from '../EntityRepository';
import { isValidNipChecksum, normalizeNip } from '../../contracts/aqmSync/AqmSync';
import GusBirService, {
    GusBirNotConfiguredError,
    GusBirNotFoundError,
    GusBirSession,
} from './GusBirService';
import { compareWithGus, GusSnapshot, GusStatus } from './GusCompare';

/**
 * GUS-3 — przebieg całego słownika podmiotów przez rejestr GUS, partiami.
 *
 * Pack GUS, checkpoint GUS-3 (decyzja D-GUS-3, pułapki P-2, P-4, P-5):
 *   20_projects/Aplikacje/PS.APP.01/plans/2026-09-09-gus-synchronizacja-podmiotow-plan.md
 *
 * Wzorzec przejęty z `contracts/contractDocuments/ContractDocumentsCheck.ts` — tam jest
 * dłuższe uzasadnienie, tu skrót.
 *
 * DLACZEGO PARTIAMI (P-2). Aplikacja stoi na Heroku: dyno usypia, więc cron w procesie
 * odpala się tylko wtedy, gdy proces akurat żyje, a pominiętych wywołań nikt nie odrabia;
 * żądanie HTTP jest do tego ucinane po 30 sekundach. Jedno wywołanie bierze więc porcję
 * i oddaje `remaining`, po którym wołający pętli aż do zera.
 *
 * ZBIEŻNOŚĆ. Kolejka to „podmioty z NIP-em, niesprawdzone DZISIAJ, najdawniej sprawdzone
 * pierwsze". Ten sam warunek opisuje wybór partii i licznik `remaining` — gdyby się
 * rozjechały, pętla wołającego nigdy by się nie zatrzymała. Stąd jedna stała
 * NOT_CHECKED_TODAY użyta w obu zapytaniach.
 *
 * KAŻDY PODMIOT WZIĘTY DO PARTII DOSTAJE DATĘ SPRAWDZENIA. To jest warunek zbieżności,
 * nie ozdoba: rekord, który wyszedł z kolejki bez zapisu, wróciłby do niej w następnym
 * wywołaniu tego samego dnia i `remaining` nigdy nie spadłby do zera.
 *
 * JEDNA SESJA GUS NA PARTIĘ (P-5). `bir1` loguje się do GUS przy tworzeniu obiektu,
 * a sesja jest ważna godzinę — obiekt powstaje raz na partię, nie raz na podmiot.
 *
 * LIMIT GUS (P-4). Limit liczy się per klucz i jest wspólny z FIDmanem. Przebieg to
 * ~385 zapytań raz w miesiącu, więc mieści się z zapasem, ale przebiegi obu systemów
 * nie powinny się nakładać, gdyby FIDman kiedyś zaczął pytać.
 *
 * CZEGO TU NIE MA. Przebieg nigdy nie zmienia nazwy ani adresu podmiotu (D-GUS-1) —
 * zapis idzie wyłącznie przez EntityRepository.updateGusResult, czyli trzy kolumny
 * wyniku porównania. Dane podmiotu zmienia dopiero człowiek trasą /gus/accept.
 */

/** Ile podmiotów w jednej partii. Dobrane pod 30-sekundowy limit żądania na Heroku. */
export const GUS_SWEEP_DEFAULT_LIMIT = 20;

/**
 * Zapora na pętlę „aż do końca". Przy 479 podmiotach i partii po 20 wystarcza 20 obiegów;
 * setka to zapas na wyrost. Bez zapory błąd w warunku kolejki zamieniłby cron
 * w nieskończone odpytywanie GUS-u.
 */
const MAX_PASSES = 100;

/** Stany, które przebieg potrafi zapisać. NOT_CHECKED znaczy „jeszcze nie w tej kolejce". */
export type GusSweepStatus = Exclude<GusStatus, 'NOT_CHECKED'>;

export type GusSweepCounters = Record<GusSweepStatus, number>;

export type GusSweepSummary = {
    /** Ile podmiotów przerobiła ta partia (suma liczników). */
    checked: number;
    byStatus: GusSweepCounters;
    /** Ile podmiotów zostało w kolejce po tym wywołaniu. 0 = przebieg dnia zakończony. */
    remaining: number;
    aborted: boolean;
    abortReason?: string;
};

type EntityRow = {
    Id: number;
    Name: string | null;
    Address: string | null;
    TaxNumber: string | null;
    Regon: string | null;
    Krs: string | null;
};

/**
 * Podmiot niesprawdzony dzisiaj. Ten sam warunek wchodzi do wyboru partii i do licznika
 * `remaining` — patrz „ZBIEŻNOŚĆ" w nagłówku pliku.
 */
const NOT_CHECKED_TODAY = `(
    Entities.GusCheckedAt IS NULL
    OR Entities.GusCheckedAt < CURDATE()
)`;

/**
 * Podmiot, o który w ogóle da się zapytać GUS: numer, z którego po odrzuceniu znaków
 * niebędących cyframi zostaje dokładnie dziesięć cyfr.
 *
 * Warunek jest ten sam co w normalizeNip (`replace(/\D/g,'')`), przepisany na SQL —
 * REGEXP_REPLACE jest w MariaDB od 10.0 (lokalnie 10.6.25) i w MySQL 8.
 *
 * Numer zagraniczny albo wpisany opisowo zostaje poza kolejką i przy stanie NOT_CHECKED:
 * GUS wyszukuje wyłącznie po polskim NIP-ie, więc nie ma o co pytać, a wpisanie takiemu
 * podmiotowi jakiegokolwiek werdyktu byłoby kłamstwem. Sumy kontrolnej nie liczymy w SQL —
 * to robi kod niżej.
 */
const HAS_ASKABLE_NIP = `(
    Entities.TaxNumber IS NOT NULL
    AND CHAR_LENGTH(REGEXP_REPLACE(Entities.TaxNumber, '[^0-9]', '')) = 10
)`;

const IN_SWEEP_QUEUE = `${HAS_ASKABLE_NIP} AND ${NOT_CHECKED_TODAY}`;

/** Najdawniej sprawdzone pierwsze, nigdy niesprawdzone przodem. */
const SWEEP_ORDER = `Entities.GusCheckedAt IS NULL DESC,
                     Entities.GusCheckedAt ASC,
                     Entities.Id ASC`;

async function selectBatch(limit: number): Promise<EntityRow[]> {
    const sql = mysql.format(
        `SELECT Entities.Id,
                Entities.Name,
                Entities.Address,
                Entities.TaxNumber,
                Entities.Regon,
                Entities.Krs
           FROM Entities
          WHERE ${IN_SWEEP_QUEUE}
          ORDER BY ${SWEEP_ORDER}
          LIMIT ?`,
        [limit]
    );
    return (await ToolsDb.getQueryCallbackAsync(sql)) as EntityRow[];
}

async function countRemaining(): Promise<number> {
    const sql = `SELECT COUNT(*) AS Ile FROM Entities WHERE ${IN_SWEEP_QUEUE}`;
    const rows = (await ToolsDb.getQueryCallbackAsync(sql)) as { Ile: number }[];
    return Number(rows[0]?.Ile ?? 0);
}

function emptyCounters(): GusSweepCounters {
    return { OK: 0, DIFF: 0, DIFF_MINOR: 0, NOT_FOUND: 0, CLOSED: 0, ERROR: 0 };
}

function summaryOf(
    byStatus: GusSweepCounters,
    remaining: number,
    abortReason?: string
): GusSweepSummary {
    const checked = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
    return {
        checked,
        byStatus,
        remaining,
        aborted: !!abortReason,
        ...(abortReason ? { abortReason } : {}),
    };
}

/**
 * Jedna partia przebiegu.
 *
 * AWARIA GUS-U NA JEDNYM PODMIOCIE NIE PRZERYWA PARTII. To odwrotnie niż w kontroli umów
 * na Dysku, gdzie błąd zewnętrznej usługi wygląda tak samo jak pusty folder i jeden taki
 * przebieg oznaczyłby setki umów jako niekompletne. Tutaj odpowiedź GUS-u dotyczy zawsze
 * jednego podmiotu i nie da się jej pomylić z żadną inną: rekord dostaje ERROR, a partia
 * idzie dalej. Następny przebieg spróbuje jeszcze raz, bo kolejka jest posortowana
 * „najdawniej sprawdzone pierwsze".
 *
 * BRAK KLUCZA GUS TO NIE JEST AWARIA REJESTRU, tylko brak konfiguracji — przebieg kończy
 * się wtedy bez ani jednego zapisu (`aborted`). Jedna pusta zmienna środowiskowa nie ma
 * prawa wpisać ERROR-a całemu słownikowi (ta sama zasada co przy pojedynczym sprawdzeniu
 * w GUS-2).
 */
export async function runGusSweep(limit?: number): Promise<GusSweepSummary> {
    const batchLimit = limit ?? GUS_SWEEP_DEFAULT_LIMIT;
    const byStatus = emptyCounters();

    if (!GusBirService.isConfigured())
        return summaryOf(
            byStatus,
            await countRemaining(),
            'Wyszukiwanie GUS nie jest skonfigurowane (brak GUS_BIR_KEY)'
        );

    const rows = await selectBatch(batchLimit);
    if (!rows.length) return summaryOf(byStatus, await countRemaining());

    let session: GusBirSession;
    try {
        session = GusBirService.openSession();
    } catch (error: any) {
        return summaryOf(
            byStatus,
            await countRemaining(),
            error?.message ?? String(error)
        );
    }

    const repository = new EntityRepository();

    for (const row of rows) {
        const nip = normalizeNip(row.TaxNumber);

        // Dziesięć cyfr, ale suma kontrolna się nie zgadza — GUS takiego numeru nie zna
        // i nie ma sensu go pytać. Rekord MUSI dostać stan, inaczej zostanie w kolejce
        // i przebieg nigdy nie dobiegnie końca. ERROR mówi „ten podmiot wymaga człowieka",
        // czyli dokładnie to, co jest prawdą: ktoś przy wpisywaniu pomylił cyfrę.
        // ODSTĘPSTWO od zachowania pojedynczej trasy /gus/check, która w tej sytuacji
        // odmawia (400) i nic nie zapisuje — tam błąd czyta człowiek patrzący na ekran,
        // tutaj nie ma komu go przeczytać.
        if (!isValidNipChecksum(nip)) {
            await repository.updateGusResult(row.Id, {
                status: 'ERROR',
                checkedAt: new Date(),
            });
            byStatus.ERROR++;
            continue;
        }

        try {
            const found = await GusBirService.lookupByNip(nip, session);
            const snapshot: GusSnapshot = {
                name: found.name,
                address: found.address,
                regon: found.regon,
                krs: found.krs,
                closedAt: found.closedAt,
            };
            const { status } = compareWithGus(
                {
                    name: row.Name,
                    address: row.Address,
                    regon: row.Regon,
                    krs: row.Krs,
                },
                snapshot
            );
            await repository.updateGusResult(row.Id, {
                status,
                checkedAt: new Date(),
                snapshot,
            });
            byStatus[status]++;
        } catch (error) {
            if (error instanceof GusBirNotConfiguredError)
                // Klucz zniknął w trakcie partii. Przerywamy zamiast stemplować resztę
                // ERROR-em: to problem konfiguracji, nie danych.
                return summaryOf(
                    byStatus,
                    await countRemaining(),
                    error.message
                );

            if (error instanceof GusBirNotFoundError) {
                // Rejestr nie zna tego NIP-u — stara migawka jest nieaktualna, więc znika.
                await repository.updateGusResult(row.Id, {
                    status: 'NOT_FOUND',
                    checkedAt: new Date(),
                    snapshot: null,
                });
                byStatus.NOT_FOUND++;
                continue;
            }

            console.error(
                `[GusSweep] podmiot ${row.Id}: awaria zapytania do GUS:`,
                error
            );
            // Fail-open: sam status, migawka bez zmian (pominięta w instrukcji UPDATE).
            await repository.updateGusResult(row.Id, {
                status: 'ERROR',
                checkedAt: new Date(),
            });
            byStatus.ERROR++;
        }
    }

    return summaryOf(byStatus, await countRemaining());
}

/**
 * Cały słownik za jednym zawołaniem: partia po partii, aż kolejka będzie pusta.
 *
 * Do wołania z crona i z konsoli, NIE z żądania HTTP — na Heroku pełny przebieg nie
 * zmieściłby się w 30 sekundach. Ekran (GUS-4) pętli po `remaining` po swojej stronie,
 * żeby móc pokazywać postęp.
 *
 * Partia, która nie ruszyła ani jednego podmiotu, kończy pętlę nawet przy niezerowym
 * `remaining` — inaczej rekord, którego z jakiegoś powodu nie da się odhaczyć, kręciłby
 * przebieg w kółko.
 */
export async function runGusSweepUntilDone(
    limit?: number
): Promise<GusSweepSummary & { passes: number }> {
    const byStatus = emptyCounters();
    let remaining = 0;
    let passes = 0;

    while (passes < MAX_PASSES) {
        const pass = await runGusSweep(limit);
        passes++;
        for (const status of Object.keys(byStatus) as GusSweepStatus[])
            byStatus[status] += pass.byStatus[status];
        remaining = pass.remaining;

        if (pass.aborted)
            return { ...summaryOf(byStatus, remaining, pass.abortReason), passes };
        if (pass.checked === 0 || remaining === 0) break;
    }

    const abortReason =
        remaining > 0 && passes >= MAX_PASSES
            ? `Przerwano po ${MAX_PASSES} partiach, w kolejce zostało ${remaining} podmiotów`
            : undefined;
    return { ...summaryOf(byStatus, remaining, abortReason), passes };
}
