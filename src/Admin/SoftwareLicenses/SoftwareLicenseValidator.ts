import { BadRequestError } from '../../persons/projectAssignments/ProjectScopeGuard';
import { SoftwareLicenseData } from './SoftwareLicense';

export type SoftwareLicensesSearchParams = { id?: number; searchText?: string };

export default class SoftwareLicenseValidator {
    static requireObject(value: any): Record<string, any> {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new BadRequestError('Brak prawidłowych danych licencji.');
        return value;
    }

    static requireActorId(value: unknown): number {
        return this.integer(value, 'Użytkownik', 1);
    }

    static requireId(value: any): number {
        return this.integer(value, 'Numer licencji', 1);
    }

    static validatePayload(raw: any, existing?: SoftwareLicenseData): SoftwareLicenseData {
        const dto = { ...existing, ...this.requireObject(raw) };
        const data: SoftwareLicenseData = {
            manufacturer: this.text(dto.manufacturer, 'Producent', 255, true)!,
            product: this.text(dto.product, 'Produkt', 255, true)!,
            version: this.text(dto.version, 'Wersja', 100),
            licenseType: this.text(dto.licenseType, 'Typ licencji', 20),
            registrationAccount: this.text(dto.registrationAccount, 'Konto rejestracji', 320),
            vendorPanelUrl: this.text(dto.vendorPanelUrl, 'Panel producenta', 65535, false, true),
            seatsPurchased: this.integer(dto.seatsPurchased, 'Stanowiska kupione'),
            seatsUsed: this.integer(dto.seatsUsed, 'Stanowiska zajęte'),
            assignment: this.text(dto.assignment, 'Przypisanie', 65535, false, true),
            purchaseDate: this.date(dto.purchaseDate, 'Data zakupu'),
            expirationDate: this.date(dto.expirationDate, 'Data wygaśnięcia'),
            cost: this.cost(dto.cost),
            billingCycle: this.text(dto.billingCycle, 'Cykl rozliczeniowy', 100),
            status: this.text(dto.status, 'Status', 100),
            comment: this.text(dto.comment, 'Uwagi', 65535, false, true),
        };
        if (data.licenseType !== null && !['OEM', 'Retail', 'Volume', 'Subscription'].includes(data.licenseType))
            throw new BadRequestError('Nieprawidłowy typ licencji.');
        if (data.seatsUsed > data.seatsPurchased)
            throw new BadRequestError('Liczba zajętych stanowisk nie może przekraczać liczby kupionych.');
        return data;
    }

    // Ominięcie pola przy edycji zachowuje klucz; null lub pusty tekst usuwa go.
    // Nie trimujemy klucza: jego dokładny tekst musi przeżyć zapis i odszyfrowanie.
    static licenseKey(dto: any): string | null | undefined {
        this.requireObject(dto);
        const value = dto.licenseKey;
        if (value === undefined || value === null) return value;
        if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 8388577 || Buffer.from(value).toString('utf8') !== value)
            throw new BadRequestError('Nieprawidłowy klucz licencyjny lub przekroczona długość.');
        return value === '' ? null : value;
    }

    static search(raw: any = [{}]): SoftwareLicensesSearchParams[] {
        // Formularze istniejącego klienta przesyłają zagnieżdżone DTO jako JSON.
        if (typeof raw === 'string') {
            try { raw = JSON.parse(raw); } catch { throw new BadRequestError('Nieprawidłowy filtr licencji.'); }
        }
        if (!Array.isArray(raw) || raw.length > 100)
            throw new BadRequestError('Nieprawidłowy filtr licencji.');
        return raw.map((item) => {
            const dto = this.requireObject(item);
            return {
                id: dto.id === undefined ? undefined : this.requireId(dto.id),
                searchText: this.text(dto.searchText, 'Wyszukiwanie', 255) ?? undefined,
            };
        });
    }

    private static integer(value: any, label: string, min = 0): number {
        if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d+$/.test(String(value)) ||
            !Number.isInteger(Number(value)) || Number(value) < min || Number(value) > 2147483647)
            throw new BadRequestError(`Pole „${label}” musi być liczbą całkowitą od ${min} do 2147483647.`);
        return Number(value);
    }

    private static text(value: any, label: string, limit: number, required = false, bytes = false): string | null {
        if (value === undefined || value === null || value === '') {
            if (required) throw new BadRequestError(`Pole „${label}” jest wymagane.`);
            return null;
        }
        if (typeof value !== 'string') throw new BadRequestError(`Pole „${label}” musi być tekstem.`);
        const trimmed = value.trim();
        if (Buffer.from(value).toString('utf8') !== value || (bytes ? Buffer.byteLength(value, 'utf8') : Array.from(value).length) > limit)
            throw new BadRequestError(`Pole „${label}” zawiera nieprawidłowy tekst lub przekracza dopuszczalną długość.`);
        if (!trimmed && required) throw new BadRequestError(`Pole „${label}” jest wymagane.`);
        return trimmed || null;
    }

    private static cost(value: any): string | null {
        if (value === undefined || value === null || value === '') return null;
        if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d{1,10}(\.\d{1,2})?$/.test(String(value)))
            throw new BadRequestError('Koszt brutto musi być nieujemną kwotą w PLN, do 9999999999,99 zł i najwyżej dwóch miejsc po przecinku.');
        return Number(value).toFixed(2);
    }

    private static date(value: any, label: string): string | null {
        if (value === undefined || value === null || value === '') return null;
        if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value))
            throw new BadRequestError(`Pole „${label}” musi być datą w formacie RRRR-MM-DD.`);
        const date = new Date(`${value}T00:00:00.000Z`);
        if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
            throw new BadRequestError(`Pole „${label}” zawiera nieprawidłową datę.`);
        return value;
    }
}
