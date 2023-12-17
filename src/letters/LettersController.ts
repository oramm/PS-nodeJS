import mysql from 'mysql2/promise';
import Tools from '../tools/Tools';
import ToolsDate from '../tools/ToolsDate';
import ToolsDb from '../tools/ToolsDb';
import LetterCaseAssociationsController from './associations/LetterCaseAssociationsController';
import LetterEntityAssociationsController from './associations/LetterEntityAssociationsController';
import IncomingLetter from './IncomingLetter';
import Letter from './Letter';
import OurLetter from './OurLetter';
import OurOldTypeLetter from './OurOldTypeLetter';
import Project from '../projects/Project';
import Contract from '../contracts/Contract';
import Case from '../contracts/milestones/cases/Case';

type LetterSearchParams = {
    projectId?: string;
    _project?: Project;
    _contract?: Contract;
    _case?: Case;
    searchText?: string;
    contractId?: number;
    milestoneId?: string;
    creationDateFrom?: string;
    creationDateTo?: string;
};

export default class LettersController {
    static async getLettersList(orConditions: LetterSearchParams[]) {
        const sql = `SELECT 
            Letters.Id,
            Letters.IsOur,
            Letters.Number,
            Letters.Description,
            Letters.CreationDate,
            Letters.RegistrationDate,
            Letters.DocumentGdId,
            Letters.GdFolderId,
            Letters.LetterFilesCount,
            Letters.LastUpdated,
            Projects.Id AS ProjectId,
            Projects.OurId AS ProjectOurId,
            Projects.GdFolderId AS ProjectGdFolderId,
            Projects.LettersGdFolderId,
            Persons.Id AS EditorId,
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
        JOIN Contracts ON Contracts.Id=Milestones.ContractId
        JOIN Projects ON Letters.ProjectId=Projects.Id
        JOIN Persons ON Letters.EditorId=Persons.Id
        JOIN Letters_Entities ON Letters_Entities.LetterId=Letters.Id
        JOIN Entities ON Letters_Entities.EntityId=Entities.Id
        WHERE ${ToolsDb.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}
        GROUP BY Letters.Id
        ORDER BY Letters.RegistrationDate, Letters.CreationDate;`;

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
        const caseId = searchParams._case?.id;

        const projectCondition = projectOurId
            ? mysql.format(`Projects.OurId = ? `, [projectOurId])
            : '1';

        const contractCondition = contractId
            ? mysql.format(`Contracts.Id = ? `, [contractId])
            : '1';

        const milestoneCondition = searchParams.milestoneId
            ? mysql.format(`Milestones.Id = ? `, [searchParams.milestoneId])
            : '1';

        const caseCondition = caseId
            ? mysql.format(`Cases.Id = ? `, [caseId])
            : '1';

        const dateCondition =
            searchParams.creationDateFrom && searchParams.creationDateTo
                ? mysql.format(
                      `Letters.CreationDate BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)`,
                      [
                          ToolsDate.dateDMYtoYMD(searchParams.creationDateFrom),
                          searchParams.creationDateTo,
                      ]
                  )
                : '1';
        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText?.toString()
        );

        const conditions = `${projectCondition} 
            AND ${contractCondition} 
            AND ${milestoneCondition}
            AND ${caseCondition}
            AND ${dateCondition}
            AND ${searchTextCondition} `;
        return conditions;
    }

    static async processLettersResult(result: any[], initParamObject: any) {
        let newResult: Letter[] = [];
        let [_casesAssociationsPerProject, _letterEntitiesPerProject] =
            await Promise.all([
                LetterCaseAssociationsController.getLetterCaseAssociationsList(
                    initParamObject
                ),
                LetterEntityAssociationsController.getLetterEntityAssociationsList(
                    initParamObject
                ),
            ]);
        for (const row of result) {
            const _casesAssociationsPerLetter =
                _casesAssociationsPerProject.filter(
                    (item: any) => item.letterId == row.Id
                );
            const _letterEntitiesMainPerLetter =
                _letterEntitiesPerProject.filter(
                    (item: any) =>
                        item.letterId == row.Id && item.letterRole == 'MAIN'
                );
            const _letterEntitiesCcPerLetter = _letterEntitiesPerProject.filter(
                (item: any) =>
                    item.letterId == row.Id && item.letterRole == 'CC'
            );
            const initParam = {
                id: row.Id,
                isOur: row.IsOur,
                number: row.Number,
                description: ToolsDb.sqlToString(row.Description),
                creationDate: row.CreationDate,
                registrationDate: row.RegistrationDate,
                documentGdId: row.DocumentGdId,
                gdFolderId: row.GdFolderId,
                letterFilesCount: row.LetterFilesCount,
                _lastUpdated: row.LastUpdated,
                _project: {
                    id: row.ProjectId,
                    ourId: row.ProjectOurId,
                    gdFolderId: row.ProjectGdFolderId,
                    lettersGdFolderId: row.LettersGdFolderId,
                },
                _cases: _casesAssociationsPerLetter.map(
                    (item: any) => item._case
                ),
                _entitiesMain: _letterEntitiesMainPerLetter.map(
                    (item: any) => item._entity
                ),
                _entitiesCc: _letterEntitiesCcPerLetter.map(
                    (item: any) => item._entity
                ),
                _editor: {
                    id: row.EditorId,
                    name: row.EditorName,
                    surname: row.EditorSurname,
                },
            };
            let item: IncomingLetter | OurLetter | OurOldTypeLetter;
            if (initParam.isOur) {
                if (initParam.id == initParam.number)
                    item = new OurLetter(initParam);
                else item = new OurOldTypeLetter(initParam);
            } else item = new IncomingLetter(initParam);
            newResult.push(item);
        }
        return newResult;
    }
    /** tworzy obiekt odpowiedniej podklasy Letter na podstawie atrybutów */
    static createProperLetter(initParam: any) {
        let item: OurLetter | OurOldTypeLetter | IncomingLetter;
        if (initParam.isOur) {
            if (initParam.id == initParam.number)
                item = new OurLetter(initParam);
            else item = new OurOldTypeLetter(initParam);
        } else item = new IncomingLetter(initParam);
        return item;
    }
}
