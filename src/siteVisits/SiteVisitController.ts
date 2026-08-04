import { OAuth2Client } from 'google-auth-library';
import { Readable } from 'stream';
import BaseController from '../controllers/BaseController';
import ToolsDb from '../tools/ToolsDb';
import ToolsGd from '../tools/ToolsGd';
import { ProjectScope } from '../types/sessionTypes';
import SiteVisit, { SiteVisitPhotoData } from './SiteVisit';
import SiteVisitRepository, {
    AssignableContract,
    SiteVisitSearchParams,
    VisitSummaryRow,
} from './SiteVisitRepository';
import SiteVisitValidator, { SiteVisitInputDto } from './SiteVisitValidator';

const ROOT_SUBFOLDER_NAME = 'Wizyty na budowie';
const GD_FOLDER_MIME = 'application/vnd.google-apps.folder';

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

/** 'YYYY-MM-DD HH:mm:ss' z obiektu Date (czas lokalny serwera). */
function formatDateTime(d: Date): string {
    return (
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    );
}

/** Bezpieczna nazwa folderu/pliku na Google Drive (bez znaków ścieżki). */
function sanitizeName(name: string): string {
    return name.replace(/[\\/]/g, '-').replace(/\s+/g, ' ').trim();
}

export default class SiteVisitController extends BaseController<
    SiteVisit,
    SiteVisitRepository
