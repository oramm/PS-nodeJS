import { OAuth2Client } from 'google-auth-library';
import ToolsGd from '../tools/ToolsGd';
import { CaseData, LetterData } from '../types/types';

/**
 * Tożsamość pisma na Dysku, odczytana z bazy. Wyłącznie te pola i tylko z bazy —
 * to na ich podstawie kasowane są pliki, więc nie wolno ich brać z żądania.
 */
export type LetterShortcutIdentity = {
    id: number;
    number: string | number | null;
    description: string | null;
    gdDocumentId: string | null;
    gdFolderId: string | null;
};

/**
 * Tworzy skróty do pisma w folderach jego spraw.
 *
 * Pisma do ofert są pomijane W CAŁOŚCI — decyzja właściciela produktu.
 * Powodem był duplikat w PIERWSZEJ sprawie: tam powstaje oryginał pisma
 * (OurLetterOfferGdController.makeParentFolderGdId zwraca `_cases[0].gdFolderId`),
 * więc skrót dublował dokument w tym samym folderze.
 * UWAGA, świadoma konsekwencja: przy piśmie przypiętym do kilku spraw w folderach
 * spraw 2..N nie ma teraz ŻADNEGO śladu pisma — tam skrót duplikatem nie był.
 */
export async function createCaseShortcuts(
    auth: OAuth2Client,
    letter: LetterData
): Promise<void> {
    const targetId = letter.gdDocumentId || letter.gdFolderId;
    if (!targetId || isOfferLetter(letter)) return;

    await Promise.all(
        (letter._cases || []).map(async (caseItem) => {
            if (!caseItem.gdFolderId) return;
            const parentId = await resolveShortcutParentId(auth, caseItem);
            if (!parentId) return;
            await ToolsGd.createShortcut(auth, {
                targetId,
                parentId,
                name: makeShortcutName(letter),
            });
        })
    );
}

/**
 * Uzgadnia skróty po zmianie powiązań pisma ze sprawami.
 *
 * Dla spraw DODANYCH zakłada skrót (przez `resolveShortcutParentId`, więc trafia
 * do podfolderu „Pisma", gdy kontrakt tak ma ustawione). Dla spraw ZDJĘTYCH kasuje
 * skrót wskazujący na dokument albo folder TEGO pisma, i wyłącznie w folderze
 * sprawy zdejmowanej.
 *
 * ŹRÓDŁO DANYCH JEST TU REGUŁĄ BEZPIECZEŃSTWA, nie szczegółem implementacji.
 * Wszystko, co decyduje CO skasować i GDZIE, pochodzi z bazy:
 * - `identity.gdDocumentId` / `identity.gdFolderId` — z wiersza `Letters`;
 * - `previousCases` i `currentCases` — z `Letters_Cases` (przed i po edycji),
 *   razem z `Cases.GdFolderId` i flagą `Contracts.LettersShortcutsInSubfolder`.
 * Payload klienta może wskazać, KTÓRE sprawy mają być powiązane — i tylko tyle;
 * zanim tu dotrze, jest już zapisany w `Letters_Cases`. Funkcja celowo NIE
 * przyjmuje `LetterData`, żeby obiektu z żądania nie dało się tu wstawić przez
 * pomyłkę: obiekt pisma jest budowany w całości z `req.body`
 * (`LettersRouters` → `createProperLetter`), więc porównywanie jego pól ze sobą
 * nie byłoby żadną bramką.
 *
 * Reguły kasowania (żadnej nie wolno pominąć):
 * 1. Kasujemy tylko plik o `mimeType` skrótu, którego `shortcutDetails.targetId`
 *    wskazuje na dokument albo folder tego pisma — według bazy.
 * 2. Kasujemy tylko w folderze sprawy zdejmowanej (albo w jej podfolderze „Pisma").
 * 3. Nie ruszamy folderu, który po zmianie nadal obsługuje którąś ze spraw pisma.
 * 4. Nie udało się odczytać celu albo cel jest inny niż oczekiwany — NIE kasujemy,
 *    zapisujemy to w logu i idziemy dalej. Cichy `catch` bez logu jest zakazany.
 * 5. Kasujemy do KOSZA (`trashFile`), nie trwale — pomyłka ma być odwracalna.
 *
 * Świadomie POZA zakresem: skróty osierocone, czyli wskazujące na pisma, których
 * nie ma już w bazie. Takie leżą na produkcji (np. skrót do pisma 6030 w folderze
 * sprawy 13653) i porządkowanie ich wymaga osobnego przelotu. Tu ich nie dotykamy,
 * bo reguła 1 wiąże kasowanie z identyfikatorami edytowanego pisma.
 */
