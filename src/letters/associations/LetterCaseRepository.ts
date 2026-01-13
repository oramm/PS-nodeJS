import BaseRepository from '../../repositories/BaseRepository';
import LetterCase from './LetterCase';
import Case from '../../contracts/milestones/cases/Case';
import ContractOur from '../../contracts/ContractOur';
import ContractOther from '../../contracts/ContractOther';
import ToolsDb from '../../tools/ToolsDb';
import { OfferData } from '../../types/types';
import mysql from 'mysql2/promise';

export type LetterCaseSearchParams = {
    projectId?: string;
    contractId?: number;
    offerId?: number;
};

export default class LetterCaseRepository extends BaseRepository<LetterCase> {
    constructor() {
        super('Letters_Cases');
    }

    /**
     * Mapuje wiersz z bazy danych na instancję LetterCase
     */
    protected mapRowToModel(row: any): LetterCase {
        const _contract = this.makeContract(row);
        const _offer = this.makeOfferObject(row);

        return new LetterCase({
            _letter: {
                id: row.LetterId,
                number: row.Number,
                description: row.Description,
                creationDate: row.CreationDate,
                registrationDate: row.RegistrationDate,
                gdDocumentId: row.GdDocumentId,
                gdFolderId: row.GdFolderId,
            },
            _case: new Case({
                id: row.CaseId,
                name: row.CaseName,
                number: row.CaseNumber,
                description: row.CaseDescription,
                gdFolderId: row.CaseGdFolderId,
                _type: {
                    id: row.CaseTypeId,
                    name: row.CaseTypeName,
                    isDefault: row.IsDefault,
                    isUniquePerMilestone: row.isUniquePerMilestone,
                    milestoneTypeId: row.MilestoneTypeId,
                    folderNumber: row.CaseTypeFolderNumber,
                },
                _parent: {
                    id: row.MilestoneId,
                    name: row.MilestoneName,
                    _type: {
                        id: row.MilestoneTypeId,
                        name: row.MilestoneTypeName,
                        _folderNumber: row.MilestoneTypeFolderNumber,
                        isUniquePerContract:
                            row.MilestoneTypeIsUniquePerContract,
                    },
                    _contract,
                    _offer,
                    _dates: [],
                },
            }),
        });
    }

