import { OAuth2Client } from 'google-auth-library';
import ToolsGd from '../tools/ToolsGd';
import { CaseData, LetterData } from '../types/types';

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

function makeShortcutName(letter: LetterData): string {
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