> {
    private static instance: SiteVisitController;
    private static getInstance(): SiteVisitController {
        if (!this.instance)
            this.instance = new SiteVisitController(new SiteVisitRepository());
        return this.instance;
    }

    constructor(repository: SiteVisitRepository) {
        super(repository);
    }

    /** Kontrakty dostępne dla użytkownika (aktywne + przypisane rolą). */
    static async getContracts(
        personId: number,
        scope?: ProjectScope
    ): Promise<AssignableContract[]> {
        return this.getInstance().repository.getAssignableContracts(
            personId,
            scope
        );
    }

    /** Wizyty zalogowanego użytkownika (nagłówki + zdjęcia), najnowsze pierwsze. */
    static async listVisits(
        personId: number,
        filters: SiteVisitSearchParams = {}
    ): Promise<SiteVisit[]> {
        // personId wymuszony na końcu - użytkownik widzi tylko swoje wizyty.
        return this.getInstance().repository.find({ ...filters, personId });
    }

    /** Pojedyncza wizyta użytkownika ze zdjęciami. */
    static async getVisit(
        id: number,
        personId: number
    ): Promise<SiteVisit | undefined> {
        const visits = await this.getInstance().repository.find({ id });
        const visit = visits[0];
        if (!visit || visit.personId !== personId) return undefined;
        return visit;
    }

    /** [Przegląd] Wizyty wszystkich osób z filtrami (tylko rola 1/2 - gate w routerze). */
    static async adminListVisits(
        params: SiteVisitSearchParams
    ): Promise<SiteVisit[]> {
        return this.getInstance().repository.find(params);
    }

    /** [Przegląd] Podsumowanie liczby wizyt wg osoby lub kontraktu. */
    static async adminSummary(
        groupBy: 'person' | 'contract',
        params: SiteVisitSearchParams
    ): Promise<VisitSummaryRow[]> {
        return this.getInstance().repository.getVisitsSummary(groupBy, params);
    }

    /**
     * Zwraca strumień bajtów zdjęcia z Google Drive (do proxy'owania przez Router),
     * dzięki czemu pliki wizyt nie muszą być publiczne. Dostęp = ktokolwiek z
     * uprawnieniem do modułu (gate w routerze) - jeśli ktoś może oglądać wizyty,
     * może też oglądać ich zdjęcia. Sprawdzamy tylko, że fileId to realne zdjęcie wizyty.
     * Warstwę HTTP (nagłówki, pipe) obsługuje Router - Controller nie zna `res`.
     */
    static async getPhotoMedia(
        gdFileId: string
    ): Promise<{ stream: Readable; mimeType?: string; name?: string }> {
        const exists = await this.getInstance().repository.findVisitByPhotoFileId(
            gdFileId
        );
        if (!exists) throw new Error('Nie znaleziono zdjęcia.');
        return await this.withAuth((_instance, auth) =>
            ToolsGd.getFileMedia(auth, gdFileId)
        );
    }

    /**
     * Rejestruje wizytę: autoryzuje przypisanie do kontraktu, tworzy podfolder na
     * Google Drive, wgrywa zdjęcia i zapisuje log (nagłówek + zdjęcia) w transakcji.
     * Zdjęcia to wersje z ewentualnym rysunkiem naniesionym po stronie klienta.
     */
    static async addVisit(
        dto: SiteVisitInputDto,
        files: Express.Multer.File[],
        personId: number,
        authorName: string,
        scope?: ProjectScope
    ): Promise<{ id: number; photoCount: number; gdFolderUrl?: string }> {
        SiteVisitValidator.validate(dto, files.length);

        return await this.withAuth(async (instance: SiteVisitController, auth) => {
            const repository = instance.repository;

            // Autoryzacja: kontrakt musi być na liście dostępnych dla tej osoby.
            const contract = await repository.getAssignableContract(
                personId,
                dto.contractId,
                scope
            );
            if (!contract)
                throw new Error(
                    'Brak dostępu do wybranego kontraktu lub kontrakt jest nieaktywny.'
                );
            if (!contract.gdFolderId)
                throw new Error(
                    'Wybrany kontrakt nie ma folderu na Google Drive.'
                );

            const visitedAt = dto.visitedAt?.trim() || formatDateTime(new Date());

            // Sprzątanie obejmuje TWORZENIE folderu i uploady (nie tylko zapis DB):
            // gdy upload padnie po utworzeniu folderu/części zdjęć, kasujemy folder,
            // żeby nie zostawić osieroconych plików bez wpisu w bazie.
            let visitFolderId: string | undefined;
            try {
                visitFolderId = await this.createVisitFolder(
                    auth,
                    contract,
                    visitedAt,
                    authorName
                );

                // Upload zdjęć (I/O poza transakcją). Kolejność = kolejność meta.
                const uploaded: { gdFileId: string; fileName: string }[] = [];
                for (const file of files) {
                    const res = await ToolsGd.uploadFileMulter(
                        auth,
                        file,
                        { fields: 'id,name' },
                        visitFolderId
                    );
                    if (!res.id)
                        throw new Error(
                            'Nie udało się wgrać zdjęcia na Google Drive.'
                        );
                    uploaded.push({
                        gdFileId: res.id,
                        fileName: res.name ?? file.originalname,
                    });
                }

                const visit = new SiteVisit({
                    contractId: dto.contractId,
                    personId,
                    description: dto.description ?? null,
                    gdFolderId: visitFolderId,
                    visitedAt,
                });
                await ToolsDb.transaction(async (conn) => {
                    await repository.addVisitInDb(visit, conn);
                    for (let i = 0; i < uploaded.length; i++) {
                        const meta = dto.photosMeta[i] ?? ({} as SiteVisitPhotoData);
                        await repository.addPhotoInDb(
                            {
                                siteVisitId: visit.id,
                                gdFileId: uploaded[i].gdFileId,
                                fileName: uploaded[i].fileName,
                                takenAt: meta.takenAt ?? null,
                                latitude: meta.latitude ?? null,
                                longitude: meta.longitude ?? null,
                                gpsAccuracy: meta.gpsAccuracy ?? null,
                                sortOrder: i,
                            },
                            conn
                        );
                    }
                });

                return {
                    id: visit.id!,
                    photoCount: uploaded.length,
                    gdFolderUrl: ToolsGd.createGdFolderUrl(visitFolderId),
                };
            } catch (error) {
                if (visitFolderId)
                    await ToolsGd.trashFolder(auth, visitFolderId).catch(() => {});
                throw error;
            }
        });
    }

    /**
     * Tworzy podfolder wizyty: `Wizyty na budowie/<data> <nazwisko>` w folderze
     * kontraktu. Folder-parasol "Wizyty na budowie" jest współdzielony (find-or-create),
     * a konkretna wizyta dostaje własny podfolder z datą i autorem.
     */
    private static async createVisitFolder(
        auth: OAuth2Client,
        contract: AssignableContract,
        visitedAt: string,
        authorName: string
    ): Promise<string> {
        const rootId = await this.ensureSubfolder(
            auth,
            contract.gdFolderId!,
            ROOT_SUBFOLDER_NAME
        );
        const dateStr = visitedAt.slice(0, 16).replace(':', '-'); // 'YYYY-MM-DD HH-mm'
        const folderName = sanitizeName(
            `${dateStr} ${authorName || 'wizyta'}`
        );
        const created = await ToolsGd.createFolder(auth, {
            name: folderName,
            parents: [rootId],
        });
        if (!created.id)
            throw new Error('Nie udało się utworzyć folderu wizyty na Google Drive.');
        return created.id;
    }

    /** Zwraca id istniejącego podfolderu o danej nazwie albo tworzy nowy. */
    private static async ensureSubfolder(
        auth: OAuth2Client,
        parentId: string,
        name: string
    ): Promise<string> {
        const existing = await ToolsGd.getFileMetaDataByNameAndMimeType(auth, {
            parentId,
            fileName: name,
            mimeType: GD_FOLDER_MIME,
        });
        if (existing?.id) return existing.id;
        const created = await ToolsGd.createFolder(auth, {
            name,
            parents: [parentId],
        });
        if (!created.id)
            throw new Error(`Nie udało się utworzyć folderu "${name}" na Google Drive.`);
        return created.id;
    }
}
