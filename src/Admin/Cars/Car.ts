import BusinessObject from '../../BussinesObject';
import { CarData } from '../../types/types';

/**
 * Samochód służbowy (słownik pojazdów do kilometrówki).
 *
 * UWAGA: tabela Cars NIE ma kolumny EditorId. Nie przekazuj tu `_editor` -
 * BusinessObject ustawiłby `editorId`, a ToolsDb wygenerowałby kolumnę `EditorId`
 * w INSERT/UPDATE i zapytanie padłoby dopiero w runtime. Audyt zapewniają
 * CreatedAt/UpdatedAt po stronie bazy.
 */
export default class Car extends BusinessObject implements CarData {
    id?: number;
    brand: string;
    model?: string | null;
    licensePlateNumber: string;
    mileageSpreadsheetId?: string | null;
    mileageSheetGid?: number | null;
    isActive: boolean;
    comment?: string | null;

    constructor(initParamObject: any) {
        super({ ...initParamObject, _dbTableName: 'Cars' });
        this.id = initParamObject.id;
        this.brand = initParamObject.brand;
        this.model = initParamObject.model;
        this.licensePlateNumber = initParamObject.licensePlateNumber;
        this.mileageSpreadsheetId = initParamObject.mileageSpreadsheetId;
        this.mileageSheetGid = initParamObject.mileageSheetGid;
        this.isActive = initParamObject.isActive;
        this.comment = initParamObject.comment;
    }
}
