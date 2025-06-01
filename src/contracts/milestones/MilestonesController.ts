import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import ContractOther from '../ContractOther';
import ContractOur from '../ContractOur';
import Milestone from './Milestone';
import { OfferData } from '../../types/types';

export type MilestonesSearchParams = {
    projectId?: string;
    contractId?: number;
    typeId?: number;
    offerId?: number;
};

export type MilestoneParentType = 'CONTRACT' | 'OFFER';

export default class MilestonesController {
    static async getMilestonesList(
        orConditions: MilestonesSearchParams[] = [],
        parentType: MilestoneParentType = 'CONTRACT'
    ) {
        this.validateConditions(orConditions, parentType);
        const typeCondition =
            parentType === 'CONTRACT'
                ? 'Milestones.ContractId IS NOT NULL'
                : 'Milestones.OfferId IS NOT NULL';

        const sql = `SELECT  Milestones.Id,
            MilestoneTypes.Id AS TypeId,
            MilestoneTypes.Name AS TypeName,
            COALESCE(MilestoneTypes_ContractTypes.FolderNumber, MilestoneTypes_Offers.FolderNumber) AS FolderNumber,
            COALESCE(MilestoneTypes_ContractTypes.IsDefault, TRUE) AS TypeIsDefault,
            MilestoneTypes.IsUniquePerContract AS TypeIsUniquePerContract,
            Milestones.Name,
            Milestones.Description,
            Milestones.Status,
            Milestones.GdFolderId,
            OurContractsData.OurId AS ParentOurId,
            OurContractsData.ManagerId AS ParentManagerId,
            OurContractsData.AdminId AS ParentAdminId,
            Contracts.Id AS ContractId,
            Contracts.Number AS ParentNumber,
            Contracts.OurIdRelated AS ParentOurIdRelated,
            ContractTypes.Id AS ContractTypeId,
            ContractTypes.Name AS ContractTypeName,
            ContractTypes.Description AS ContractTypeDescription,
            ContractTypes.IsOur AS ContractTypeIsOur,
            Contracts.ProjectOurId,
            Offers.Id AS OfferId,
            Offers.Alias AS OfferAlias,
            Offers.IsOur AS OfferIsOur,
            Offers.Form AS OfferForm,
            Offers.BidProcedure AS OfferBidProcedure,
            Offers.EmployerName AS OfferEmployerName,
            Offers.EditorId AS OfferEditorId,
            OfferTypes.Id AS OfferTypeId,
            OfferTypes.Name AS OfferTypeName,
            OfferTypes.Description AS OfferTypeDescription,
            OfferTypes.IsOur AS OfferTypeIsOur,
            Cities.Id AS CityId,
            Cities.Name AS CityName,
            Cities.Code AS CityCode
        FROM Milestones
        LEFT JOIN MilestoneDates ON Milestones.Id = MilestoneDates.MilestoneId
        JOIN MilestoneTypes ON Milestones.TypeId=MilestoneTypes.Id
        LEFT JOIN Contracts ON Milestones.ContractId = Contracts.Id
        LEFT JOIN Offers ON Milestones.OfferId = Offers.Id
        LEFT JOIN ContractTypes ON ContractTypes.Id = Contracts.TypeId
        LEFT JOIN ContractTypes AS OfferTypes ON OfferTypes.Id = Offers.TypeId
        LEFT JOIN Cities ON Cities.Id = Offers.CityId
        LEFT JOIN MilestoneTypes_ContractTypes 
            ON  MilestoneTypes_ContractTypes.MilestoneTypeId=MilestoneTypes.Id
            AND MilestoneTypes_ContractTypes.ContractTypeId = Contracts.TypeId
        LEFT JOIN MilestoneTypes_Offers ON MilestoneTypes_Offers.MilestoneTypeId = MilestoneTypes.Id
        LEFT JOIN OurContractsData ON OurContractsData.Id=Milestones.ContractId
        WHERE 
        ${ToolsDb.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}  
            AND ${typeCondition}
        ORDER BY MilestoneTypes_ContractTypes.FolderNumber`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processMilestonesResult(result);
    }

    static makeAndConditions(searchParams: MilestonesSearchParams) {
        const projectCondition = searchParams.projectId
            ? mysql.format('Contracts.ProjectOurId = ?', [
                  searchParams.projectId,
              ])
            : '1';
        const contractCondition = searchParams.contractId
            ? mysql.format('Milestones.ContractId = ?', [
                  searchParams.contractId,
              ])
            : '1';

        const offerCondition = searchParams.offerId
            ? mysql.format('Milestones.OfferId = ?', [searchParams.offerId])
            : '1';
        const typeCondition = searchParams.typeId
            ? mysql.format('Milestones.TypeId = ?', [searchParams.typeId])
            : '1';

        return `${projectCondition} 
            AND ${contractCondition}
            AND ${offerCondition}
            AND ${typeCondition}`;
    }

    static validateConditions(
        orConditions: MilestonesSearchParams[],
        parentType: 'CONTRACT' | 'OFFER'
    ) {
        orConditions.map((condition) => {
            if (condition.contractId && condition.offerId)
                throw new Error(
                    'MilestonesController.getMilestonesList: contractId and offerId cannot be used together'
                );
            if (condition.contractId && parentType === 'OFFER')
                throw new Error(
                    'MilestonesController.getMilestonesList: contractId cannot be used with parentType OFFER'
                );
            if (condition.offerId && parentType === 'CONTRACT')
                throw new Error(
                    'MilestonesController.getMilestonesList: offerId cannot be used with parentType CONTRACT'
                );
        });
    }

    static processMilestonesResult(result: any[]): Milestone[] {
        const newResult: Milestone[] = [];

        for (const row of result) {
            const _contract = this.makeContractObject(row);
            const _offer = this.makeOfferObject(row);

            const item = new Milestone({
                id: row.Id,
                _type: {
                    id: row.TypeId,
                    name: row.TypeName,
                    isUniquePerContract: row.TypeIsUniquePerContract,
                    _isDefault: row.TypeIsDefault,
                    _folderNumber: row.FolderNumber,
                },
                name: ToolsDb.sqlToString(row.Name),
                description: ToolsDb.sqlToString(row.Description),
                _dates: [
                    {
                        startDate: row.StartDate,
                        endDate: row.EndDate,
                        milestoneId: row.Id,
                        description: row.DateDescription,
                        lastUpdated: row.DateLastUpdated,
                    },
                ],
                status: row.Status,
                gdFolderId: row.GdFolderId,
                //może to być kontrakt na roboty (wtedy ma _ourContract), albo OurContract(wtedy ma OurId)
                _contract,
                _offer,
            });
            newResult.push(item);
        }
        return newResult;
    }

    private static makeContractObject(row: any) {
        if (!row.ContractId) return;
        const contractInitParam = {
            id: row.ContractId,
            ourId: row.ParentOurId,
            number: row.ParentNumber,
            _ourContract: { ourId: row.ParentOurIdRelated },
            _manager: { id: row.ParentManagerId },
            _admin: { id: row.ParentAdminId },
            projectId: row.ProjectOurId,
            _type: {
                id: row.ContractTypeId,
                name: row.ContractTypeName,
                description: row.ContractTypeDescription,
                isOur: row.ContractTypeIsOur,
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
                `Offer ${row.OfferId} has invalid city data in MilestonesController`
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
