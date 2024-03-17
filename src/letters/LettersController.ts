import mysql from 'mysql2/promise';
import Tools from '../tools/Tools';
import ToolsDate from '../tools/ToolsDate';
import ToolsDb from '../tools/ToolsDb';
import LetterCaseAssociationsController, {
    LetterCaseSearchParams,
} from './associations/LetterCaseAssociationsController';
import LetterEntityAssociationsController from './associations/LetterEntityAssociationsController';
import IncomingLetter from './IncomingLetter';
import Letter from './Letter';
import OurLetter from './OurLetter';
import OurOldTypeLetter from './OurOldTypeLetter';
import Project from '../projects/Project';
import {
    CaseData,
    ExternalOfferData,
    IncomingLetterContractData,
    IncomingLetterData,
    IncomingLetterOfferData,
    LetterData,
    OfferData,
    OtherContractData,
    OurContractData,
    OurLetterContractData,
    OurLetterData,
    OurLetterOfferData,
    OurOfferData,
    ProjectData,
} from '../types/types';
import OurLetterContract from './OurLetterContract';
import LetterCase from './associations/LetterCase';
import LetterEntity from './associations/LetterEntity';
import OurLetterOffer from './OurLetterOfffer';
import IncomingLetterOffer from './IncomingLetterOffer';
import IncomingLetterContract from './IncomingLetterContract';

type LetterSearchParams = {
    projectId?: string;
    _project?: Project;
    _contract?: OurContractData | OtherContractData;
    _offer?: OurOfferData | ExternalOfferData;
    _case?: CaseData;
    searchText?: string;
    contractId?: number;
    offerId?: number;
    milestoneId?: string;
    creationDateFrom?: string;
    creationDateTo?: string;
};

