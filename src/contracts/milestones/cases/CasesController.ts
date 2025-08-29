import mysql from 'mysql2/promise';
import ToolsDb from '../../../tools/ToolsDb';
import Contract from '../../Contract';
import Case from './Case';
import ProcesesController from '../../../processes/ProcesesController';
import ProcessInstancesController from '../../../processes/processInstances/ProcessInstancesController';
import Risk from './risks/Risk';
import Milestone from '../Milestone';
import ContractOur from '../../ContractOur';
import ContractOther from '../../ContractOther';
import {
    ExternalOfferData,
    OfferData,
    OtherContractData,
    OurContractData,
    OurOfferData,
} from '../../../types/types';

export type CasesSearchParams = {
    projectId?: string;
    contractId?: number;
    _contract?: OurContractData | OtherContractData;
    _offer?: OurOfferData | ExternalOfferData;
    offerId?: number;
    milestoneId?: number;
    caseId?: number;
    typeId?: number;
    milestoneTypeId?: number;
    searchText?: string;
};

export default class CasesController {
    static async getCasesList(orConditions: CasesSearchParams[] = []) {
        const milestoneParentTypeCondition =
            orConditions[0]._contract?.id || orConditions[0].contractId
                ? 'Milestones.ContractId IS NOT NULL'
                : 'Milestones.OfferId IS NOT NULL';

        const sql = `SELECT 
            Cases.Id,
            CaseTypes.Id AS CaseTypeId,
            CaseTypes.Name AS CaseTypeName,
            CaseTypes.IsDefault,
            CaseTypes.IsUniquePerMilestone,
            CaseTypes.MilestoneTypeId,
            CaseTypes.FolderNumber AS CaseTypeFolderNumber,
            Cases.Name,
            Cases.Number,
            Cases.Description,
            Cases.GdFolderId,
            Cases.LastUpdated,
            Milestones.Id AS MilestoneId,
            Milestones.ContractId,
            Milestones.Name AS MilestoneName,
            Milestones.GdFolderId AS MilestoneGdFolderId,
            MilestoneTypes.Id AS MilestoneTypeId,
            MilestoneTypes.Name AS MilestoneTypeName,
            MilestoneTypes.IsUniquePerContract,
            COALESCE(MilestoneTypes_ContractTypes.FolderNumber, MilestoneTypes_Offers.FolderNumber) AS MilestoneTypeFolderNumber,
            OurContractsData.OurId AS ContractOurId,
            Contracts.Id AS ContractId,
            Contracts.Alias AS ContractAlias,
            Contracts.Number AS ContractNumber,
            Contracts.Name AS ContractName,
            ContractTypes.Id AS MainContractTypeId, 
            ContractTypes.Name AS TypeName, 
            ContractTypes.IsOur AS TypeIsOur, 
            ContractTypes.Description AS TypeDescription,
            Offers.Id AS OfferId,
            Offers.Alias AS OfferAlias,
            Offers.IsOur AS OfferIsOur,
            Risks.Id AS RiskId,
            Risks.Probability AS RiskProbability,
            Risks.OverallImpact AS RiskOverallImpact
        FROM Cases
        LEFT JOIN CaseTypes ON Cases.TypeId=CaseTypes.Id
        JOIN Milestones ON Milestones.Id=Cases.MilestoneId
        JOIN MilestoneTypes ON Milestones.TypeId=MilestoneTypes.Id
        LEFT JOIN Contracts ON Milestones.ContractId=Contracts.Id
        LEFT JOIN ContractTypes ON ContractTypes.Id = Contracts.TypeId
        LEFT JOIN OurContractsData ON OurContractsData.Id=Contracts.Id
        LEFT JOIN Offers ON Milestones.OfferId=Offers.Id
        LEFT JOIN Risks ON Risks.CaseId=Cases.Id
        LEFT JOIN MilestoneTypes_ContractTypes 
            ON  MilestoneTypes_ContractTypes.MilestoneTypeId=Milestones.TypeId 
            AND MilestoneTypes_ContractTypes.ContractTypeId=Contracts.TypeId
        LEFT JOIN MilestoneTypes_Offers ON MilestoneTypes_Offers.MilestoneTypeId = MilestoneTypes.Id
        WHERE ${ToolsDb.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}
            AND ${milestoneParentTypeCondition}
        ORDER BY Contracts.Id, Milestones.Id, CaseTypes.FolderNumber`;
        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processCasesResult(result, orConditions[0]);
    }

    static makeAndConditions(searchParams: CasesSearchParams) {
        const projectCondition = searchParams.projectId
            ? mysql.format('Contracts.ProjectOurId = ?', [
                  searchParams.projectId,
              ])
            : '1';
        const contractId =
            searchParams.contractId || searchParams._contract?.id;

        const contractCondition = contractId
            ? mysql.format('Contracts.Id = ?', [contractId])
            : '1';

        const offerId = searchParams.offerId || searchParams._offer?.id;
        const offerCondition = offerId
            ? mysql.format('Offers.Id = ?', [offerId])
            : '1';
        const milestoneCondition = searchParams.milestoneId
            ? mysql.format('Cases.MilestoneId = ?', [searchParams.milestoneId])
            : '1';
        const caseCondition = searchParams.caseId
            ? mysql.format('Cases.Id = ?', [searchParams.caseId])
            : '1';

        const typeIdCondition = searchParams.typeId
            ? mysql.format('Cases.TypeId = ?', [searchParams.typeId])
            : '1';

        const milestoneTypeCondition = searchParams.milestoneTypeId
            ? mysql.format('MilestoneTypes.Id = ?', [
                  searchParams.milestoneTypeId,
              ])
            : '1';

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );

