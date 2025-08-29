import BaseRepository from "../../repositories/BaseRepository";
import ProcessStepInstance from "./ProcessStepInstance";

export default class ProcessStepInstanceRepository extends BaseRepository<ProcessStepInstance> {
    constructor() {
        super('ProcessesStepsInstances');
    }

    protected mapRowToEntity(row: any): ProcessStepInstance {
        return new ProcessStepInstance({
                id: row.Id,
                processInstanceId: row.ProcessInstanceId,
                processStepId: row.ProcessStepId,
                status: row.Status,
                deadline: row.Deadline,
                _ourLetter: {
                    id: row.OurLetterId,
                    gdDocumentId: row.OurLetterGdDocumentId,
                    gdFolderId: row.OurLetterGdFolderId,
                },
                _lastUpdated: row.LastUpdated,
                _processStep: {
                    id: row.ProcessStepId,
                    name: row.ProcessStepName,
                    description: row.ProcessStepDescription,
                    _documentTemplate: {
                        name: row.DocumentTemplateName,
                        gdId: row.DocumentTemplateGdId,
                    },
                },
                _case: {
                    id: row.CaseId,
                },
                _editor: {
                    id: row.EditorId,
                },
            });
        }
        
        async find(initParamObject: any) {
            const projectCondition =
                initParamObject && initParamObject.projectId
                    ? 'Projects.OurId="' + initParamObject.projectId + '"'
                    : '1';
            const contractCondition =
                initParamObject && initParamObject.contractId
                    ? 'Contracts.Id=' + initParamObject.contractId
                    : '1';
            const milestoneCondition =
                initParamObject && initParamObject.milestoneId
                    ? 'Milestones.Id=' + initParamObject.milestoneId
                    : '1';

            const sql =
                'SELECT  ProcessesStepsInstances.Id, \n \t' +
                'ProcessesStepsInstances.ProcessInstanceId, \n \t' +
                'ProcessInstances.CaseId, \n \t' +
                'ProcessesStepsInstances.Status, \n \t' +
                'ProcessesStepsInstances.Deadline, \n \t' +
                'ProcessesStepsInstances.OurLetterId, \n \t' +
                'ProcessesStepsInstances.LastUpdated, \n \t' +
                'ProcessesStepsInstances.EditorId \n \t,' +
                'ProcessesSteps.Id AS ProcessStepId, \n \t' +
                'ProcessesSteps.Name AS ProcessStepName, \n \t' +
                'ProcessesSteps.Description AS ProcessStepDescription, \n \t' +
                'Letters.GdDocumentId AS OurLetterGdDocumentId, \n \t' +
                'Letters.GdFolderId AS OurLetterGdFolderId, \n \t' +
                'DocumentTemplates.Name AS DocumentTemplateName, \n \t' +
                'DocumentTemplates.GdId AS DocumentTemplateGdId \n' +
                'FROM ProcessesStepsInstances \n' +
                'JOIN ProcessInstances ON ProcessesStepsInstances.ProcessInstanceId = ProcessInstances.Id \n' +
                'JOIN ProcessesSteps ON ProcessesStepsInstances.ProcessStepId = ProcessesSteps.Id \n' +
                'LEFT JOIN DocumentTemplatesContents ON DocumentTemplatesContents.Id = ProcessesSteps.DocumentTemplateContentsId \n' +
                'LEFT JOIN DocumentTemplates ON DocumentTemplates.Id=DocumentTemplatesContents.TemplateId \n' +
                'LEFT JOIN Letters ON Letters.Id=ProcessesStepsInstances.OurLetterId \n' +
                'JOIN Processes ON ProcessInstances.ProcessId = Processes.Id \n' +
                'JOIN Cases ON Cases.Id = ProcessInstances.CaseId \n' +
                'JOIN Milestones ON Milestones.Id = Cases.MilestoneId \n' +
                'JOIN Contracts ON Contracts.Id = Milestones.ContractId \n' +
                'JOIN Projects ON Projects.OurId = Contracts.ProjectOurId \n' +
                'WHERE ' +
                projectCondition +
                ' AND ' +
                contractCondition +
                ' AND ' +
                milestoneCondition;

            const rows = await this.executeQuery(sql);
            return rows.map((row: any) => this.mapRowToEntity(row));
        }
    }