export async function reconcileCaseShortcuts(
    auth: OAuth2Client,
    identity: LetterShortcutIdentity,
    previousCases: CaseData[],
    currentCases: CaseData[]
): Promise<void> {
    const casesNow = (currentCases || []).filter((caseItem) => caseItem?.id);

    // GUARD, ten sam co w LettersController.editCaseAssociations: brak powiązań
    // w bazie po edycji oznacza, że guard niekompletnego payloadu zadziałał
    // i wiersze zostały nietknięte. Skoro baza się nie zmieniła, Dysk też nie może.
    if (!casesNow.length) return;

    const targetIds = [identity.gdDocumentId, identity.gdFolderId].filter(
        (id): id is string => !!id
    );
    if (!targetIds.length) return;

    const currentCaseIds = new Set(casesNow.map((caseItem) => caseItem.id));
    const previousCaseIds = new Set(
        (previousCases || [])
            .map((caseItem) => caseItem?.id)
            .filter((id) => !!id)
    );

    const addedCases = casesNow.filter(
        (caseItem) => !previousCaseIds.has(caseItem.id)
    );
    const removedCases = (previousCases || []).filter(
        (caseItem) => caseItem?.id && !currentCaseIds.has(caseItem.id)
    );

    if (!addedCases.length && !removedCases.length) return;

    // Pismo do oferty rozpoznajemy po kamieniu sprawy odczytanym z bazy,
    // nie po polu `_offer` z payloadu.
    const isOffer = [...casesNow, ...removedCases].some(
        (caseItem) => caseItem?._parent?._offer
    );

    await addShortcutsForCases(auth, identity, addedCases, targetIds, isOffer);
    await removeShortcutsForCases(
        auth,
        identity,
        removedCases,
        casesNow,
        targetIds
    );
}

/**
 * Zakłada skróty w folderach spraw dodanych do pisma.
 * Pisma do ofert pomijamy tak samo jak w `createCaseShortcuts` — tam oryginał
 * dokumentu leży już w folderze pierwszej sprawy.
 */
async function addShortcutsForCases(
    auth: OAuth2Client,
    letter: LetterShortcutIdentity,
    addedCases: CaseData[],
    targetIds: string[],
    isOffer: boolean
): Promise<void> {
    if (!addedCases.length || isOffer) return;
    const targetId = targetIds[0];

    for (const caseItem of addedCases) {
        try {
            if (!caseItem.gdFolderId) {
                console.warn(
                    `[Skróty pism] Sprawa ${caseItem.id} nie ma folderu na Dysku — skrótu do pisma ${letter.id} nie założono.`
                );
                continue;
            }
            const parentId = await resolveShortcutParentId(auth, caseItem);
            if (!parentId) {
                console.warn(
                    `[Skróty pism] Nie udało się ustalić folderu na skrót dla sprawy ${caseItem.id} — pismo ${letter.id}.`
                );
                continue;
            }
            // Skrót już tam jest (np. powtórzona edycja albo skrót założony
            // ręcznie) — drugiego nie dokładamy.
            if (await hasShortcutInFolder(auth, targetIds, parentId)) {
                console.log(
                    `[Skróty pism] W folderze ${parentId} jest już skrót do pisma ${letter.id} — pomijam tworzenie.`
                );
                continue;
            }
            await ToolsGd.createShortcut(auth, {
                targetId,
                parentId,
                name: makeShortcutName(letter),
            });
        } catch (err) {
            console.error(
                `[Skróty pism] Nie udało się założyć skrótu do pisma ${letter.id} w sprawie ${caseItem.id}:`,
                err
            );
        }
    }
}

/**
 * Kasuje (do kosza) skróty do pisma w folderach spraw zdjętych z powiązań.
 * Każdy warunek z listy reguł jest tu sprawdzany osobno i osobno logowany.
 */
