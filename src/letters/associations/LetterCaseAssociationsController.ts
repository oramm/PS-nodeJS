import Case from "../../contracts/milestones/cases/Case";
import ToolsDb from "../../tools/ToolsDb";
import LetterCase from "./LetterCase";


export default class LetterCaseAssociationsController {
    static async getLetterCaseAssociationsList(initParamObject: any) {
        const projectConditon = (initParamObject.projectId) ? 'Contracts.ProjectOurId="' + initParamObject.projectId + '"' : '1';
        const contractConditon = (initParamObject && initParamObject.contractctId) ? 'Contracts.Id="' + initParamObject.contractctId + '"' : '1';
        const sql = 'SELECT  Letters_Cases.LetterId, \n \t' +
            'Letters_Cases.CaseId, \n \t' +
            'Letters.Number, \n \t' +
            'Letters.Description, \n \t' +
            'Letters.CreationDate, \n \t' +
            'Letters.RegistrationDate, \n \t' +
            'Letters.DocumentGdId, \n \t' +
            'Letters.FolderGdId, \n \t' +
            'Letters.LastUpdated, \n \t' +
            'Cases.Name AS CaseName, \n \t' +
            'Cases.Number AS CaseNumber, \n \t' +
            'Cases.Description AS CaseDescription, \n \t' +
            'Cases.GdFolderId AS CaseGdFolderId, \n \t' +
            'CaseTypes.Id AS CaseTypeId, \n \t' +
            'CaseTypes.Name AS CaseTypeName, \n \t' +
            'CaseTypes.IsDefault, \n \t' +
            'CaseTypes.IsUniquePerMilestone, \n \t' +
            'CaseTypes.MilestoneTypeId, \n \t' +
            'CaseTypes.FolderNumber AS CaseTypeFolderNumber, \n \t' +
            'Milestones.Id AS MilestoneId, \n \t' +
            'Milestones.Name AS MilestoneName, \n \t' +
            'MilestoneTypes.Id AS MilestoneTypeId, \n \t' +
            'MilestoneTypes.Name AS MilestoneTypeName, \n \t' +
            'MilestoneTypes_ContractTypes.FolderNumber AS MilestoneTypeFolderNumber, \n \t' +
            'OurContractsData.OurId AS ContractOurId, \n \t' +
            'Contracts.Number AS ContractNumber, \n \t' +
            'Contracts.Name AS ContractName \n' +
            'FROM Letters_Cases \n' +
            'JOIN Letters ON Letters_Cases.LetterId = Letters.Id \n' +
            'JOIN Cases ON Letters_Cases.CaseId = Cases.Id \n' +
            'JOIN CaseTypes ON Cases.TypeId = CaseTypes.Id \n' +
            'JOIN Milestones ON Cases.MilestoneId=Milestones.Id \n' +
            'JOIN MilestoneTypes ON Milestones.TypeId=MilestoneTypes.Id \n' +
            'JOIN Contracts ON Milestones.ContractId=Contracts.Id \n' +
            'LEFT JOIN OurContractsData ON OurContractsData.ContractId=Contracts.Id \n' +
            'JOIN MilestoneTypes_ContractTypes ON MilestoneTypes_ContractTypes.MilestoneTypeId=Milestones.TypeId AND MilestoneTypes_ContractTypes.ContractTypeId=Contracts.TypeId \n' +
            'WHERE ' + projectConditon + ' AND ' + contractConditon + ' \n' +
            'ORDER BY Letters_Cases.LetterId, Cases.Name';

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processLetterCaseAssociationsResult(result);


    }

    static processLetterCaseAssociationsResult(result: any[]): [LetterCase?] {
        let newResult: [LetterCase?] = [];

        for (const row of result) {
            const item = new LetterCase({
                _letter: {
                    id: row.LetterId,
                    number: row.Number,
                    description: row.Description,
                    creationDate: row.CreationDate,
                    registrationDate: row.RegistrationDate,
                    documentGdId: row.DocumentGdId,
                    folderGdId: row.FolderGdId
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
                        _parent: {
                            ourId: row.ContractOurId,
                            number: row.ContractNumber,
                            name: row.ContractName
                        }
                    },
                })
            });
            newResult.push(item);
        }
        return newResult;
    }
}