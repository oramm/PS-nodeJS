export interface ScrumboardAbsenceData {
    id?: number;
    personId: number;
    typeId: number;
    dateFrom: string; // 'YYYY-MM-DD'
    dateTo: string; // 'YYYY-MM-DD'
    workingDaysCount?: number;
    note?: string | null;
    createdByPersonId?: number | null;
    createdAt?: string;
    // pola pomocnicze z JOINa (tylko do odczytu/prezentacji)
    _typeName?: string;
    _typeColor?: string;
    _countsAgainstLimit?: boolean;
}

/** Nieobecność jako zakres dat (odpowiednik zaznaczenia w arkuszu "urlopy"). */
export default class ScrumboardAbsence implements ScrumboardAbsenceData {
    id?: number;
    personId: number;
    typeId: number;
    dateFrom: string;
    dateTo: string;
    workingDaysCount: number;
    note?: string | null;
    createdByPersonId?: number | null;
    createdAt?: string;
    _typeName?: string;
    _typeColor?: string;
    _countsAgainstLimit?: boolean;

    constructor(data: ScrumboardAbsenceData) {
        this.id = data.id;
        this.personId = data.personId;
        this.typeId = data.typeId;
        this.dateFrom = data.dateFrom;
        this.dateTo = data.dateTo;
        this.workingDaysCount = Number(data.workingDaysCount ?? 0);
        this.note = data.note ?? null;
        this.createdByPersonId = data.createdByPersonId ?? null;
        this.createdAt = data.createdAt;
        this._typeName = data._typeName;
        this._typeColor = data._typeColor;
        this._countsAgainstLimit = data._countsAgainstLimit;
    }
}
