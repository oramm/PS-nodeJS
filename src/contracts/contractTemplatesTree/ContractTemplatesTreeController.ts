import ContractTemplatesTreeRepository, {
    CaseTypeRow,
    MilestoneTypeRow,
} from './ContractTemplatesTreeRepository';
import CaseType from '../milestones/cases/caseTypes/CaseType';
import MilestoneType from '../milestones/milestoneTypes/MilestoneType';
import ContractTypesController from '../contractTypes/ContractTypesController';
import { MilestoneTypeData } from '../../types/types';
import {
    optionalFoldersForContractType,
    OptionalContractFolderKey,
} from '../contractFolders/optionalContractFolders';

/**
 * Controller drzewa struktury umowy.
 *
 * Obsługuje dwie strony tej samej wiedzy:
 *  - findTree()         - DTO dla formularza rejestracji umowy,
 *  - resolveSelection() - hydratacja wyboru użytkownika do modeli, których
 *                         potrzebuje ścieżka tworzenia kamieni i spraw.
 *
 * Bezstanowy - stąd statyczne repozytorium zamiast singletona z getInstance()
 * (wzorem ContractsWithChildrenController).
 */

export type CaseTypeTreeNode = {
    caseTypeId: number;
    folderNumber: string;
    typeName: string;
    templateName: string;
    isUniquePerMilestone: boolean;
    hasTemplate: boolean;
    isDefault: boolean;
    isCheckedByDefault: boolean;
};

export type MilestoneTypeTreeNode = {
    milestoneTypeId: number;
    folderNumber: string;
    typeName: string;
    templateName: string;
    isUniquePerContract: boolean;
    hasTemplate: boolean;
    isDefault: boolean;
    isCheckedByDefault: boolean;
    caseTypes: CaseTypeTreeNode[];
};

export type OptionalFolderNode = {
    key: OptionalContractFolderKey;
    name: string;
    isDefault: boolean;
};

export type ContractTemplatesTree = {
    milestoneTypes: MilestoneTypeTreeNode[];
    optionalFolders: OptionalFolderNode[];
};

/** Wybór użytkownika - operuje na TYPACH, nie na szablonach. */
export type MilestoneSelectionItem = {
    milestoneTypeId: number;
    caseTypeIds: number[];
};

/** Typ sprawy gotowy do zbudowania obiektu Case. */
export type ResolvedCaseType = {
    caseType: CaseType;
    name: string;
    description: string;
};

/** Typ kamienia gotowy do zbudowania obiektu Milestone. */
export type ResolvedMilestoneType = {
    milestoneType: MilestoneType;
    name: string;
    description: string;
    caseTypes: ResolvedCaseType[];
};

/**
 * Czy pozycja powstaje dziś automatycznie: musi być oznaczona jako domyślna
 * ORAZ mieć szablon, bo dotychczasowa ścieżka joinuje tabelę szablonów i bez
 * wiersza w niej nic nie tworzy. To jest definicja „zaznaczone na starcie" -
 * jedno miejsce dla kamieni i spraw, żeby obie warstwy nie mogły się rozjechać.
 */
const isCreatedByLegacyDefault = (row: {
    isDefault: boolean;
    templateId: number | null;
}) => row.isDefault && row.templateId !== null;

export default class ContractTemplatesTreeController {
    private static repository = new ContractTemplatesTreeRepository();

    // ==================== READ ====================

    /** Pełne drzewo struktury dostępnej dla typu umowy. */
    static async findTree(
        contractTypeId: number
    ): Promise<ContractTemplatesTree> {
        const [contractType] = await ContractTypesController.find([
            { id: contractTypeId },
        ]);
        if (!contractType)
            throw new Error(`Nie znaleziono typu umowy ${contractTypeId}`);

        const { milestoneTypeRows, caseTypesByMilestoneType } =
            await this.loadTypes(contractTypeId);

        return {
            milestoneTypes: milestoneTypeRows.map((row) => ({
                milestoneTypeId: row.milestoneTypeId,
                folderNumber: row.folderNumber,
                typeName: row.typeName,
                templateName: row.templateName,
                isUniquePerContract: row.isUniquePerContract,
                hasTemplate: row.templateId !== null,
                isDefault: row.isDefault,
                isCheckedByDefault: isCreatedByLegacyDefault(row),
                caseTypes: (
                    caseTypesByMilestoneType.get(row.milestoneTypeId) ?? []
                ).map((caseRow) => ({
                    caseTypeId: caseRow.caseTypeId,
                    folderNumber: caseRow.folderNumber,
                    typeName: caseRow.typeName,
                    templateName: caseRow.templateName,
                    isUniquePerMilestone: caseRow.isUniquePerMilestone,
                    hasTemplate: caseRow.templateId !== null,
                    isDefault: caseRow.isDefault,
                    isCheckedByDefault: isCreatedByLegacyDefault(caseRow),
                })),
            })),
            optionalFolders: optionalFoldersForContractType(
                !!contractType.isOur
            ).map(({ key, name, isDefault }) => ({ key, name, isDefault })),
        };
    }

    // ==================== WRITE PATH ====================

