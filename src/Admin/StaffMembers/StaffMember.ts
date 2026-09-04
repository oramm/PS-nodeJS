import BusinessObject from '../../BussinesObject';
import { FidmanUserSyncStatus, StaffMemberData } from '../../types/types';

/**
 * Uprawnienia funkcyjne osoby.
 *
 * To NIE jest słownik - wiersz to zestaw flag przypiętych do istniejącej osoby.
 * Kluczem naturalnym jest personId (UNIQUE), nie Id wiersza, dlatego zapis idzie
 * upsertem: osoba może jeszcze nie mieć wiersza (seed migracji objął tylko role 1/2/3).
 *
 * UWAGA: tabela StaffMembers nie ma kolumny EditorId - nie przekazuj `_editor`.
 */
export default class StaffMember
    extends BusinessObject
    implements StaffMemberData
{
    id?: number;
    personId: number;
    isDriver: boolean;
    isInScrum: boolean;
    hasCostInvoiceAccess: boolean;
    hasBankAccess: boolean;
    canLogSiteVisits: boolean;
    isActive: boolean;
    _personName?: string;
    _personSurname?: string;
    _personEmail?: string;
    _entityName?: string | null;
    _systemRoleId?: number | null;
    _systemEmail?: string | null;
    _fidmanEnabled?: boolean;
    _hasStaffRow?: boolean;
    _fidmanSync?: FidmanUserSyncStatus | null;

    constructor(initParamObject: any) {
        super({ ...initParamObject, _dbTableName: 'StaffMembers' });
        this.id = initParamObject.id;
        this.personId = initParamObject.personId;
        this.isDriver = initParamObject.isDriver;
        this.isInScrum = initParamObject.isInScrum;
        this.hasCostInvoiceAccess = initParamObject.hasCostInvoiceAccess;
        this.hasBankAccess = initParamObject.hasBankAccess;
        this.canLogSiteVisits = initParamObject.canLogSiteVisits;
        this.isActive = initParamObject.isActive;
        this._personName = initParamObject._personName;
        this._personSurname = initParamObject._personSurname;
        this._personEmail = initParamObject._personEmail;
        this._entityName = initParamObject._entityName;
        this._systemRoleId = initParamObject._systemRoleId;
        this._systemEmail = initParamObject._systemEmail;
        this._fidmanEnabled = initParamObject._fidmanEnabled;
        this._hasStaffRow = initParamObject._hasStaffRow;
        this._fidmanSync = initParamObject._fidmanSync ?? null;
    }
}
