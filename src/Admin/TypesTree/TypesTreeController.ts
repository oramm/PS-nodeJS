import ToolsDb from '../../tools/ToolsDb';
import { BadRequestError } from '../../persons/projectAssignments/ProjectScopeGuard';
import CaseType from '../../contracts/milestones/cases/caseTypes/CaseType';
import CaseTypesController from '../../contracts/milestones/cases/caseTypes/CaseTypesController';
import MilestoneType from '../../contracts/milestones/milestoneTypes/MilestoneType';
import MilestoneTypesController from '../../contracts/milestones/milestoneTypes/MilestoneTypesController';
import TypesTreeValidator from './TypesTreeValidator';
import TypesTreeRepository, {
    TypesTreeCaseType,
    TypesTreeContractType,
    TypesTreeContractTypeMilestoneType,
    TypesTreeMilestoneType,
    TypesTreeOfferMilestoneType,
    TypesTreeSubCaseLink,
} from './TypesTreeRepository';

export type TypesTreeDto = {
    contractTypes: TypesTreeContractType[];
    milestoneTypes: TypesTreeMilestoneType[];
    contractTypeMilestoneTypes: TypesTreeContractTypeMilestoneType[];
    offerMilestoneTypes: TypesTreeOfferMilestoneType[];
    caseTypes: TypesTreeCaseType[];
    subCaseTypeLinks: TypesTreeSubCaseLink[];
};

/**
 * Controller widoku hierarchii typów.
 *
 * ZWRACA GRAF ZNORMALIZOWANY (słowniki + krawędzie), NIE zagnieżdżone drzewo.
 * Trzy powody, wszystkie wynikają z modelu danych:
 *
 * 1. Numer folderu i flaga „domyślny” należą do PARY (typ kamienia, typ umowy).
 *    W zagnieżdżonym drzewie ten sam typ kamienia powtarzałby się przy każdym
 *    typie umowy z inną wartością - edycja nazwy w jednym miejscu rozjechałaby resztę.
 * 2. Podsprawa może mieć kilku rodziców (relacja M:N), więc to graf, nie drzewo.
 * 3. Panel EDYTUJE węzły, a do tego potrzebuje jednej instancji węzła na identyfikator.
 *
 * Frontend i tak konsumuje węzły i krawędzie osobno, żeby narysować diagram.
 *
 * Bez paginacji i filtrów - cały słownik to około 180 wierszy.
 */
export default class TypesTreeController {
    private static repository = new TypesTreeRepository();

    static async getTree(): Promise<TypesTreeDto> {
        const [
            contractTypes,
            milestoneTypes,
            contractTypeMilestoneTypes,
            offerMilestoneTypes,
            caseTypes,
            subCaseTypeLinks,
        ] = await Promise.all([
            this.repository.findContractTypes(),
            this.repository.findMilestoneTypes(),
            this.repository.findContractTypeMilestoneTypes(),
            this.repository.findOfferMilestoneTypes(),
            this.repository.findCaseTypes(),
            this.repository.findSubCaseTypeLinks(),
        ]);

        return {
            contractTypes,
            milestoneTypes,
            contractTypeMilestoneTypes,
            offerMilestoneTypes,
            caseTypes,
            subCaseTypeLinks,
        };
    }

    /**
     * Dodaje typ kamienia milowego wraz z powiązaniem z wybranym typem umowy.
     *
     * Jedna operacja w transakcji, bo sam typ bez powiązania byłby niewidoczny
     * w drzewie i nie dałoby się go użyć - numer folderu należy do powiązania.
     * Transakcją zarządza kontroler, nie repozytorium.
     */
    static async addMilestoneTypeFromDto(dto: any): Promise<TypesTreeDto> {
        const payload = TypesTreeValidator.validateNewMilestoneType(dto);

        await ToolsDb.transaction(async (conn) => {
            const milestoneType = new MilestoneType({
                name: payload.name,
                description: payload.description,
                isUniquePerContract: payload.isUniquePerContract,
                isInScrumByDefault: payload.isInScrumByDefault,
            });
            await MilestoneTypesController.add(milestoneType);

            if (!milestoneType.id)
                throw new Error('Nie udało się odczytać numeru nowego typu kamienia.');

            await this.repository.addContractTypeMilestoneTypeInDb(
                {
                    milestoneTypeId: Number(milestoneType.id),
                    contractTypeId: payload.contractTypeId,
                    folderNumber: payload.folderNumber,
                    isDefault: payload.isDefault,
                },
                conn
            );
        });

        return await this.getTree();
    }

