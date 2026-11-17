import Preview from '../ConsolidationPreview';
export function operationFixture() {
    const snapshot: any = { ...JSON.parse(JSON.stringify(require('./effectsSchemaFixture.json'))), projectOurId: 'SYNTHETIC_OPERATION_TEST', boundaryReferences: 0,
        parentScopeExpression: 'ifnull(`ParentCaseId`,0)', nameWeights: [], folderReferences: [], folderReferenceScope: 'SELECTED_PROJECT_ONLY', rows: {
            Projects: [{ Id: 1900000001, OurId: 'SYNTHETIC_OPERATION_TEST' }],
            Contracts: [{ Id: 1900000001, ProjectOurId: 'SYNTHETIC_OPERATION_TEST', TypeId: 1 }, { Id: 1900000002, ProjectOurId: 'SYNTHETIC_OPERATION_TEST', TypeId: 1 }],
            Milestones: [{ Id: 1900000001, ContractId: 1900000001, TypeId: 5, GdFolderId: 'mock:source' }, { Id: 1900000002, ContractId: 1900000002, TypeId: 5, GdFolderId: 'mock:dest' }],
            Cases: [{ Id: 1900000001, MilestoneId: 1900000001, TypeId: 50, ParentCaseId: null, GdFolderId: 'mock:case' },
                { Id: 1900000002, MilestoneId: 1900000002, TypeId: 50, ParentCaseId: null, GdFolderId: 'mock:case-dest' }],
            Tasks: [], ProcessInstances: [], MilestoneContractLinks: [], CaseType_SubCaseTypes: [],
            CaseTypes: [{ Id: 50, MilestoneTypeId: 5, IsUniquePerMilestone: 0, IsSubCaseOnly: 0 }],
            MilestoneTypes_ContractTypes: [{ MilestoneTypeId: 5, ContractTypeId: 1 }],
        } };
    const make = () => Preview.create({ sourceMilestoneId: 1900000001, destinationMilestoneId: 1900000002,
        mappings: [{ sourceCaseId: 1900000001, target: { mode: 'existing', caseId: 1900000002 } }] }, snapshot,
    { actorId: 7, projectOurId: snapshot.projectOurId, participantContractIds: [1900000001, 1900000002] });
    const body = (p: ReturnType<typeof Preview.create>, metadata: boolean) => ({
        requestId: metadata ? 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' : 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        previewId: p.previewId, expectedRevision: p.revision,
        unitIds: p.units.filter(u => u.unitKey.startsWith(metadata ? 'milestone:' : 'cases:')).map(u => u.unitId),
    });
    return { snapshot, make, body };
}
