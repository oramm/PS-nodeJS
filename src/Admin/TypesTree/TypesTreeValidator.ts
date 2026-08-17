import { BadRequestError } from '../../persons/projectAssignments/ProjectScopeGuard';
import { isCaseTypeNameLocked, isMilestoneTypeNameLocked } from './protectedTypes';

export type NewMilestoneTypeDto = {
    name: string;
    description: string;
    isUniquePerContract: boolean;
    isInScrumByDefault: boolean;
    contractTypeId: number;
    folderNumber: string;
    isDefault: boolean;
    /** Nazwa i opis kamienia zakładanego automatycznie; puste = weź z typu. */
    templateName: string;
    templateDescription: string;
};

export type NewCaseTypeDto = {
    milestoneTypeId: number;
    name: string;
    description: string;
    folderNumber: string;
    isDefault: boolean;
    isUniquePerMilestone: boolean;
    isInScrumByDefault: boolean;
    isSubCaseOnly: boolean;
    /** Typy spraw, pod którymi ten typ może wystąpić jako podsprawa. */
    parentCaseTypeIds: number[];
    /** Nazwa i opis sprawy zakładanej automatycznie; puste = weź z typu. */
    templateName: string;
    templateDescription: string;
    /** Zadania zakładane razem ze sprawą. */
    taskTemplates: { name: string; description: string; status: string }[];
};

/**
 * Walidacja dodawania typów z panelu.
 * Rzuca BadRequestError (400), a nie zwykłego Error - ten poszedłby jako 500
 * i wygenerował mail-raport awarii przy każdej literówce użytkownika.
 */
export default class TypesTreeValidator {
    static validateNewMilestoneType(dto: any): NewMilestoneTypeDto {
        if (!dto || typeof dto !== 'object')
            throw new BadRequestError('Brak danych typu kamienia milowego.');

        return {
            name: this.requireText(dto.name, 'Nazwa', 80),
            description: this.optionalText(dto.description, 'Opis', 250),
            isUniquePerContract: !!dto.isUniquePerContract,
            isInScrumByDefault: !!dto.isInScrumByDefault,
            // Szablon wisi na TYPIE kamienia, a flaga „domyślny” na krawędzi
            // z typem umowy - nazwa jest więc wspólna dla wszystkich typów umów.
            templateName: this.optionalText(dto.templateName, 'Nazwa kamienia', 150),
            templateDescription: this.optionalText(
                dto.templateDescription,
                'Opis kamienia',
                300
            ),
            contractTypeId: this.requireId(dto.contractTypeId, 'typu umowy'),
            // Kolumna FolderNumber to CHAR(2) - dłuższa wartość zostałaby obcięta po cichu.
            folderNumber: this.requireText(dto.folderNumber, 'Numer folderu', 2),
            isDefault: !!dto.isDefault,
        };
    }

    static validateNewCaseType(dto: any): NewCaseTypeDto {
        if (!dto || typeof dto !== 'object')
            throw new BadRequestError('Brak danych typu sprawy.');

        const isSubCaseOnly = !!dto.isSubCaseOnly;
        const parentCaseTypeIds = this.parseIdList(
            dto.parentCaseTypeIds,
            'spraw nadrzędnych'
        );

        // Typ „wyłącznie jako podsprawa” bez wskazanego rodzica byłby niewidoczny:
        // nie pojawia się przy zakładaniu zwykłej sprawy, a bez powiązania nie ma
        // też pod czym wystąpić. Nie pozwalamy zapisać takiego stanu.
        if (isSubCaseOnly && parentCaseTypeIds.length === 0)
            throw new BadRequestError(
                'Typ oznaczony jako "wyłącznie podsprawa" musi mieć wskazaną co najmniej ' +
                    'jedną sprawę nadrzędną - inaczej nie dałoby się go nigdzie użyć.'
            );

        return {
            milestoneTypeId: this.requireId(dto.milestoneTypeId, 'kamienia milowego'),
            name: this.requireText(dto.name, 'Nazwa', 80),
            description: this.optionalText(dto.description, 'Opis', 250),
            folderNumber: this.requireText(dto.folderNumber, 'Numer folderu', 8),
            isDefault: !!dto.isDefault,
            isUniquePerMilestone: !!dto.isUniquePerMilestone,
            isInScrumByDefault: !!dto.isInScrumByDefault,
            isSubCaseOnly,
            parentCaseTypeIds,
            templateName: this.optionalText(dto.templateName, 'Nazwa sprawy', 160),
            templateDescription: this.optionalText(
                dto.templateDescription,
                'Opis sprawy',
                300
            ),
            taskTemplates: this.parseTaskTemplates(dto.taskTemplates),
        };
    }

    /** Zadania startowe z formularza. Pozycje bez nazwy pomijamy - to puste wiersze. */
    private static parseTaskTemplates(
        value: any
    ): { name: string; description: string; status: string }[] {
        if (value === undefined || value === null || value === '') return [];
        const asArray = Array.isArray(value) ? value : [value];

        return asArray
            .filter((item) => item && typeof item === 'object')
            .map((item) => ({
                name: this.requireText(item.name, 'Nazwa zadania', 150),
                description: this.optionalText(
                    item.description,
                    'Opis zadania',
                    300
                ),
                status: this.optionalText(item.status, 'Status zadania', 20),
            }));
    }