    /**
     * Edytuje typ kamienia oraz numer folderu i „domyślny” na jego powiązaniu
     * z wybranym typem umowy. Jedna operacja w transakcji - te dwa zapisy opisują
     * jedną zmianę widzianą przez użytkownika.
     */
    static async editMilestoneTypeFromDto(dto: any): Promise<TypesTreeDto> {
        const all = await this.repository.findMilestoneTypes();
        const current = all.find((type) => type.id === Number(dto?.id));
        if (!current)
            throw new BadRequestError('Typ kamienia o podanym numerze nie istnieje.');

        const payload = TypesTreeValidator.validateEditMilestoneType(dto, current.name);

        await ToolsDb.transaction(async (conn) => {
            const milestoneType = new MilestoneType({
                id: payload.id,
                name: payload.name,
                description: payload.description,
                isUniquePerContract: payload.isUniquePerContract,
                isInScrumByDefault: payload.isInScrumByDefault,
            });
            await MilestoneTypesController.edit(milestoneType);

            await this.repository.updateContractTypeMilestoneTypeInDb(
                {
                    milestoneTypeId: payload.id,
                    contractTypeId: payload.contractTypeId,
                    folderNumber: payload.folderNumber,
                    isDefault: payload.isDefault,
                },
                conn
            );
        });

        return await this.getTree();
    }

    /** Edytuje typ sprawy. Kamienia nie da się zmienić - patrz walidator. */
    static async editCaseTypeFromDto(dto: any): Promise<TypesTreeDto> {
        const all = await this.repository.findCaseTypes();
        const current = all.find((type) => type.id === Number(dto?.id));
        if (!current)
            throw new BadRequestError('Typ sprawy o podanym numerze nie istnieje.');

        const payload = TypesTreeValidator.validateEditCaseType(dto, {
            name: current.name,
            milestoneTypeId: current.milestoneTypeId,
        });

        const caseType = new CaseType({
            id: payload.id,
            name: payload.name,
            description: payload.description,
            folderNumber: payload.folderNumber,
            isDefault: payload.isDefault,
            isUniquePerMilestone: payload.isUniquePerMilestone,
            isInScrumByDefault: payload.isInScrumByDefault,
            isSubCaseOnly: payload.isSubCaseOnly,
            _milestoneType: { id: current.milestoneTypeId },
        });
        await CaseTypesController.edit(caseType);
        await this.repository.replaceSubCaseTypeLinksInDb(
            payload.id,
            payload.parentCaseTypeIds
        );

        return await this.getTree();
    }

    /** Dodaje typ sprawy pod wskazanym typem kamienia milowego. */
    static async addCaseTypeFromDto(dto: any): Promise<TypesTreeDto> {
        const payload = TypesTreeValidator.validateNewCaseType(dto);

        const caseType = new CaseType({
            name: payload.name,
            description: payload.description,
            folderNumber: payload.folderNumber,
            isDefault: payload.isDefault,
            isUniquePerMilestone: payload.isUniquePerMilestone,
            isInScrumByDefault: payload.isInScrumByDefault,
            isSubCaseOnly: payload.isSubCaseOnly,
            _milestoneType: { id: payload.milestoneTypeId },
        });

        await CaseTypesController.add(caseType);

        // Powiązania z rodzicami dopiero po wstawieniu - wcześniej nie ma numeru,
        // do którego można je przypiąć. Walidacja poszła wcześniej, więc typ nie
        // zostanie zapisany z listą, której baza by nie przyjęła.
        if (caseType.id)
            await this.repository.replaceSubCaseTypeLinksInDb(
                Number(caseType.id),
                payload.parentCaseTypeIds
            );

        return await this.getTree();
    }
}
