import { google, drive_v3 } from 'googleapis';
import mysql from 'mysql2/promise';
import ToolsGapi from '../../setup/Sessions/ToolsGapi';
import Setup from '../../setup/Setup';
import ToolsDb from '../../tools/ToolsDb';
import ToolsGd from '../../tools/ToolsGd';

/**
 * Kontrola „czy wgrano umowę na Dysk".
 *
 * Odpowiada na jedno pytanie: czy w folderze, w którym ma leżeć umowa, cokolwiek jest.
 * Wynik ląduje w Contracts.ContractDocumentPresent / ContractDocumentCheckedAt (migracja 010),
 * skąd czyta go lista kontraktów.
 *
 * DLACZEGO NIE CHODZIMY PO ŚCIEŻKACH. Folder bierzemy z `Cases.GdFolderId` sprawy typu
 * z Setup.ContractDocuments.caseTypeIds. Nazwy folderów („01 Administracja", „S01 Umowa ENVI")
 * powstają ze słowników MilestoneTypes_ContractTypes i CaseTypes, zależą od typu umowy i zmieniają
 * się bez deployu, a po migracji drzewa PS ENVI na Dysk współdzielony ścieżka wyprowadzona z nazw
 * prowadzi w stare, puste miejsce. Identyfikatory w bazie migrację przetrwały.
 *
 * URUCHAMIANIE. Wywoływane z endpointu, partiami. Heroku usypia dyno, więc cron w procesie się nie
 * odpala (pominięte wywołania nie są odrabiane), a żądanie HTTP jest ucinane po 30 sekundach —
 * stąd partie i `remaining` w odpowiedzi, po którym wywołujący pętli aż do zera.
 *
 * ZBIEŻNOŚĆ. Kolejka to „umowy niesprawdzone DZISIAJ, najdawniej sprawdzone pierwsze". Dzięki temu
 * kolejne wywołania w ramach jednego dnia zbiegają do zera bez przekazywania identyfikatora
 * przebiegu między żądaniami, a następnego dnia kolejka napełnia się sama.
 */

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Id na Dysku to litery, cyfry, myślnik i podkreślenie. Cokolwiek innego nie trafia do zapytania —
 *  `q` sklejamy tekstowo, bo API Dysku nie ma parametrów wiązanych. */
const SAFE_DRIVE_ID = /^[A-Za-z0-9_-]+$/;

export type MissingContract = {
    id: number;
    ourIdOrNumber: string;
    projectOurId: string | null;
    /** Wprost do folderu, w którym umowy brakuje — plakietka na liście jest odnośnikiem. */
    folderUrl: string;
};

export type ContractDocumentsCheckSummary = {
    checked: number;
    present: number;
    missing: number;
    /** Ile umów zostało w kolejce po tym wywołaniu. 0 = przebieg dnia zakończony. */
    remaining: number;
    aborted: boolean;
    abortReason?: string;
    missingContracts: MissingContract[];
};

type ContractFolderRow = {
    ContractId: number;
    OurIdOrNumber: string | null;
    ProjectOurId: string | null;
    GdFolderId: string;
};

/** Umowy niesprawdzone dzisiaj. Wspólny warunek dla wyboru partii i dla licznika `remaining` —
 *  gdyby się rozjechały, pętla wywołującego nigdy by się nie zatrzymała. */
const NOT_CHECKED_TODAY = `(
    mainContracts.ContractDocumentCheckedAt IS NULL
    OR mainContracts.ContractDocumentCheckedAt < CURDATE()
)`;

/** Umowa wchodzi do kontroli tylko, gdy ma sprawę „umowa" z niepustym folderem. Reszta
 *  (ok. 166 z 785 — starsze umowy o innej strukturze) jest świadomie pomijana: brak folderu
 *  znaczy „nie wiem", a nie „brak umowy". */
const HAS_DOCUMENT_FOLDER = `EXISTS (
    SELECT 1 FROM Milestones m
      JOIN Cases cs ON cs.MilestoneId = m.Id
     WHERE m.ContractId = mainContracts.Id
       AND cs.TypeId IN (?)
       AND cs.GdFolderId IS NOT NULL AND cs.GdFolderId <> ''
)`;

function caseTypeIds(): number[] {
    return Setup.ContractDocuments.caseTypeIds;
}

/**
 * Foldery umów wybranych do tej partii. Umowa może mieć kilka spraw „umowa" (zmierzone: 21 umów,
 * rekordzista sześć, z czego 18 wskazuje na różne foldery), więc zwracamy wiersz na folder,
 * a scalanie robimy wyżej.
 */
