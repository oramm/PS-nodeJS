import BusinessObject from '../../BussinesObject';
import { AbsenceTypeData } from '../../types/types';

/**
 * Typ nieobecności (słownik urlopowy).
 *
 * Flagi countsAgainstLimit / countsAsCare / countsAsHoliday NIE są kosmetyką - kontroler urlopów
 * wybiera na ich podstawie pulę, z której schodzi nieobecność. Zmiana flagi na
 * istniejącym typie przelicza salda wstecz dla wszystkich osób i lat.
 *
 * allowsPartialDay mówi, czy ten typ wolno wpisać na część dnia (godziny od-do).
 * O tym decyduje wyłącznie ta flaga - system NIE zna prawnych różnic między opieką,
 * urlopem wypoczynkowym a wolnym za święto (decyzja ownera D1, pack GOD).
 *
 * UWAGA: tabela ScrumboardAbsenceTypes nie ma kolumny EditorId - nie przekazuj `_editor`.
 */
export default class AbsenceType
    extends BusinessObject
    implements AbsenceTypeData
{
    id?: number;
    name: string;
    color: string;
    countsAgainstLimit: boolean;
    countsAsCare: boolean;
    countsAsHoliday: boolean;
    allowsPartialDay: boolean;
    _usageCount?: number;
    _partialUsageCount?: number;

    constructor(initParamObject: any) {
        super({ ...initParamObject, _dbTableName: 'ScrumboardAbsenceTypes' });
        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.color = initParamObject.color;
        this.countsAgainstLimit = initParamObject.countsAgainstLimit;
        this.countsAsCare = initParamObject.countsAsCare;
        this.countsAsHoliday = initParamObject.countsAsHoliday;
        this.allowsPartialDay = initParamObject.allowsPartialDay;
        this._usageCount = initParamObject._usageCount;
        this._partialUsageCount = initParamObject._partialUsageCount;
    }
}
