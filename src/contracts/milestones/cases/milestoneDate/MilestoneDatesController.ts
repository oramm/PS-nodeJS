import mysql from 'mysql2/promise';
import ToolsDb from '../../../../tools/ToolsDb';
import ContractOther from '../../../ContractOther';
import ContractOur from '../../../ContractOur';
import Milestone from '../../Milestone';
import {
    ContractTypeData,
    MilestoneDateData,
    OfferData,
    OtherContractData,
    OurContractData,
    PersonData,
    ProjectData,
} from '../../../../types/types';
import MilestonesController, {
    MilestoneParentType,
} from '../../MilestonesController';

export type MilestoneDatesSearchParams = {
    searchText?: string;
    projectOurId?: string;
    _project?: ProjectData;
    _contract?: OurContractData | OtherContractData;
    contractId?: number;
    personId?: number;
    startDateFrom?: string;
    startDateTo?: string;
    endDateFrom?: string;
    endDateTo?: string;
    _contractType?: ContractTypeData;
    contractStatuses?: string[];
    milestoneStatuses?: string[];
    _person?: PersonData;
    offerId?: number;
};

export default class MilestoneDatesController {
    static async getMilestoneDatesList(
        orConditions: MilestoneDatesSearchParams[] = [],
        parentType: MilestoneParentType = 'CONTRACT'
    ) {
        MilestonesController.validateConditions(orConditions, parentType);
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
            MainContracts.Id AS ContractId,
            MainContracts.Number AS ParentNumber,
            MainContracts.Name AS ParentName,
            MainContracts.Status AS ParentStatus,
            MainContracts.Alias AS ParentAlias,
            MainContracts.OurIdRelated AS ParentOurIdRelated,
            MainContracts.ProjectOurId AS ProjectOurId,
            ContractTypes.Id AS ContractTypeId,
            ContractTypes.Name AS ContractTypeName,
            ContractTypes.Description AS ContractTypeDescription,
            ContractTypes.IsOur AS ContractTypeIsOur,
            MainContracts.ProjectOurId,
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
            Cities.Code AS CityCode,
            MilestoneDates.Id AS DateId,
            MilestoneDates.StartDate,
            MilestoneDates.EndDate,
            MilestoneDates.Description AS DateDescription,
            MilestoneDates.LastUpdated AS DateLastUpdated,
            Admins.Id AS ParentAdminId,
            Admins.Name AS ParentAdminName,
            Admins.Surname AS ParentAdminSurname,
            Admins.Email AS ParentAdminEmail,
            RelatedContractAdmins.Id AS RelatedContractAdminId,
            RelatedContractAdmins.Name AS RelatedContractAdminName,
            RelatedContractAdmins.Surname AS RelatedContractAdminSurname,
            RelatedContractAdmins.Email AS RelatedContractAdminEmail
        FROM Milestones
        JOIN MilestoneTypes ON Milestones.TypeId=MilestoneTypes.Id
        -- Główny kontrakt przypisany bezpośrednio do milestone
        LEFT JOIN Contracts AS MainContracts ON Milestones.ContractId = MainContracts.Id
        -- Powiązany rekord z OurContractsData na podstawie OurIdRelated z MainContracts
        LEFT JOIN OurContractsData AS RelatedOurContractsData ON RelatedOurContractsData.OurId = MainContracts.OurIdRelated
        -- Kontrakt powiązany (np. „związany kontrakt robót” do „kontraktu głównego”)
        LEFT JOIN Contracts AS RelatedContracts ON RelatedContracts.Id = RelatedOurContractsData.Id
        LEFT JOIN Offers ON Milestones.OfferId = Offers.Id
        LEFT JOIN ContractTypes ON ContractTypes.Id = MainContracts.TypeId
        LEFT JOIN ContractTypes AS OfferTypes ON OfferTypes.Id = Offers.TypeId
        LEFT JOIN Cities ON Cities.Id = Offers.CityId
        LEFT JOIN MilestoneTypes_ContractTypes 
            ON  MilestoneTypes_ContractTypes.MilestoneTypeId=MilestoneTypes.Id
            AND MilestoneTypes_ContractTypes.ContractTypeId = MainContracts.TypeId
        LEFT JOIN MilestoneTypes_Offers ON MilestoneTypes_Offers.MilestoneTypeId = MilestoneTypes.Id
        LEFT JOIN OurContractsData ON OurContractsData.Id=Milestones.ContractId
        LEFT JOIN MilestoneDates ON Milestones.Id = MilestoneDates.MilestoneId
        LEFT JOIN Persons AS Admins ON OurContractsData.AdminId = Admins.Id
        LEFT JOIN Persons AS RelatedContractAdmins ON RelatedOurContractsData.AdminId = RelatedContractAdmins.Id
        WHERE 
        ${ToolsDb.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}  
            AND ${typeCondition}
        ORDER BY MilestoneDates.EndDate, ContractId, FolderNumber ASC`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processMilestoneDatesResult(result);
    }

    private static makeAndConditions(searchParams: MilestoneDatesSearchParams) {
        const conditions: string[] = [];

        const projectOurId =
            searchParams._project?.ourId || searchParams.projectOurId;
        const contractId =
            searchParams._contract?.id || searchParams.contractId;
        const adminId = searchParams._person?.id || searchParams.personId;

        if (projectOurId) {
            conditions.push(
                mysql.format('MainContracts.ProjectOurId = ?', [projectOurId])
            );
        }

        if (contractId) {
            conditions.push(
                mysql.format('Milestones.ContractId = ?', [contractId])
            );
        }

        if (adminId) {
            conditions.push(
                mysql.format(
                    'OurContractsData.AdminId = ? OR RelatedContractAdmins.Id = ?',
                    [adminId, adminId]
                )
            );
        }

        if (searchParams.offerId) {
            conditions.push(
                mysql.format('Milestones.OfferId = ?', [searchParams.offerId])
            );
        }

        if (searchParams._contractType?.id) {
            conditions.push(
                mysql.format('ContractTypes.Id = ?', [
                    searchParams._contractType.id,
                ])
            );
        }

        if (searchParams.contractStatuses?.length) {
            const statusCondition = ToolsDb.makeOrConditionFromValueOrArray(
                searchParams.contractStatuses,
                'MainContracts',
                'Status'
            );
            conditions.push(statusCondition);
        }

        if (searchParams.milestoneStatuses?.length) {
            const statusCondition = ToolsDb.makeOrConditionFromValueOrArray(
                searchParams.milestoneStatuses,
                'Milestones',
                'Status'
            );
            conditions.push(statusCondition);
        }

        if (searchParams.startDateFrom) {
            conditions.push(
                mysql.format('MilestoneDates.StartDate >= ?', [
                    searchParams.startDateFrom,
                ])
            );
        }

        if (searchParams.startDateTo) {
            conditions.push(
                mysql.format('MilestoneDates.StartDate <= ?', [
                    searchParams.startDateTo,
                ])
            );
        }

        if (searchParams.endDateFrom) {
            conditions.push(
                mysql.format('MilestoneDates.EndDate >= ?', [
                    searchParams.endDateFrom,
                ])
            );
        }

        if (searchParams.endDateTo) {
            conditions.push(
                mysql.format('MilestoneDates.EndDate <= ?', [
                    searchParams.endDateTo,
                ])
            );
        }

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }
        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';

        const words = searchText.trim().split(/\s+/);
        const conditions = words.map((word) =>
            mysql.format(
                `(
                    Milestones.Name LIKE ?
                    OR Milestones.Description LIKE ?
                    OR MilestoneDates.Description LIKE ?
                    OR Offers.EmployerName LIKE ?
                    OR MainContracts.Name LIKE ?
                    OR MainContracts.Alias LIKE ?
                    OR MainContracts.Number LIKE ?
                    OR OurContractsData.OurId LIKE ?
                )`,
                Array(8).fill(`%${word}%`)
            )
        );

        return conditions.join(' AND ');
    }

    private static processMilestoneDatesResult(
        result: any[]
    ): MilestoneDateData[] {
        const newResult: MilestoneDateData[] = [];

        for (const row of result) {
            const _contract = this.makeContractObject(row);
            const _offer = this.makeOfferObject(row);

            const _milestone = new Milestone({
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
                _dates: [],
                status: row.Status,
                gdFolderId: row.GdFolderId,
                //może to być kontrakt na roboty (wtedy ma _ourContract), albo OurContract(wtedy ma OurId)
                _contract,
                _offer,
            });

            const item = {
                id: row.DateId,
                startDate: row.StartDate,
                endDate: row.EndDate,
                milestoneId: row.Id,
                _milestone,
                description: row.DateDescription,
                lastUpdated: row.DateLastUpdated,
            };
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
            name: ToolsDb.sqlToString(row.ParentName),
            alias: row.ParentAlias,
            status: row.ParentStatus,
            _ourContract: {
                ourId: row.ParentOurIdRelated,
                _admin: {
                    id: row.RelatedContractAdminId,
                    name: row.RelatedContractAdminName,
                    surname: row.RelatedContractAdminSurname,
                    email: row.RelatedContractAdminEmail,
                } as Partial<PersonData>,
            } as Partial<OurContractData>,
            _manager: { id: row.ParentManagerId },
            _admin: {
                id: row.ParentAdminId,
                name: row.ParentAdminName,
                surname: row.ParentAdminSurname,
                email: row.ParentAdminEmail,
            },
            _project: { ourId: row.ProjectOurId },
            _type: {
                id: row.ContractTypeId,
                name: row.ContractTypeName,
                description: row.ContractTypeDescription,
                isOur: row.ContractTypeIsOur,
            },
        } as Partial<OurContractData | OtherContractData>;

        return row.ContractTypeIsOur
            ? new ContractOur(contractInitParam)
            : new ContractOther(contractInitParam);
    }

    private static makeOfferObject(row: any) {
        if (!row.OfferId) return;
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