async function removeShortcutsForCases(
    auth: OAuth2Client,
    letter: LetterShortcutIdentity,
    removedCases: CaseData[],
    currentCases: CaseData[],
    targetIds: string[]
): Promise<void> {
    if (!removedCases.length) return;

    // Foldery nadal obsługujące którąś ze spraw pisma. Gdyby sprawa zdjęta
    // i sprawa pozostająca wskazywały ten sam folder, skasowanie skrótu
    // zabrałoby ślad również tej pozostającej.
    const keptFolderIds = new Set<string>();
    for (const caseItem of currentCases) {
        if (caseItem.gdFolderId) keptFolderIds.add(caseItem.gdFolderId);
        try {
            const parentId = await resolveShortcutParentId(auth, caseItem, {
                createIfMissing: false,
            });
            if (parentId) keptFolderIds.add(parentId);
        } catch (err) {
            console.error(
                `[Skróty pism] Nie udało się ustalić folderu skrótów dla pozostającej sprawy ${caseItem.id} — kasowanie skrótów pisma ${letter.id} wstrzymane:`,
                err
            );
            return;
        }
    }

    for (const caseItem of removedCases) {
        try {
            if (!caseItem.gdFolderId) {
                console.warn(
                    `[Skróty pism] Zdjęta sprawa ${caseItem.id} nie ma folderu na Dysku — nie ma czego sprzątać.`
                );
                continue;
            }
            const parentId = await resolveShortcutParentId(auth, caseItem, {
                createIfMissing: false,
            });
            if (!parentId) {
                console.warn(
                    `[Skróty pism] Zdjęta sprawa ${caseItem.id}: nie ma folderu na skróty (podfolder „Pisma" nie istnieje) — nic nie kasuję.`
                );
                continue;
            }
            if (keptFolderIds.has(parentId)) {
                console.warn(
                    `[Skróty pism] Folder ${parentId} obsługuje nadal inną sprawę pisma ${letter.id} — skrótu nie kasuję.`
                );
                continue;
            }
            await trashLetterShortcutsInFolder(
                auth,
                letter,
                targetIds,
                parentId
            );
        } catch (err) {
            console.error(
                `[Skróty pism] Nie udało się sprzątnąć skrótu pisma ${letter.id} w zdjętej sprawie ${caseItem.id}:`,
                err
            );
        }
    }
}

/** Czy w folderze leży już skrót wskazujący na to pismo */
async function hasShortcutInFolder(
    auth: OAuth2Client,
    targetIds: string[],
    parentId: string
): Promise<boolean> {
    for (const targetId of targetIds) {
        const shortcuts = await ToolsGd.findShortcutsByTarget(auth, targetId);
        if (
            shortcuts.some((shortcut) => shortcut.parents?.includes(parentId))
        )
            return true;
    }
    return false;
}

/**
 * Przenosi do kosza skróty do pisma leżące w danym folderze — po uprzednim
 * odczycie celu każdego z nich. Rozbieżność albo błąd odczytu zostawia skrót
 * nietknięty i zapisuje powód w logu.
 */
async function trashLetterShortcutsInFolder(
    auth: OAuth2Client,
    letter: LetterShortcutIdentity,
    targetIds: string[],
    parentId: string
): Promise<void> {
    const candidateIds = new Set<string>();
    for (const targetId of targetIds) {
        const shortcuts = await ToolsGd.findShortcutsByTarget(auth, targetId);
        shortcuts
            .filter((shortcut) => shortcut.parents?.includes(parentId))
            .forEach((shortcut) => {
                if (shortcut.id) candidateIds.add(shortcut.id);
            });
    }

    if (!candidateIds.size) {
        console.log(
            `[Skróty pism] W folderze ${parentId} nie ma skrótu do pisma ${letter.id} — nie ma czego kasować.`
        );
        return;
    }

    for (const shortcutId of candidateIds) {
        let metaData;
        try {
            metaData = await ToolsGd.getShortcutMetaData(auth, shortcutId);
        } catch (err) {
            console.error(
                `[Skróty pism] Nie udało się odczytać skrótu ${shortcutId} — NIE kasuję:`,
                err
            );
            continue;
        }

        const isShortcut =
            metaData.mimeType === 'application/vnd.google-apps.shortcut';
        const pointsAtThisLetter = !!(
            metaData.shortcutDetails?.targetId &&
            targetIds.includes(metaData.shortcutDetails.targetId)
        );
        const liesInThisFolder = !!metaData.parents?.includes(parentId);
        // Skrót już w koszu zostawiamy w spokoju — powtórne „kasowanie" tylko
        // zaśmiecałoby log i udawało pracę, której nie ma.
        const alreadyTrashed = metaData.trashed === true;

        if (
            !isShortcut ||
            !pointsAtThisLetter ||
            !liesInThisFolder ||
            alreadyTrashed
        ) {
            console.error(
                `[Skróty pism] Plik ${shortcutId} nie spełnia warunków kasowania — NIE kasuję. ` +
                    `mimeType=${metaData.mimeType}, ` +
                    `cel=${metaData.shortcutDetails?.targetId}, ` +
                    `oczekiwany cel z {${targetIds.join(', ')}}, ` +
                    `rodzice=${metaData.parents?.join(', ')}, oczekiwany ${parentId}, ` +
                    `w koszu=${metaData.trashed}.`
            );
            continue;
        }

        await ToolsGd.trashFile(auth, shortcutId);
        console.log(
            `[Skróty pism] Skrót ${shortcutId} („${metaData.name}") do pisma ${letter.id} przeniesiony do kosza z folderu ${parentId}.`
        );
    }
}

