export interface ScrumboardAbsenceData {
    id?: number;
    personId: number;
    typeId: number;
    dateFrom: string; // 'YYYY-MM-DD'
    dateTo: string; // 'YYYY-MM-DD'
    /** 'HH:MM' albo null. Oba czasy null = cały dzień. */
    startTime?: string | null;
    endTime?: string | null;
    workingDaysCount?: number;
    note?: string | null;
    createdByPersonId?: number | null;
    createdAt?: string;
    // pola pomocnicze z JOINa (tylko do odczytu/prezentacji)
    _typeName?: string;
    _typeColor?: string;
    _countsAgainstLimit?: boolean;
    _countsAsCare?: boolean;
    _countsAsHoliday?: boolean;
}

/**
 * Nieobecność jako zakres dat (odpowiednik zaznaczenia w arkuszu "urlopy").
 * Od packa GOD także jako część jednego dnia: wtedy startTime i endTime są wypełnione,
 * dateFrom = dateTo, a workingDaysCount jest ułamkiem (4 h = 0,5 dnia).
 */
export default class ScrumboardAbsence implements ScrumboardAbsenceData {
    id?: number;
    personId: number;
    typeId: number;
    dateFrom: string;
    dateTo: string;
    startTime: string | null;
    endTime: string | null;
    workingDaysCount: number;
    note?: string | null;
    createdByPersonId?: number | null;
    createdAt?: string;
    _typeName?: string;
    _typeColor?: string;
    _countsAgainstLimit?: boolean;
    _countsAsCare?: boolean;
    _countsAsHoliday?: boolean;

    constructor(data: ScrumboardAbsenceData) {
        this.id = data.id;
        this.personId = data.personId;
        this.typeId = data.typeId;
        this.dateFrom = data.dateFrom;
        this.dateTo = data.dateTo;
        this.startTime = data.startTime ?? null;
        this.endTime = data.endTime ?? null;
        // sterownik oddaje DECIMAL jako tekst ("0.50"), więc konwersja jest konieczna
        this.workingDaysCount = Number(data.workingDaysCount ?? 0);
        this.note = data.note ?? null;
        this.createdByPersonId = data.createdByPersonId ?? null;
        this.createdAt = data.createdAt;
        this._typeName = data._typeName;
        this._typeColor = data._typeColor;
        this._countsAgainstLimit = data._countsAgainstLimit;
        this._countsAsCare = data._countsAsCare;
        this._countsAsHoliday = data._countsAsHoliday;
    }
}
