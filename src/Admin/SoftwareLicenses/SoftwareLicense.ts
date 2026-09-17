import BusinessObject from '../../BussinesObject';

export interface SoftwareLicenseData {
    manufacturer: string;
    product: string;
    version: string | null;
    licenseType: string | null;
    registrationAccount: string | null;
    vendorPanelUrl: string | null;
    googleDriveUrl: string | null;
    seatsPurchased: number;
    seatsUsed: number;
    assignment: string | null;
    purchaseDate: string | null;
    expirationDate: string | null;
    cost: string | null;
    billingCycle: string | null;
    status: string | null;
    comment: string | null;
}

/**
 * Bez EditorId, zgodnie z prostą ewidencją Cars: v1 potrzebuje znaczników czasu,
 * a audyt odsłonięć klucza ma osobny zakres LIC-3. Nie przekazujemy _editor do
 * BusinessObject, aby ToolsDb nie próbowało zapisać nieistniejącej kolumny.
 * Klucz nie należy do publicznego modelu; zapis przekazuje szyfrogram osobno.
 */
export default class SoftwareLicense extends BusinessObject {
    id?: number;
    readonly data: SoftwareLicenseData;
    readonly hasLicenseKey: boolean;
    readonly createdAt?: string;
    readonly updatedAt?: string;

    constructor(data: SoftwareLicenseData, id?: number, hasLicenseKey = false, createdAt?: string, updatedAt?: string) {
        super({ id, _dbTableName: 'SoftwareLicenses' });
        this.data = data;
        this.hasLicenseKey = hasLicenseKey;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    toJSON() {
        return {
            id: this.id,
            ...this.data,
            seatsFree: this.data.seatsPurchased - this.data.seatsUsed,
            hasLicenseKey: this.hasLicenseKey,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}