    /**
     * Lista identyfikatorów z formularza; puste i powtórzone wartości odpadają.
     *
     * Pojedynczą wartość przyjmujemy tak samo jak tablicę. Tools.parseObjectsJSON
     * woła JSON.parse na KAŻDYM polu ciała żądania, a jednoelementowa tablica [7]
     * zostaje przy tym zamieniona na tekst "7", czyli po sparsowaniu na liczbę.
     * Przy dwóch elementach "8,10" nie jest poprawnym JSON-em i tablica przeżywa -
     * dlatego bez tej tolerancji błąd pojawiał się WYŁĄCZNIE przy jednym wyborze.
     */
    private static parseIdList(value: any, label: string): number[] {
        if (value === undefined || value === null || value === '') return [];

        const asArray = Array.isArray(value) ? value : [value];
        if (asArray.some((item) => typeof item === 'object' && item !== null))
            throw new BadRequestError(`Lista ${label} ma nieprawidłowy format.`);

        const ids = asArray.map((item) => Number(item));
        if (ids.some((id) => !Number.isInteger(id) || id <= 0))
            throw new BadRequestError(`Lista ${label} zawiera nieprawidłowy numer.`);

        return [...new Set(ids)];
    }

    /**
     * Edycja typu kamienia wraz z jego powiązaniem z wybranym typem umowy.
     * `currentName` to nazwa z bazy - potrzebna, żeby odróżnić zmianę nazwy
     * od zapisu bez jej ruszania.
     */
    static validateEditMilestoneType(
        dto: any,
        currentName: string
    ): NewMilestoneTypeDto & { id: number } {
        const id = this.requireId(dto?.id, 'typu kamienia');
        const payload = this.validateNewMilestoneType(dto);

        if (payload.name !== currentName && isMilestoneTypeNameLocked(id))
            throw new BadRequestError(
                `Nazwy typu "${currentName}" nie można zmienić - kod odwołuje się do niego wprost. ` +
                    'Zmienić można opis, numer folderu i pozostałe ustawienia.'
            );

        return { ...payload, id };
    }

    /**
     * Edycja typu sprawy.
     *
     * Kamienia NIE da się tu zmienić celowo: przeniesienie typu pod inny kamień
     * zostawiłoby istniejące sprawy przypięte do typu, który wisi już gdzie indziej.
     */
    static validateEditCaseType(
        dto: any,
        current: { name: string; milestoneTypeId: number | null }
    ): Omit<NewCaseTypeDto, 'milestoneTypeId'> & { id: number } {
        const id = this.requireId(dto?.id, 'typu sprawy');
        const payload = this.validateNewCaseType({
            ...dto,
            // Kamień bierzemy z bazy, nie z żądania - patrz komentarz wyżej.
            milestoneTypeId: current.milestoneTypeId ?? 1,
        });

        if (payload.name !== current.name && isCaseTypeNameLocked(id, current.name))
            throw new BadRequestError(
                `Nazwy typu "${current.name}" nie można zmienić - kod rozpoznaje go po niej. ` +
                    'Zmienić można opis, numer folderu i pozostałe ustawienia.'
            );

        // Baza nie ma ograniczenia CHECK na tej parze, więc wiersz (X, X) wszedłby
        // bez protestu. Typ będący własną podsprawą to zapętlenie: przy zakładaniu
        // sprawy dałoby się schodzić nim w nieskończoność.
        if (payload.parentCaseTypeIds.includes(id))
            throw new BadRequestError(
                'Typ sprawy nie może być podsprawą samego siebie.'
            );

        const { milestoneTypeId, ...rest } = payload;
        return { ...rest, id };
    }

    static requireId(value: any, label: string): number {
        const id = Number(value);
        if (!Number.isInteger(id) || id <= 0)
            throw new BadRequestError(`Nieprawidłowy identyfikator ${label}.`);
        return id;
    }

    private static requireText(value: any, label: string, maxLength: number): string {
        // Liczby dopuszczamy celowo. Tools.parseObjectsJSON woła JSON.parse na KAŻDEJ
        // wartości ciała żądania, więc numer folderu "9" dociera tu jako liczba 9,
        // a "09" jako tekst. Bez tej konwersji jednocyfrowe numery były odrzucane
        // komunikatem o brakującym polu.
        if (typeof value === 'number' && Number.isFinite(value)) value = String(value);
        if (typeof value !== 'string' || value.trim().length === 0)
            throw new BadRequestError(`Pole "${label}" jest wymagane.`);
        const trimmed = value.trim();
        if (trimmed.length > maxLength)
            throw new BadRequestError(
                `Pole "${label}" może mieć najwyżej ${maxLength} znaków.`
            );
        return trimmed;
    }

    private static optionalText(value: any, label: string, maxLength: number): string {
        if (value === undefined || value === null) return '';
        if (typeof value !== 'string')
            throw new BadRequestError(`Pole "${label}" musi być tekstem.`);
        const trimmed = value.trim();
        if (trimmed.length > maxLength)
            throw new BadRequestError(
                `Pole "${label}" może mieć najwyżej ${maxLength} znaków.`
            );
        return trimmed;
    }
}
