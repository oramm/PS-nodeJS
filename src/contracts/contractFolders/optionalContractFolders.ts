/**
 * Katalog folderów na Dysku, które powstają przy rejestracji umowy, a NIE są
 * sprawami ani kamieniami milowymi. Jedyne źródło prawdy dla nazwy folderu,
 * jego zastosowania i pola, w którym ląduje id - Contract.createFolders()
 * iteruje po tej tablicy zamiast powtarzać nazwy w kodzie.
 *
 * NIE należą tu foldery mające własny przełącznik w UI ani takie, które nie
 * powstają przy rejestracji: „Pisma" (lettersShortcutsInSubfolder),
 * „04 Dokumentacja zatwierdzona" (approvedDocumentation), „Spisy spraw"
 * (tworzony dopiero przy generowaniu raportu).
 */

/**
 * appliesTo rozróżnia dziś tylko umowę ENVI od zewnętrznej, bo to odzwierciedla
 * podział klas Contract/ContractOther, a nie dane. Gdyby dostępność folderu
 * miała kiedyś zależeć od konkretnego typu umowy, to miejsce trzeba oprzeć
 * o tabelę, a nie dokładać kolejnych wariantów tego stringa.
 */
export const OPTIONAL_CONTRACT_FOLDERS = [
    {
        key: 'MEETING_PROTOCOLS',
        name: 'Notatki ze spotkań',
        appliesTo: 'ALL',
        isDefault: true,
        gdFolderIdField: 'meetingProtocolsGdFolderId',
    },
    {
        key: 'MATERIAL_CARDS',
        name: 'Wnioski Materiałowe',
        appliesTo: 'OTHER',
        isDefault: true,
        gdFolderIdField: 'materialCardsGdFolderId',
    },
] as const;

export type OptionalContractFolderKey =
    (typeof OPTIONAL_CONTRACT_FOLDERS)[number]['key'];

/**
 * Foldery dostępne dla danego typu umowy.
 * @param isOur - czy to umowa ENVI (ContractTypes.IsOur)
 */
export function optionalFoldersForContractType(isOur: boolean) {
    return OPTIONAL_CONTRACT_FOLDERS.filter(
        (folder) => folder.appliesTo === 'ALL' || !isOur
    );
}

/** Nazwa folderu na Dysku dla danego klucza. */
export function optionalFolderName(key: OptionalContractFolderKey): string {
    return OPTIONAL_CONTRACT_FOLDERS.find((folder) => folder.key === key)!.name;
}

/**
 * Czy folder ma powstać.
 *
 * KOMPATYBILNOŚĆ WSTECZNA: brak selekcji (starszy klient, inne wywołania,
 * ścieżka odtworzeniowa Contract.editFolder) oznacza „twórz wszystko",
 * czyli dokładnie dzisiejsze zachowanie. Pusta tablica to świadomy wybór
 * użytkownika i oznacza „nie twórz nic".
 */
export function isFolderSelected(
    key: OptionalContractFolderKey,
    selection?: OptionalContractFolderKey[]
): boolean {
    if (!selection) return true;
    return selection.includes(key);
}

/** Odsiewa z danych z żądania klucze spoza katalogu i duplikaty. */
export function parseOptionalFoldersSelection(
    raw: unknown
): OptionalContractFolderKey[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const known = new Set<string>(OPTIONAL_CONTRACT_FOLDERS.map((f) => f.key));
    return [
        ...new Set(
            raw.filter(
                (item): item is OptionalContractFolderKey =>
                    typeof item === 'string' && known.has(item)
            )
        ),
    ];
}