    /**
     * Zamienia wybór z formularza na modele gotowe do utworzenia kamieni i spraw.
     * Pozycje spoza typu umowy są odrzucane; gdy nie zostanie żadna - rzuca,
     * bo znaczy to, że klient przysłał wybór dla innego typu umowy i cicha
     * podmiana struktury byłaby gorsza niż błąd.
     */
    static async resolveSelection(
        contractTypeId: number,
        selection: MilestoneSelectionItem[]
    ): Promise<ResolvedMilestoneType[]> {
        const { milestoneTypeRows, caseTypesByMilestoneType } =
            await this.loadTypes(contractTypeId);

        const milestoneTypeRowsById = new Map(
            milestoneTypeRows.map((row) => [row.milestoneTypeId, row])
        );

        const resolved: ResolvedMilestoneType[] = [];

        for (const item of selection) {
            const milestoneTypeRow = milestoneTypeRowsById.get(
                item.milestoneTypeId
            );
            if (!milestoneTypeRow) continue;

            const selectedCaseTypeIds = new Set(item.caseTypeIds);
            const milestoneType = this.toMilestoneType(milestoneTypeRow);

            resolved.push({
                milestoneType,
                name: milestoneTypeRow.templateName,
                description: milestoneTypeRow.templateDescription,
                caseTypes: (
                    caseTypesByMilestoneType.get(item.milestoneTypeId) ?? []
                )
                    .filter((caseRow) =>
                        selectedCaseTypeIds.has(caseRow.caseTypeId)
                    )
                    .map((caseRow) => ({
                        caseType: this.toCaseType(caseRow, milestoneType),
                        name: caseRow.templateName,
                        description: caseRow.templateDescription,
                    })),
            });
        }

        if (!resolved.length) {
            throw new Error(
                'Wybrane kamienie milowe nie pasują do typu umowy - nie utworzono struktury'
            );
        }

        return resolved;
    }

    /**
     * Odsiewa wybór przysłany przez klienta.
     *
     * Nie jest to sama walidacja kształtu: scalanie powtórzonego typu kamienia
     * chroni przed naruszeniem UNIQUE (TypeId, Name, ContractId) na Milestones,
     * więc reguła mieszka przy domenie, a nie w Routerze.
     *
     * Zwraca undefined dla braku pola, złego kształtu i pustej listy - wszystkie
     * te przypadki oznaczają ścieżkę domyślną, czyli zachowanie sprzed drzewa.
     * UI nie potrafi przysłać pustej listy (walidacja wymaga min. jednego
     * kamienia), więc pusta lista to błąd klienta, a utworzenie domyślnej
     * struktury jest lepsze niż umowa bez kamieni.
     */
    static parseSelection(raw: unknown): MilestoneSelectionItem[] | undefined {
        if (!Array.isArray(raw)) return undefined;

        // Number(null) i Number('') to 0, więc samo Number.isInteger
        // przepuściłoby null, '' i false jako poprawne id. Id są dodatnie.
        const toId = (value: unknown) => {
            const id = Number(value);
            return Number.isInteger(id) && id > 0 ? id : undefined;
        };

        const byMilestoneType = new Map<number, MilestoneSelectionItem>();
        for (const item of raw as any[]) {
            const milestoneTypeId = toId(item?.milestoneTypeId);
            if (!milestoneTypeId) continue;

            const caseTypeIds = Array.isArray(item?.caseTypeIds)
                ? (item.caseTypeIds.map(toId).filter(Boolean) as number[])
                : [];
            const existing = byMilestoneType.get(milestoneTypeId);

            byMilestoneType.set(milestoneTypeId, {
                milestoneTypeId,
                caseTypeIds: [
                    ...new Set([
                        ...(existing?.caseTypeIds ?? []),
                        ...caseTypeIds,
                    ]),
                ],
            });
        }

        const parsed = [...byMilestoneType.values()];
        if (!parsed.length) {
            console.warn(
                '[contractTemplatesTree] wybór pusty lub nieczytelny - tworzę strukturę domyślną'
            );
            return undefined;
        }
        return parsed;
    }

    // ==================== POMOCNICZE ====================

    /**
     * Wspólne wczytanie dla obu ścieżek. Jeden loader, żeby drzewo pokazane
     * użytkownikowi i drzewo rozwiązywane przy zapisie nie mogły się rozjechać.
     */
    private static async loadTypes(contractTypeId: number) {
        const milestoneTypeRows =
            await this.repository.findMilestoneTypes(contractTypeId);
        const caseTypeRows = await this.repository.findCaseTypes(
            milestoneTypeRows.map((row) => row.milestoneTypeId)
        );

        const caseTypesByMilestoneType = new Map<number, CaseTypeRow[]>();
        for (const row of caseTypeRows) {
            const bucket = caseTypesByMilestoneType.get(row.milestoneTypeId) ?? [];
            bucket.push(row);
            caseTypesByMilestoneType.set(row.milestoneTypeId, bucket);
        }

        return { milestoneTypeRows, caseTypesByMilestoneType };
    }

    private static toMilestoneType(row: MilestoneTypeRow): MilestoneType {
        return new MilestoneType({
            id: row.milestoneTypeId,
            name: row.typeName,
            _folderNumber: row.folderNumber,
            _isDefault: row.isDefault,
            isUniquePerContract: row.isUniquePerContract,
        } as MilestoneTypeData);
    }

    /**
     * UWAGA: celowo bez _processes i _allowedSubCaseTypeIds. Dotychczasowa
     * ścieżka (CaseTemplateRepository.mapRowToModel) też ich nie ustawia, więc
     * wypełnienie ich tutaj włączyłoby tworzenie instancji procesów wyłącznie
     * dla spraw wybranych w drzewie - i to przy zapytaniu na proces na sprawę,
     * w otwartej transakcji. Obie ścieżki mają robić to samo.
     */
    private static toCaseType(
        row: CaseTypeRow,
        milestoneType: MilestoneType
    ): CaseType {
        return new CaseType({
            id: row.caseTypeId,
            name: row.typeName,
            folderNumber: row.folderNumber,
            description: row.description,
            isDefault: row.isDefault,
            isUniquePerMilestone: row.isUniquePerMilestone,
            isSubCaseOnly: row.isSubCaseOnly,
            _milestoneType: milestoneType,
        });
    }
}