    /**
     * Wyszukuje asocjacje Letter-Case według parametrów
     */
    async find(
        searchParams: LetterCaseSearchParams = {}
    ): Promise<LetterCase[]> {
        const whereConditions = this.makeAndConditions(searchParams);

        const sql = `SELECT  
                Letters_Cases.LetterId, 
                Letters_Cases.CaseId, 
                Letters.Number, 
                Letters.Description, 
                Letters.CreationDate, 
                Letters.RegistrationDate, 
                Letters.GdDocumentId, 
                Letters.GdFolderId, 
                Letters.LastUpdated, 
                Cases.Name AS CaseName, 
                Cases.Number AS CaseNumber, 
                Cases.Description AS CaseDescription, 
                Cases.GdFolderId AS CaseGdFolderId, 
                CaseTypes.Id AS CaseTypeId, 
                CaseTypes.Name AS CaseTypeName, 
                CaseTypes.IsDefault, 
                CaseTypes.IsUniquePerMilestone, 
                CaseTypes.MilestoneTypeId, 
                CaseTypes.FolderNumber AS CaseTypeFolderNumber, 
                Milestones.Id AS MilestoneId, 
                Milestones.Name AS MilestoneName, 
                MilestoneTypes.Id AS MilestoneTypeId, 
                MilestoneTypes.Name AS MilestoneTypeName,
                MilestoneTypes.IsUniquePerContract AS MilestoneTypeIsUniquePerContract,
                COALESCE(MilestoneTypes_ContractTypes.FolderNumber, MilestoneTypes_Offers.FolderNumber) AS MilestoneTypeFolderNumber,
                OurContractsData.OurId AS ContractOurId, 
                ContractTypes.Id AS ContractTypeId, 
                ContractTypes.Name AS ContractTypeName, 
                ContractTypes.IsOur AS ContractTypeIsOur, 
                ContractTypes.Description AS ContractTypeDescription,
                Contracts.Id AS ContractId, 
                Contracts.Number AS ContractNumber, 
                Contracts.Name AS ContractName,
                Offers.Id AS OfferId,
                Offers.Alias AS OfferAlias,
                Offers.IsOur AS OfferIsOur,
                Offers.Form AS OfferForm,
                Offers.BidProcedure AS OfferBidProcedure,
                Offers.EmployerName AS OfferEmployerName,
                Offers.GdFolderId AS OfferGdFolderId,
                Cities.Id AS OfferCityId,
                Cities.Name AS CityName,
                Cities.Code AS CityCode
            FROM Letters_Cases
            JOIN Letters ON Letters_Cases.LetterId = Letters.Id
            JOIN Cases ON Letters_Cases.CaseId = Cases.Id
            JOIN CaseTypes ON Cases.TypeId = CaseTypes.Id
            JOIN Milestones ON Cases.MilestoneId=Milestones.Id
            JOIN MilestoneTypes ON Milestones.TypeId=MilestoneTypes.Id
            LEFT JOIN Contracts ON Milestones.ContractId=Contracts.Id
            LEFT JOIN ContractTypes ON ContractTypes.Id = Contracts.TypeId
            LEFT JOIN OurContractsData ON OurContractsData.Id=Contracts.Id
            LEFT JOIN Offers ON Milestones.OfferId = Offers.Id
            LEFT JOIN Cities ON Offers.CityId=Cities.Id
            LEFT JOIN MilestoneTypes_ContractTypes 
                ON  MilestoneTypes_ContractTypes.MilestoneTypeId=Milestones.TypeId 
                AND MilestoneTypes_ContractTypes.ContractTypeId=Contracts.TypeId
            LEFT JOIN MilestoneTypes_Offers ON MilestoneTypes_Offers.MilestoneTypeId=Milestones.TypeId
            WHERE ${whereConditions}
            ORDER BY Letters_Cases.LetterId, Cases.Name`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);

        return result.map((row) => this.mapRowToModel(row));
    }

    /**
     * Buduje warunki WHERE (AND) dla zapytań
     */
    private makeAndConditions(searchParams: LetterCaseSearchParams): string {
        const whereClauses: string[] = [];

        if (searchParams.projectId) {
            whereClauses.push(
                mysql.format('Contracts.ProjectOurId = ?', [
                    searchParams.projectId,
                ])
            );
        }

        if (searchParams.contractId) {
            whereClauses.push(
                mysql.format('Contracts.Id = ?', [searchParams.contractId])
            );
        }

        if (searchParams.offerId) {
            whereClauses.push(
                mysql.format('Offers.Id = ?', [searchParams.offerId])
            );
        }

        return whereClauses.length > 0 ? whereClauses.join(' AND ') : '1';
    }

    /**
     * Pomocnicza metoda do tworzenia obiektu Contract
     */
    private makeContract(row: any) {
        if (!row.ContractId) return;
        const contractInitParams = {
            id: row.ContractId,
            ourId: row.ContractOurId,
            number: row.ContractNumber,
            name: ToolsDb.sqlToString(row.ContractName),
            _type: {
                id: row.ContractTypeId,
                name: row.ContractTypeName,
                isOur: row.ContractTypeIsOur,
                description: ToolsDb.sqlToString(row.ContractTypeDescription),
            },
        };
        const _contract = contractInitParams.ourId
            ? new ContractOur(contractInitParams)
            : new ContractOther(contractInitParams);
        return _contract;
    }

    /**
     * Pomocnicza metoda do tworzenia obiektu Offer
     */
    private makeOfferObject(row: any) {
        if (!row.OfferId) return;
        const offerInitParam = <OfferData>{
            id: row.OfferId,
            alias: row.OfferAlias,
            isOur: row.OfferIsOur,
            form: row.OfferForm,
            bidProcedure: row.OfferBidProcedure,
            employerName: row.OfferEmployerName,
            gdFolderId: row.OfferGdFolderId,
            _city: {
                id: row.OfferCityId,
                name: row.CityName,
                code: row.CityCode,
            },
        };
        return offerInitParam;
    }
}
