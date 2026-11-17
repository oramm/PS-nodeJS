import { MileageYearError } from './MileageYear';

export default class MileageValidator {
    static date(value: unknown): string {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)
            throw new MileageYearError('INVALID_TRIP', 'Podaj prawidłową datę wyjazdu.');
        return value;
    }
    static businessDate(value?: unknown): string {
        if (value !== undefined) return this.date(value);
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    }
    static trip(dto: any, driver: unknown): void {
        const fail = (message: string): never => { throw new MileageYearError('INVALID_TRIP', message); };
        if (!dto || typeof dto !== 'object' || Array.isArray(dto)) fail('Nieprawidłowy wpis kilometrówki.');
        this.date(dto.date);
        if (!['string', 'number'].includes(typeof dto.vehicleId) || !/^\d+$/.test(String(dto.vehicleId)) || !Number.isSafeInteger(Number(dto.vehicleId)) || Number(dto.vehicleId) < 1) fail('Nieprawidłowy pojazd.');
        for (const key of ['startReading', 'endReading']) if (typeof dto[key] !== 'number' || !Number.isSafeInteger(dto[key]) || dto[key] < 0) fail('Stany licznika muszą być nieujemnymi liczbami całkowitymi.');
        if (dto.endReading < dto.startReading) fail('Stan końcowy nie może być mniejszy od początkowego.');
        for (const key of ['projectOurId', 'purpose']) if (typeof dto[key] !== 'string' || dto[key].length > 2000) fail('Nieprawidłowy opis wpisu.');
        if (!dto.purpose.trim() || !Array.isArray(dto.routeParts) || dto.routeParts.length < 1 || dto.routeParts.length > 10 || dto.routeParts.some((part:unknown) => typeof part !== 'string' || part.length > 1000) || !dto.routeParts.some((part:string) => part.trim())) fail('Podaj cel i trasę wyjazdu.');
        if (typeof driver !== 'string' || !driver.trim() || driver.length > 200) fail('Podaj kierującego pojazdem.');
        if (dto.driver !== undefined && typeof dto.driver !== 'string') fail('Nieprawidłowy kierujący pojazdem.');
        if (dto.fuelingDate !== undefined && dto.fuelingDate !== '') this.date(dto.fuelingDate);
        if (dto.fuelingReading !== undefined && dto.fuelingReading !== '' && (typeof dto.fuelingReading !== 'number' || !Number.isSafeInteger(dto.fuelingReading) || dto.fuelingReading < 0)) fail('Nieprawidłowy stan licznika przy tankowaniu.');
        if (dto.requestId !== undefined && (typeof dto.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(dto.requestId))) fail('Nieprawidłowy identyfikator zapisu.');
    }
}
