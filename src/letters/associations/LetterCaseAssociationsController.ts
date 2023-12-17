import ContractOther from '../../contracts/ContractOther';
import ContractOur from '../../contracts/ContractOur';
import Case from '../../contracts/milestones/cases/Case';
import ToolsDb from '../../tools/ToolsDb';
import LetterCase from './LetterCase';

export default class LetterCaseAssociationsController {
    static async getLetterCaseAssociationsList(initParamObject: any) {
        const projectConditon = initParamObject.projectId
            ? 'Contracts.ProjectOurId="' + initParamObject.projectId + '"'
            : '1';
        const contractConditon =
            initParamObject && initParamObject.contractctId
                ? 'Contracts.Id="' + initParamObject.contractctId + '"'
                : '1';
        const sql = `SELECT  
                Letters_Cases.LetterId, 
                Letters_Cases.CaseId, 
                Letters.Number, 
                Letters.Description, 
                Letters.CreationDate, 
                Letters.RegistrationDate, 
                Letters.DocumentGdId, 
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
                MilestoneTypes_ContractTypes.FolderNumber AS MilestoneTypeFolderNumber, 
                OurContractsData.OurId AS ContractOurId, 
                ContractTypes.Id AS ContractTypeId, 
                ContractTypes.Name AS ContractTypeName, 
                ContractTypes.IsOur AS ContractTypeIsOur, 
                ContractTypes.Description AS ContractTypeDescription,
                Contracts.Id AS ContractId, 
                Contracts.Number AS ContractNumber, 
                Contracts.Name AS ContractName
            FROM Letters_Cases
            JOIN Letters ON Letters_Cases.LetterId = Letters.Id
            JOIN Cases ON Letters_Cases.CaseId = Cases.Id
            JOIN CaseTypes ON Cases.TypeId = CaseTypes.Id
            JOIN Milestones ON Cases.MilestoneId=Milestones.Id
            JOIN MilestoneTypes ON Milestones.TypeId=MilestoneTypes.Id
            JOIN Contracts ON Milestones.ContractId=Contracts.Id
            JOIN ContractTypes ON ContractTypes.Id = Contracts.TypeId
            LEFT JOIN OurContractsData ON OurContractsData.Id=Contracts.Id
            JOIN MilestoneTypes_ContractTypes ON MilestoneTypes_ContractTypes.MilestoneTypeId=Milestones.TypeId AND MilestoneTypes_ContractTypes.ContractTypeId=Contracts.TypeId
            WHERE ${projectConditon} 
              AND ${contractConditon}
            ORDER BY Letters_Cases.LetterId, Cases.Name`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processLetterCaseAssociationsResult(result);
    }

    static processLetterCaseAssociationsResult(result: any[]): [LetterCase?] {
        let newResult: [LetterCase?] = [];

        for (const row of result) {
            const contractInitParams = {
                id: row.ContractId,
                ourId: row.ContractOurId,
                number: row.ContractNumber,
                name: ToolsDb.sqlToString(row.ContractName),
                _type: {
                    id: row.ContractTypeId,
                    name: row.ContractTypeName,
                    isOur: row.ContractTypeIsOur,
                    description: ToolsDb.sqlToString(
                        row.ContractTypeDescription
                    ),
                },
            };
            const _contract = contractInitParams.ourId
                ? new ContractOur(contractInitParams)
                : new ContractOther(contractInitParams);

            const item = new LetterCase({
                _letter: {
                    id: row.LetterId,
                    number: row.Number,
                    description: row.Description,
                    creationDate: row.CreationDate,
                    registrationDate: row.RegistrationDate,
                    documentGdId: row.DocumentGdId,
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
                        _type: {
                            id: row.MilestoneTypeId,
                            name: row.MilestoneTypeName,
                            _folderNumber: row.MilestoneTypeFolderNumber,
                        },
                        _parent: _contract,
                    },
                }),
            });
            newResult.push(item);
        }
        return newResult;
    }
}
