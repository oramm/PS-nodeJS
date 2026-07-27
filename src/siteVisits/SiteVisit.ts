export interface SiteVisitPhotoData {
    id?: number;
    siteVisitId?: number;
    gdFileId: string;
    fileName?: string | null;
    takenAt?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    gpsAccuracy?: number | null;
    sortOrder?: number;
}

export interface SiteVisitData {
    id?: number;
    contractId: number;
    personId: number;
    description?: string | null;
    gdFolderId?: string | null;
    visitedAt: string; // 'YYYY-MM-DD HH:mm:ss'
    _photos?: SiteVisitPhotoData[];
    _contractLabel?: string;
    _authorName?: string;
    _gdFolderUrl?: string;
}

/**
 * Wizyta na budowie: jeden opis do 1..N zdjęć, powiązana z kontraktem i autorem.
 * Model transportowy - bez logiki I/O (Clean Architecture). Zapis realizuje
 * SiteVisitRepository/SiteVisitController.
 */
export default class SiteVisit implements SiteVisitData {
    id?: number;
    contractId: number;
    personId: number;
    description?: string | null;
    gdFolderId?: string | null;
    visitedAt: string;
    _photos?: SiteVisitPhotoData[];
    _contractLabel?: string;
    _authorName?: string;
    _gdFolderUrl?: string;

    constructor(init: SiteVisitData) {
        this.id = init.id;
        this.contractId = init.contractId;
        this.personId = init.personId;
        this.description = init.description ?? null;
        this.gdFolderId = init.gdFolderId ?? null;
        this.visitedAt = init.visitedAt;
        this._photos = init._photos;
        this._contractLabel = init._contractLabel;
        this._authorName = init._authorName;
        this._gdFolderUrl = init._gdFolderUrl;
    }
}