/**
 * Doprowadza nazwy istniejących skrótów do bieżących danych pisma.
 *
 * Nazwa skrótu jest na Dysku niezależna od nazwy celu — zmiana nazwy dokumentu
 * NIE zmienia nazw skrótów, trzeba je przemianować osobno. Skróty odnajdujemy po
 * celu (jedno zapytanie na pismo), więc działa to również dla pism utworzonych
 * zanim ta synchronizacja powstała — w tym dla pism do ofert, którym skrótów już
 * nie zakładamy, ale które mają je z przeszłości.
 *
 * Zmieniamy nazwy WYŁĄCZNIE skrótom leżącym w folderach spraw pisma. Ludzie
 * tworzą sobie własne skróty do dokumentów w folderach roboczych — te nie są
 * nasze i nie wolno ich ruszać.
 */
export async function syncCaseShortcutNames(
    auth: OAuth2Client,
    letter: LetterData
): Promise<void> {
    const targetId = letter.gdDocumentId || letter.gdFolderId;
    if (!targetId) return;

    const ownFolderIds = await collectShortcutFolderIds(auth, letter);
    if (!ownFolderIds.size) return;

    const name = makeShortcutName(letter);
    const shortcuts = await ToolsGd.findShortcutsByTarget(auth, targetId);

    await Promise.all(
        shortcuts
            .filter((shortcut) => shortcut.id && shortcut.name !== name)
            .filter((shortcut) =>
                shortcut.parents?.some((parentId) =>
                    ownFolderIds.has(parentId)
                )
            )
            .map((shortcut) =>
                ToolsGd.updateFile(auth, { id: shortcut.id, name })
            )
    );
}

/**
 * Foldery, w których mogą leżeć NASZE skróty do pisma: foldery spraw, a dla
 * kontraktów z opcją `lettersShortcutsInSubfolder` — podfoldery „Pisma".
 * Wyłącznie odczyt (`createIfMissing: false`) — synchronizacja nazw nie może
 * zakładać na Dysku brakujących folderów.
 */
async function collectShortcutFolderIds(
    auth: OAuth2Client,
    letter: LetterData
): Promise<Set<string>> {
    const folderIds = await Promise.all(
        (letter._cases || [])
            .filter((caseItem) => caseItem.gdFolderId)
            .map((caseItem) =>
                resolveShortcutParentId(auth, caseItem, {
                    createIfMissing: false,
                })
            )
    );
    return new Set(folderIds.filter((id): id is string => !!id));
}

function makeShortcutName(letter: {
    number?: string | number | null;
    description?: string | null;
}): string {
    return `${letter.number} ${letter.description}`;
}

/**
 * Pismo do oferty rozpoznajemy po `_offer` — kontraktowe mają `_project`.
 *
 * UWAGA: deprecated `OurOldTypeLetter` kopiuje tylko `_project`, więc gubi
 * `_offer`. Nie szkodzi, bo w `createProperLetter` łapie wyłącznie pisma
 * z `number !== id`, a `LettersController.addNew` ustawia `number = id`
 * każdemu `OurLetter` — pisma ofertowe nigdy tam nie trafiają.
 */
function isOfferLetter(letter: LetterData): boolean {
    return !!(letter as { _offer?: unknown })._offer;
}

/**
 * Folder, w którym ma leżeć skrót do pisma dla danej sprawy.
 * @param createIfMissing tworzy brakujący podfolder „Pisma" (domyślnie true);
 *   `false` przy samym wyszukiwaniu, żeby nie zakładać folderów jako efekt uboczny
 */
export async function resolveShortcutParentId(
    auth: OAuth2Client,
    caseItem: CaseData,
    { createIfMissing = true }: { createIfMissing?: boolean } = {}
): Promise<string | undefined> {
    if (caseItem._parent?._contract?.lettersShortcutsInSubfolder === true) {
        const subfolder = createIfMissing
            ? await ToolsGd.setFolder(auth, {
                  parentId: caseItem.gdFolderId!,
                  name: 'Pisma',
              })
            : await ToolsGd.getFileMetaDataByName(auth, {
                  parentId: caseItem.gdFolderId!,
                  fileName: 'Pisma',
              });
        return subfolder?.id ?? undefined;
    }
    return caseItem.gdFolderId!;
}
