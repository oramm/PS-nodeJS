/**
 * Cienki interfejs do Dysku Google dla zlecen podpisu. Kontroler zna tylko ten interfejs, wiec
 * testy podstawiaja atrape (i potrafia stwierdzic, ze przed odmowa nic nie zapisano na Dysku).
 * Prawdziwa implementacja: GoogleSigningDrive.
 */
export interface DriveFileInfo {
    id: string;
    name: string;
    mimeType: string;
    /** Rozmiar w bajtach, gdy Dysk go zna (pliki natywne Google nie maja rozmiaru). */
    size?: number;
    /** Foldery nadrzedne (id). */
    parents?: string[];
    trashed?: boolean;
}

export interface SigningDrive {
    /** Metadane jednego pliku; undefined, gdy nie istnieje. */
    getFile(fileId: string): Promise<DriveFileInfo | undefined>;
    /** Bezposrednie dzieci folderu (bez kosza). */
    listFolder(folderId: string): Promise<DriveFileInfo[]>;
    /** Zawartosc pliku binarnego (PDF). Tylko odczyt. */
    downloadFile(fileId: string): Promise<Buffer>;
    /** Eksport Dokumentu/Arkusza Google do PDF. Tylko odczyt. */
    exportToPdf(fileId: string): Promise<Buffer>;

    // --- Zapisy. Wolane WYLACZNIE po przejsciu wszystkich sprawdzen zlecenia. ---

    /** Zapisuje PDF w folderze; zwraca id nowego pliku. */
    uploadPdf(params: {
        name: string;
        parentFolderId: string;
        bytes: Buffer;
    }): Promise<{ id: string }>;
    /** Wyrzuca plik do kosza (odwracalnie) - sprzatanie po nieudanym zapisie wielu plikow. */
    trashFile(fileId: string): Promise<void>;
}
