import ExternalOffer from '../../offers/ExternalOffer';
import ContractOther from '../../contracts/ContractOther';
import ContractOur from '../../contracts/ContractOur';
import Case from '../../contracts/milestones/cases/Case';
import ToolsDb from '../../tools/ToolsDb';
import { ContractData, OfferData, ProjectData } from '../../types/types';
import LetterCase from './LetterCase';
import mysql from 'mysql2/promise';
import OurOffer from '../../offers/OurOffer';

export type LetterCaseSearchParams = {
    _project?: ProjectData;
    projectId?: string;
    contractId?: number;
    _contract?: ContractData;
    offerId?: number;
    _offer?: OfferData;
};

export default class LetterCaseAssociationsController {
    static async getLetterCaseAssociationsList(
        searchParams: LetterCaseSearchParams = {}
    ) {
        const projectId =
            searchParams._project?.ourId || searchParams.projectId;

        const contractId =
            searchParams._contract?.id || searchParams.contractId;
        const offerId = searchParams._offer?.id || searchParams.offerId;

        const projectCondition = projectId
            ? mysql.format('Contracts.ProjectOurId = ?', [projectId])
            : '1';

        const contractCondition = contractId
            ? mysql.format('Contracts.Id = ?', [contractId])
            : '1';

        const offerCondition = offerId
            ? mysql.format('Offers.Id = ?', [offerId])
            : '1';

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
            WHERE   ${projectCondition} 
                AND ${contractCondition}
                AND ${offerCondition}
            ORDER BY Letters_Cases.LetterId, Cases.Name`;
        console.log(sql);
        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processLetterCaseAssociationsResult(result);
    }

    static processLetterCaseAssociationsResult(result: any[]) {
        let newResult: LetterCase[] = [];

        for (const row of result) {
            const _contract = this.makeContract(row);
            const _offer = this.makeOfferObject(row);
            const item = new LetterCase({
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
                        },
                        _contract,
                        _offer,
                    },
                }),
            });
            newResult.push(item);
        }
        return newResult;
    }

    private static makeContract(row: any) {
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

    private static makeOfferObject(row: any) {
        if (!row.OfferId) return;
        const offerInitParam = <OfferData>{
            id: row.OfferId,
            alias: row.OfferAlias,
            isOur: row.OfferIsOur,
            form: row.OfferForm,
            bidProcedure: row.OfferBidProcedure,
            employerName: row.OfferEmployerName,
            gdFolderId: row.GdFolderId,
            _city: {
                id: row.OfferCityId,
                name: row.CityName,
                code: row.CityCode,
            },
        };
        return offerInitParam;
    }
}
