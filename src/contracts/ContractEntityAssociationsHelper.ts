import mysql from 'mysql2/promise';
import Entity from '../entities/Entity';
import ToolsDb from '../tools/ToolsDb';

/**
 * Typ asocjacji Contract-Entity
 * Współdzielony między ContractRepository i ContractsWithChildrenRepository
 */
export type ContractEntityAssociation = {
    contractRole: 'CONTRACTOR' | 'ENGINEER' | 'EMPLOYER';
    _contract: {
        id: number;
        ourId?: string; // OurId z OurContractsData (jeśli kontrakt jest "our")
    };
    _entity: Entity;
};

/**
 * Helper dla operacji na asocjacjach Contract-Entity
 *
 * WZORZEC: Współdzielona logika między Repository (unikanie duplikacji)
 * ZGODNOŚĆ: Clean Architecture - brak cykli zależności
 *
 * Używany przez:
 * - ContractRepository
 * - ContractsWithChildrenRepository
 */
export default class ContractEntityAssociationsHelper {
    /**
     * Pobiera listę asocjacji Contract-Entity z bazy danych
     *
     * @param initParamObject - Parametry wyszukiwania (projectId, contractId, isArchived)
     * @returns Promise<ContractEntityAssociation[]> - Lista asocjacji z instancjami Entity (w tym ourId jeśli dostępny)
     *
     * UWAGA: Parametr isArchived jest ignorowany - asocjacje Entity-Contract są niezależne od statusu archiwizacji.
     * Filtrowanie po statusie kontraktu powinno być wykonane przez wywołującego na liście kontraktów.
     */
    static async getContractEntityAssociationsList(initParamObject: {
        projectId?: string;
        contractId?: number;
        isArchived?: boolean;
    }): Promise<ContractEntityAssociation[]> {
        const projectConditon =
            initParamObject && initParamObject.projectId
                ? mysql.format('Contracts.ProjectOurId = ?', [
                      initParamObject.projectId,
                  ])
                : '1';

        const contractConditon =
            initParamObject && initParamObject.contractId
                ? mysql.format('Contracts.Id = ?', [initParamObject.contractId])
                : '1';

        const sql = `SELECT
                Contracts_Entities.ContractId,
                Contracts_Entities.EntityId,
                Contracts_Entities.ContractRole,
                OurContractsData.OurId AS ContractOurId,
                Entities.Name,
                Entities.Address,
                Entities.TaxNumber,
                Entities.Www,
                Entities.Email,
                Entities.Phone
                        FROM Contracts_Entities
                        JOIN Contracts ON Contracts_Entities.ContractId = Contracts.Id
                        LEFT JOIN OurContractsData ON OurContractsData.Id = Contracts.Id
                        JOIN Entities ON Contracts_Entities.EntityId = Entities.Id
                        WHERE ${projectConditon} 
                        AND ${contractConditon}
                        ORDER BY Contracts_Entities.ContractRole, Entities.Name`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);

        return this.processContractEntityAssociations(result);
    }

    /**
     * Przetwarza surowe dane asocjacji na obiekty Entity
     *
     * @param result - Surowe wiersze z SQL query
     * @returns ContractEntityAssociation[] - Zmapowane asocjacje z instancjami Entity
     */
    static processContractEntityAssociations(
        result: any[]
    ): ContractEntityAssociation[] {
        const newResult: ContractEntityAssociation[] = [];

        for (const row of result) {
            const item: ContractEntityAssociation = {
                contractRole: row.ContractRole,
                _contract: {
                    id: row.ContractId,
                    ourId: row.ContractOurId || undefined,
                },
                _entity: new Entity({
                    id: row.EntityId,
                    name: row.Name,
                    address: row.Address,
                    taxNumber: row.TaxNumber,
                    www: row.Www,
                    email: row.Email,
                    phone: row.Phone,
                }),
            };

            newResult.push(item);
        }
        return newResult;
    }
}