async function selectBatch(limit: number): Promise<ContractFolderRow[]> {
    const typeIds = caseTypeIds();
    if (!typeIds.length) return [];

    // Wrapper `SELECT * FROM (...) AS batch` jest wymuszony przez MySQL: LIMIT nie jest
    // dozwolony wprost w podzapytaniu IN.
    const sql = `
        SELECT mainContracts.Id AS ContractId,
               COALESCE(OurContractsData.OurId, mainContracts.Number) AS OurIdOrNumber,
               mainContracts.ProjectOurId,
               Cases.GdFolderId
          FROM Contracts AS mainContracts
          LEFT JOIN OurContractsData ON OurContractsData.Id = mainContracts.Id
          JOIN Milestones ON Milestones.ContractId = mainContracts.Id
          JOIN Cases ON Cases.MilestoneId = Milestones.Id
         WHERE Cases.TypeId IN (?)
           AND Cases.GdFolderId IS NOT NULL AND Cases.GdFolderId <> ''
           AND mainContracts.Id IN (
                SELECT * FROM (
                    SELECT mainContracts.Id
                      FROM Contracts AS mainContracts
                     WHERE ${NOT_CHECKED_TODAY} AND ${HAS_DOCUMENT_FOLDER}
                     ORDER BY mainContracts.ContractDocumentCheckedAt IS NULL DESC,
                              mainContracts.ContractDocumentCheckedAt ASC,
                              mainContracts.Id ASC
                     LIMIT ?
                ) AS batch
           )`;

    return (await ToolsDb.getQueryCallbackAsync(
        mysql.format(sql, [typeIds, typeIds, limit])
    )) as ContractFolderRow[];
}

async function countRemaining(): Promise<number> {
    const typeIds = caseTypeIds();
    if (!typeIds.length) return 0;

    const sql = `SELECT COUNT(*) AS Ile
                   FROM Contracts AS mainContracts
                  WHERE ${NOT_CHECKED_TODAY} AND ${HAS_DOCUMENT_FOLDER}`;
    const rows = (await ToolsDb.getQueryCallbackAsync(
        mysql.format(sql, [typeIds])
    )) as { Ile: number }[];
    return Number(rows[0]?.Ile ?? 0);
}

/**
 * Ile zapytań do Dysku naraz.
 *
 * NIE PACZKUJEMY RODZICÓW. Pierwsza wersja sklejała `('A' in parents or 'B' in parents ...)`,
 * żeby zejść z liczby zapytań. Zmierzone na produkcyjnym Dysku: takie zapytanie **zwraca pustą
 * listę**, choć to samo pytanie zadane osobno dla każdego folderu zwraca wyniki. Alternatywa
 * rodziców w `q` po prostu nie działa. Objaw był podstępny, bo runda pierwsza i tak zwykle
 * zwraca zero (folder umowy rzadko ma pliki bezpośrednio), więc błąd ujawniał się dopiero
 * jako fałszywe „brak umowy" przy plikach leżących w podfolderze.
 * Nie wracać do sklejania bez dowodu, że API to obsługuje.
 */
const DRIVE_CONCURRENCY = 5;

/** Odpala `fn` dla wszystkich elementów, ale najwyżej `limit` naraz. */
async function mapWithLimit<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    const workers = Array.from(
        { length: Math.min(limit, items.length) },
        async () => {
            for (let i = next++; i < items.length; i = next++)
                results[i] = await fn(items[i]);
        }
    );
    await Promise.all(workers);
    return results;
}

/**
 * Czy w folderze jest co najmniej jeden element NIEBĘDĄCY folderem.
 *
 * Warunek `mimeType != folder` załatwia naraz dwie decyzje właściciela: format pliku nie ma
 * znaczenia (PDF, skan, Dokument Google — wszystko jedno), a skrót liczy się jako plik, bo skrót
 * ma własny typ MIME i też nie jest folderem.
 *
 * `trashed = false` jest konieczne: plik w koszu nadal jest dzieckiem folderu, więc bez tego
 * skasowana umowa dalej liczyłaby się jako wgrana.
 *
 * `supportsAllDrives` i `includeItemsFromAllDrives` są konieczne, bo drzewo PS ENVI leży na Dysku
 * współdzielonym — bez nich zapytanie zwraca pustkę i kontrola oznaczyłaby wszystko jako brak.
 *
 * `pageSize: 1`, bo pytamy o istnienie, nie o zawartość.
 */
async function folderHasFiles(
    drive: drive_v3.Drive,
    folderId: string
): Promise<boolean> {
    const response = await drive.files.list({
        q: `'${folderId}' in parents and mimeType != '${FOLDER_MIME}' and trashed = false`,
        fields: 'files(id)',
        pageSize: 1,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
    });
    return (response.data.files ?? []).length > 0;
}