export default class LettersController {
    static async getLettersList(
        orConditions: LetterSearchParams[],
        milestoneParentType: 'CONTRACT' | 'OFFER'
    ) {
        const milestoneParentTypeCondition =
            milestoneParentType === 'CONTRACT'
                ? 'Milestones.ContractId IS NOT NULL'
                : 'Milestones.OfferId IS NOT NULL';

        const sql = `SELECT 
            Letters.Id,
            Letters.IsOur,
            Letters.Number,
            Letters.Description,
            Letters.CreationDate,
            Letters.RegistrationDate,
            Letters.GdDocumentId,
            Letters.GdFolderId,
            Letters.LetterFilesCount,
            Letters.LastUpdated,
            Projects.Id AS ProjectId,
            Projects.OurId AS ProjectOurId,
            Projects.GdFolderId AS ProjectGdFolderId,
            Projects.LettersGdFolderId,
            Persons.Id AS EditorId,
            Offers.Id AS OfferId,
            Offers.Alias AS OfferAlias,
            Persons.Name AS EditorName,
            Persons.Surname AS EditorSurname,
            GROUP_CONCAT(Entities.Name SEPARATOR ', ') AS EntityNames,
            GROUP_CONCAT(Cases.Name SEPARATOR ', ') AS CaseNames,
            GROUP_CONCAT(CaseTypes.Name SEPARATOR ', ') AS CaseTypesNames
        FROM Letters
        JOIN Letters_Cases ON Letters_Cases.LetterId=Letters.id
        JOIN Cases ON Letters_Cases.CaseId=Cases.Id
        JOIN CaseTypes ON Cases.TypeId = CaseTypes.Id
        JOIN Milestones ON Milestones.Id=Cases.MilestoneId
        LEFT JOIN Contracts ON Contracts.Id=Milestones.ContractId
        LEFT JOIN Offers ON Offers.Id = Milestones.OfferId
        LEFT JOIN Projects ON Letters.ProjectId=Projects.Id
        JOIN Persons ON Letters.EditorId=Persons.Id
        JOIN Letters_Entities ON Letters_Entities.LetterId=Letters.Id
        JOIN Entities ON Letters_Entities.EntityId=Entities.Id
        WHERE ${ToolsDb.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}
            AND ${milestoneParentTypeCondition}
        GROUP BY Letters.Id
        ORDER BY Letters.RegistrationDate, Letters.CreationDate;`;
        console.log(sql);
        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processLettersResult(result, orConditions[0]);
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(Letters.Description LIKE ?
        OR Letters.Number LIKE ?
        OR Cases.Name LIKE ?
        OR CaseTypes.Name LIKE ?
        OR Letters.Number LIKE ?
        OR Entities.Name LIKE ?)`,
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

    static makeAndConditions(searchParams: LetterSearchParams) {
        const projectOurId =
            searchParams._project?.ourId || searchParams.projectId;
        const contractId =
            searchParams._contract?.id || searchParams.contractId;
        const offerId = searchParams._offer?.id || searchParams.offerId;
        const caseId = searchParams._case?.id;

        const projectCondition = projectOurId
            ? mysql.format(`Projects.OurId = ? `, [projectOurId])
            : '1';

        const contractCondition = contractId
            ? mysql.format(`Contracts.Id = ? `, [contractId])
            : '1';

        const offerCondition = searchParams.offerId
            ? mysql.format(`Offers.Id = ? `, [offerId])
            : '1';

        const milestoneCondition = searchParams.milestoneId
            ? mysql.format(`Milestones.Id = ? `, [searchParams.milestoneId])
            : '1';

        const caseCondition = caseId
            ? mysql.format(`Cases.Id = ? `, [caseId])
            : '1';

        const creationDateFromCondition = searchParams.creationDateFrom
            ? mysql.format(`Letters.CreationDate >= ? `, [
                  ToolsDate.dateDMYtoYMD(searchParams.creationDateFrom),
              ])
            : '1';

        const creationDateToCondition = searchParams.creationDateTo
            ? mysql.format(`Letters.CreationDate <= ? `, [
                  searchParams.creationDateTo,
              ])
            : '1';

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText?.toString()
        );

        const conditions = `${projectCondition} 
            AND ${contractCondition} 
            AND ${milestoneCondition}
            AND ${caseCondition}
            AND ${creationDateFromCondition}
            AND ${creationDateToCondition}
            AND ${searchTextCondition} 
            AND ${offerCondition}`;
        return conditions;
    }

    static async processLettersResult(
        rawResult: any[],
        initParamObject: LetterCaseSearchParams
    ) {
        const newResult: Letter[] = [];
        let [_casesAssociationsPerProject, _letterEntitiesPerProject] =
            await Promise.all([
                LetterCaseAssociationsController.getLetterCaseAssociationsList(
                    initParamObject
                ),
                LetterEntityAssociationsController.getLetterEntityAssociationsList(
                    initParamObject
                ),
            ]);
        for (const row of rawResult) {
            const _casesAssociationsPerLetter =
                _casesAssociationsPerProject.filter(
                    (item) => item.letterId == row.Id
                );
            const _letterEntitiesMainPerLetter =
                _letterEntitiesPerProject.filter(
                    (item) =>
                        item.letterId == row.Id && item.letterRole == 'MAIN'
                );
            const _letterEntitiesCcPerLetter = _letterEntitiesPerProject.filter(
                (item) => item.letterId == row.Id && item.letterRole == 'CC'
            );
            const ProperLetterType = this.getLetterType(row);
            let paramsCreator: Function;

            switch (ProperLetterType) {
                case OurLetterContract:
                    paramsCreator = this.createOurLetterContractInitParam;
                    break;
                case OurLetterOffer:
                    paramsCreator = this.createOurLetterOfferInitParam;
                    break;
                case IncomingLetterContract:
                    paramsCreator = this.createIncomingLetterContractInitParam;
                    break;
                case IncomingLetterOffer:
                    paramsCreator = this.createIncomingLetterOfferInitParam;
                    break;
                case OurOldTypeLetter:
                    paramsCreator =
                        this.createOurOldTypeLetterContractInitParam;
                    break;
                default:
                    throw new Error(
                        'No params creator found for type: ' + ProperLetterType
                    );
            }

            const initParams = paramsCreator(
                row,
                _casesAssociationsPerLetter,
                _letterEntitiesMainPerLetter,
                _letterEntitiesCcPerLetter
            );
            let item = new ProperLetterType(initParams);

            newResult.push(item);
        }
        return newResult;
    }

    private static createLetterInitParam(
        row: any,
        _casesAssociationsPerLetter: LetterCase[],
        _letterEntitiesMainPerLetter: LetterEntity[],
        _letterEntitiesCcPerLetter: LetterEntity[]
    ) {
        const initParam: LetterData = {
            id: row.Id,
            number: row.Number,
            description: ToolsDb.sqlToString(row.Description),
            creationDate: row.CreationDate,
            registrationDate: row.RegistrationDate,
            gdDocumentId: row.GdDocumentId,
            gdFolderId: row.GdFolderId,
            letterFilesCount: row.LetterFilesCount,
            _lastUpdated: row.LastUpdated,

            _cases: _casesAssociationsPerLetter.map((item) => item._case),
            _entitiesMain: _letterEntitiesMainPerLetter.map(
                (item) => item._entity
            ),
            _entitiesCc: _letterEntitiesCcPerLetter.map((item) => item._entity),
            _editor: {
                id: row.EditorId,
                name: row.EditorName,
                surname: row.EditorSurname,
            },
        };
        return initParam;
    }

    private static createOurLetterContractInitParam(
        row: any,
        _casesAssociationsPerLetter: LetterCase[],
        _letterEntitiesMainPerLetter: LetterEntity[],
        _letterEntitiesCcPerLetter: LetterEntity[]
    ) {
        const letterParams = LettersController.createLetterInitParam(
            row,
            _casesAssociationsPerLetter,
            _letterEntitiesMainPerLetter,
            _letterEntitiesCcPerLetter
        );

        const initParam: OurLetterContractData = {
            ...letterParams,
            isOur: row.IsOur,
            _project: <ProjectData>{
                id: row.ProjectId,
                ourId: row.ProjectOurId,
                gdFolderId: row.ProjectGdFolderId,
                lettersGdFolderId: row.LettersGdFolderId,
            },
        };

        return initParam;
    }

    private static createOurLetterOfferInitParam(
        row: any,
        _casesAssociationsPerLetter: LetterCase[],
        _letterEntitiesMainPerLetter: LetterEntity[],
        _letterEntitiesCcPerLetter: LetterEntity[]
    ) {
        const letterParams = this.createLetterInitParam(
            row,
            _casesAssociationsPerLetter,
            _letterEntitiesMainPerLetter,
            _letterEntitiesCcPerLetter
        );

        const initParam: OurLetterOfferData = {
            ...letterParams,
            isOur: row.IsOur,
            _offer: <OurOfferData>{
                id: row.OfferId,
                alias: row.OfferAlias,
            },
        };

        return initParam;
    }

    private static createIncomingLetterOfferInitParam(
        row: any,
        _casesAssociationsPerLetter: LetterCase[],
        _letterEntitiesMainPerLetter: LetterEntity[],
        _letterEntitiesCcPerLetter: LetterEntity[]
    ) {
        const letterParams = this.createLetterInitParam(
            row,
            _casesAssociationsPerLetter,
            _letterEntitiesMainPerLetter,
            _letterEntitiesCcPerLetter
        );

        const initParam: IncomingLetterOfferData = {
            ...letterParams,
            isOur: row.IsOur,
            _offer: <OurOfferData>{
                id: row.OfferId,
                alias: row.OfferAlias,
            },
        };

        return initParam;
    }

    private static createIncomingLetterContractInitParam(
        row: any,
        _casesAssociationsPerLetter: LetterCase[],
        _letterEntitiesMainPerLetter: LetterEntity[],
        _letterEntitiesCcPerLetter: LetterEntity[]
    ) {
        const letterParams = LettersController.createLetterInitParam(
            row,
            _casesAssociationsPerLetter,
            _letterEntitiesMainPerLetter,
            _letterEntitiesCcPerLetter
        );

        const initParam: IncomingLetterContractData = {
            ...letterParams,
            isOur: row.IsOur,
            _project: <ProjectData>{
                id: row.ProjectId,
                ourId: row.ProjectOurId,
                gdFolderId: row.ProjectGdFolderId,
                lettersGdFolderId: row.LettersGdFolderId,
            },
        };

        return initParam;
    }

    private static createOurOldTypeLetterContractInitParam(
        row: any,
        _casesAssociationsPerLetter: LetterCase[],
        _letterEntitiesMainPerLetter: LetterEntity[],
        _letterEntitiesCcPerLetter: LetterEntity[]
    ) {
        const params = LettersController.createIncomingLetterContractInitParam(
            row,
            _casesAssociationsPerLetter,
            _letterEntitiesMainPerLetter,
            _letterEntitiesCcPerLetter
        );

        return { ...params, isOur: true };
    }

    private static getLetterType(row: any) {
        if (row.IsOur && row.Id == row.Number && row.ProjectId)
            return OurLetterContract;
        if (row.IsOur && row.Id !== row.Number) return OurOldTypeLetter;
        if (row.IsOur && row.OfferId) return OurLetterOffer;
        if (!row.IsOur && row.ProjectId) return IncomingLetterContract;
        return IncomingLetterOffer;
    }

    /** tworzy obiekt odpowiedniej podklasy Letter na podstawie atrybutów */
    static createProperLetter(initParam: any) {
        if (
            initParam.isOur &&
            initParam.id == initParam.number &&
            initParam._project?.id
        )
            return new OurLetterContract(initParam);
        if (initParam.isOur && initParam.id !== initParam.number)
            return new OurOldTypeLetter(initParam);
        if (initParam.isOur && initParam._offer?.id)
            return new OurLetterOffer(initParam);
        if (!initParam.isOur && initParam._project)
            return new IncomingLetterContract(initParam);
        return new IncomingLetterOffer(initParam);
    }
}
