import { SiteVisitPhotoData } from './SiteVisit';

export interface SiteVisitInputDto {
    contractId: number;
    description?: string | null;
    visitedAt?: string;
    photosMeta: SiteVisitPhotoData[]; // metadane per zdjęcie (kolejność zgodna z plikami)
}

/**
 * Walidacja wejścia rejestracji wizyty. Osobna klasa (Clean Architecture) -
 * bez I/O, tylko reguły. Autoryzacja (flaga + przypisanie do kontraktu) jest
 * poza walidatorem, w Controllerze/Routerze.
 */
export default class SiteVisitValidator {
    static validate(
        dto: SiteVisitInputDto,
        fileCount: number
    ): void {
        if (!dto.contractId || !Number.isInteger(dto.contractId))
            throw new Error('Wizyta musi być przypisana do kontraktu.');

        if (fileCount < 1)
            throw new Error('Dodaj co najmniej jedno zdjęcie.');

        if (!Array.isArray(dto.photosMeta))
            throw new Error('Nieprawidłowe metadane zdjęć.');

        if (dto.photosMeta.length !== fileCount)
            throw new Error(
                'Liczba opisów zdjęć nie zgadza się z liczbą przesłanych plików.'
            );

        for (const meta of dto.photosMeta) {
            if (
                meta.latitude != null &&
                (meta.latitude < -90 || meta.latitude > 90)
            )
                throw new Error('Nieprawidłowa szerokość geograficzna zdjęcia.');
            if (
                meta.longitude != null &&
                (meta.longitude < -180 || meta.longitude > 180)
            )
                throw new Error('Nieprawidłowa długość geograficzna zdjęcia.');
        }
    }
}