async function subfolderIds(
    drive: drive_v3.Drive,
    folderId: string
): Promise<string[]> {
    const response = await drive.files.list({
        q: `'${folderId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
        fields: 'files(id)',
        pageSize: 100,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
    });
    return (response.data.files ?? [])
        .map((folder) => folder.id)
        .filter((id): id is string => !!id);
}

/**
 * Czy w folderze albo w którymkolwiek jego podfolderze leży plik. Schodzimy dokładnie jeden
 * poziom: jeśli umowa leży trzy foldery głębiej, to problem z porządkiem, a nie z kontrolką.
 * Pusty podfolder nie daje trafienia — zgodnie z decyzją właściciela.
 */
async function folderHasDocument(
    drive: drive_v3.Drive,
    folderId: string
): Promise<boolean> {
    if (await folderHasFiles(drive, folderId)) return true;
    for (const subfolderId of await subfolderIds(drive, folderId))
        if (await folderHasFiles(drive, subfolderId)) return true;
    return false;
}

async function saveResults(present: number[], missing: number[]): Promise<void> {
    // Dwa zapytania zamiast jednego na umowę. NOW() zapisujemy razem z wynikiem, bo flaga bez daty
    // nie mówi, czy opisuje dzisiejszy stan, czy przebieg sprzed miesiąca.
    //
    // Listę id wstawiamy przez mysql.format, a do executeSQL idzie gotowy SQL BEZ parametrów.
    // Powód: executeSQL woła conn.execute(), czyli zapytanie przygotowane, a te NIE rozwijają
    // tablicy w `IN (?)` — MySQL odpowiada wtedy „Incorrect arguments to mysqld_stmt_execute".
    // Rozwijanie tablic działa tylko w conn.query() (tak czyta getQueryCallbackAsync).
    const updateFor = (flag: 0 | 1, ids: number[]) =>
        mysql.format(
            `UPDATE Contracts SET ContractDocumentPresent = ${flag}, ContractDocumentCheckedAt = NOW()
              WHERE Id IN (?)`,
            [ids]
        );

    if (present.length) await ToolsDb.executeSQL(updateFor(1, present));
    if (missing.length) await ToolsDb.executeSQL(updateFor(0, missing));
}

function emptySummary(
    remaining: number,
    abortReason?: string
): ContractDocumentsCheckSummary {
    return {
        checked: 0,
        present: 0,
        missing: 0,
        remaining,
        aborted: !!abortReason,
        ...(abortReason ? { abortReason } : {}),
        missingContracts: [],
    };
}

/**
 * Jedna partia kontroli.
 *
 * BŁĄD DYSKU NIE ZAPISUJE NICZEGO. Wygasły token, cofnięte uprawnienia i 5xx wyglądają w naiwnym
 * kodzie tak samo jak pusty folder — jeden taki przebieg oznaczyłby setki umów jako niekompletne.
 * Dlatego wszystkie zapytania idą przed zapisem, a wyjątek kończy partię z `aborted: true`
 * i zerową liczbą zmian w bazie. Ponowienia nie ma świadomie: wywołujący i tak pętli.
 */
export async function runContractDocumentsCheck(
    limit?: number
): Promise<ContractDocumentsCheckSummary> {
    const batchLimit = limit ?? Setup.ContractDocuments.batchLimit;

    if (!caseTypeIds().length)
        return emptySummary(
            0,
            'CONTRACT_DOCUMENT_CASE_TYPE_IDS jest puste — nie wiadomo, w których sprawach szukać umowy.'
        );

    const rows = await selectBatch(batchLimit);
    if (!rows.length) return emptySummary(await countRemaining());

    const foldersByContract = new Map<number, string[]>();
    const contractInfo = new Map<number, ContractFolderRow>();
    for (const row of rows) {
        if (!SAFE_DRIVE_ID.test(row.GdFolderId)) continue;
        const folders = foldersByContract.get(row.ContractId) ?? [];
        folders.push(row.GdFolderId);
        foldersByContract.set(row.ContractId, folders);
        if (!contractInfo.has(row.ContractId)) contractInfo.set(row.ContractId, row);
    }
    if (!foldersByContract.size) return emptySummary(await countRemaining());

    const allFolders = [...new Set([...foldersByContract.values()].flat())];

    let withFiles: Set<string>;
    try {
        const auth = await ToolsGapi.getBackgroundAuth();
        const drive = google.drive({ version: 'v3', auth });
        const hits = await mapWithLimit(allFolders, DRIVE_CONCURRENCY, (id) =>
            folderHasDocument(drive, id)
        );
        withFiles = new Set(allFolders.filter((_, index) => hits[index]));
    } catch (err: any) {
        console.error('[ContractDocumentsCheck] przerwano:', err);
        return emptySummary(
            await countRemaining(),
            err?.message ?? String(err)
        );
    }

    const present: number[] = [];
    const missing: number[] = [];
    const missingContracts: MissingContract[] = [];
    for (const [contractId, folders] of foldersByContract) {
        // Umowa z kilkoma folderami: wystarczy trafienie w którymkolwiek.
        if (folders.some((id) => withFiles.has(id))) {
            present.push(contractId);
            continue;
        }
        missing.push(contractId);
        const info = contractInfo.get(contractId)!;
        missingContracts.push({
            id: contractId,
            ourIdOrNumber: info.OurIdOrNumber ?? String(contractId),
            projectOurId: info.ProjectOurId,
            folderUrl: ToolsGd.createGdFolderUrl(folders[0]),
        });
    }

    await saveResults(present, missing);

    return {
        checked: present.length + missing.length,
        present: present.length,
        missing: missing.length,
        remaining: await countRemaining(),
        aborted: false,
        missingContracts,
    };
}