        return `${projectCondition} 
            AND ${contractCondition} 
            AND ${offerCondition}
            AND ${milestoneCondition} 
            AND ${caseCondition}
            AND ${searchTextCondition}
            AND ${typeIdCondition}
            AND ${milestoneTypeCondition}`;
    }

    static makeSearchTextCondition(searchText?: string) {
        if (!searchText) return '1';

        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(Cases.Number LIKE ? 
                            OR Cases.Name LIKE ?
                            OR Cases.Description LIKE ?
                            OR CaseTypes.FolderNumber LIKE ?
                            OR Milestones.Name LIKE ?
                            OR CaseTypes.Name LIKE ?)`,
                [
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                ]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    static async processCasesResult(
        result: any[],
        initParamObject: {
            projectId?: string;
            contractId?: number;
            milestoneId?: number;
        }
    ) {
        let newResult: Case[] = [];

        let [processes, processesInstances] = await Promise.all([
            ProcesesController.find(initParamObject),
            ProcessInstancesController.getProcessInstancesList(initParamObject),
        ]);
        for (const row of result) {
            const contractInitParams = {
                id: row.ContractId,
                ourId: row.ContractOurId,
                number: row.ContractNumber,
                alias: row.ContractAlias,
                name: ToolsDb.sqlToString(row.ContractName),
                _type: {
                    id: row.ContractTypeId,
                    name: row.ContractTypeName,
                    description: row.ContractTypeDescription,
                    isOur: row.ContractTypeIsOur,
                },
            };
            const _contract = this.makeContractObject(row);
            const _offer = this.makeOfferObject(row);

            const item = new Case({
                id: row.Id,
                _type: {
                    id: row.CaseTypeId,
                    name: row.CaseTypeName,
                    isDefault: row.IsDefault,
                    isUniquePerMilestone: row.isUniquePerMilestone,
                    milestoneTypeId: row.MilestoneTypeId,
                    folderNumber: row.CaseTypeFolderNumber,
                    _processes: processes.filter(
                        (item: any) => item._caseType.id == row.CaseTypeId
                    ),
                },
                name: ToolsDb.sqlToString(row.Name),
                number: row.Number,
                description: ToolsDb.sqlToString(row.Description),
                gdFolderId: row.GdFolderId,
                _parent: new Milestone({
                    id: row.MilestoneId,
                    contractId: row.ContractId,
                    gdFolderId: row.MilestoneGdFolderId,
                    name: row.MilestoneName,
                    _type: {
                        id: row.MilestoneTypeId,
                        name: row.MilestoneTypeName,
                        _folderNumber: row.MilestoneTypeFolderNumber,
                        isUniquePerContract: row.IsUniquePerContract,
                    },
                    _contract,
                    _offer,
                    _dates: [],
                }),
                _risk: new Risk({
                    id: row.RiskId,
                    probability: row.RiskProbability,
                    overallImpact: row.RiskOverallImpact,
                }),
                _processesInstances: processesInstances.filter(
                    (item: any) => item._case.id == row.Id
                ),
            });
            if (this.checkCriteria(item, initParamObject)) newResult.push(item);
        }
        return newResult;
    }
    private static checkCriteria(caseItem: Case, criteria: any) {
        if (criteria.hasProcesses === undefined) return true;
        let hasProcesses: boolean = criteria.hasProcesses === 'true';
        return (
            caseItem._processesInstances &&
            hasProcesses === caseItem._processesInstances?.length > 0
        );
    }

    private static makeContractObject(row: any) {
        if (!row.ContractId) return;
        const contractInitParam = {
            id: row.ContractId,
            ourId: row.ContractOurId,
            number: row.ContractNumber,
            alias: row.ContractAlias,
            name: row.ContractName,
            _type: {
                id: row.MainContractTypeId,
                name: row.TypeName,
                description: row.TypeDescription,
                isOur: row.TypeIsOur,
            },
        };

        return contractInitParam.ourId
            ? new ContractOur(contractInitParam)
            : new ContractOther(contractInitParam);
    }

    private static makeOfferObject(row: any) {
        if (!row.OfferId) return;

        // Validate city data before creating offer object
        if (!row.CityId && (!row.CityName || !row.CityName.trim())) {
            console.warn(
                `Offer ${row.OfferId} has invalid city data in CasesController`
            );
        }

        const offerInitParam: OfferData = {
            id: row.OfferId,
            alias: row.OfferAlias,
            isOur: row.OfferIsOur,
            form: row.OfferForm,
            bidProcedure: row.OfferBidProcedure,
            employerName: row.OfferEmployerName,
            gdFolderId: row.GdFolderId,
            _city: { id: row.CityId, name: row.CityName, code: row.CityCode },
            _type: {
                id: row.OfferTypeId,
                name: row.OfferTypeName,
                isOur: row.OfferTypeIsOur,
                description: row.OfferTypeDescription,
            },
        };
        return offerInitParam;
    }
}
