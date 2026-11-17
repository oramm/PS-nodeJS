import Effects from '../ConsolidationEffects';
import type { EffectsSnapshot } from '../ConsolidationEffectsRepository';
import type { MappingRequest } from '../ConsolidationMapping';
const schema = require('./effectsSchemaFixture.json');

function fixture(): EffectsSnapshot {
    return { ...structuredClone(schema),parentScopeExpression:'ifnull(`ParentCaseId`,0)',projectOurId:'P',boundaryReferences:0,folderReferenceScope:'SELECTED_PROJECT_ONLY',
        nameWeights:[{name:'Cel',weight:'cel'},{name:'CEL ',weight:'cel'},{name:'Nowa',weight:'nowa'}],folderReferences:[],rows:{
            Projects:[{Id:7,OurId:'P'}],Contracts:[{Id:10,ProjectOurId:'P',TypeId:1},{Id:20,ProjectOurId:'P',TypeId:2}],
            Milestones:[{Id:1,ContractId:10,TypeId:5,OfferId:null,GdFolderId:'mock:root-source',Description:'source'},
                {Id:2,ContractId:20,TypeId:5,OfferId:null,GdFolderId:'mock:root-dest',Description:'DO NOT OVERWRITE'}],
            MilestoneTypes_ContractTypes:[{MilestoneTypeId:5,ContractTypeId:1},{MilestoneTypeId:5,ContractTypeId:2}],
            Cases:[{Id:100,MilestoneId:1,TypeId:50,ParentCaseId:null,Number:1,Name:'Źródło',Description:'notatka',GdFolderId:'mock:source'},
                {Id:200,MilestoneId:2,TypeId:50,ParentCaseId:null,Number:4,Name:'Cel',Description:'cel bez zmian',GdFolderId:'mock:target'}],
            CaseTypes:[{Id:50,MilestoneTypeId:5,IsUniquePerMilestone:0,IsSubCaseOnly:0},{Id:51,MilestoneTypeId:5,IsUniquePerMilestone:0,IsSubCaseOnly:1}],
            CaseType_SubCaseTypes:[{ParentCaseTypeId:50,SubCaseTypeId:51}],Tasks:[],Tasks_Watchers:[],ProcessInstances:[],
            ProcessesStepsInstances:[],MilestoneContractLinks:[],MilestoneDates:[],Letters_Cases:[],Letters:[],LetterEvents:[],
            Risks:[],Securities:[],MeetingArrangements:[],CaseTypeFolders:[],Letters_Entities:[],MilestoneSharingState:[],MilestoneTypes:[]
        }};
}
const request=():MappingRequest=>({sourceMilestoneId:1,destinationMilestoneId:2,mappings:[]});
const codes=(result:ReturnType<typeof Effects.analyze>)=>result.conflicts.map(c=>c.code);
const task=(id=1000,caseId=100)=>({Id:id,CaseId:caseId,Name:'same name',OwnerId:6,HoursMon:'5.25',HoursTue:null,HoursWed:'0.00',HoursThu:null,HoursFri:null,EstimatedHours:'10.00'});

describe('consolidation impact analysis',()=>{
    it('retains metadata even for an empty milestone; never says transfer-ready',()=>{
        const s=fixture();s.rows.Cases=[];
        const result=Effects.analyze(request(),s);
        expect(result.totals).toMatchObject({tasks:0,notes:1});expect(result.units).toHaveLength(1);
        expect(result.transferReady).toBe(false);expect(result.units[0].state).toBe('ANALYZED');
    });
    it('preserves full source notes and destination descriptions/statuses without mutation',()=>{
        const s=fixture();const text='Źródło '.repeat(20000);s.rows.Cases[0].Description=text;
        s.rows.Cases[0].Status='OPEN';s.rows.MilestoneDates=[{Id:300,MilestoneId:1,Description:'data',EndDate:'2026-09-25'}];
        const before=JSON.stringify(s);const result=Effects.analyze(request(),s);
        expect(JSON.stringify(s)).toBe(before);expect(result.notes.find(n=>n.entity==='Cases')!.record.Description).toBe(text);
        expect(result.totals.notes).toBe(3);expect(result.notes.some(n=>n.sourceId===200)).toBe(false);
    });
    it('counts same-named tasks once each, watchers as edges, risk reactions without extra tasks',()=>{
        const s=fixture();s.rows.Tasks=[task(),task(1001)];s.rows.Tasks_Watchers=[{TaskId:1000,PersonId:6},{TaskId:1000,PersonId:7}];
        const r=Effects.analyze(request(),s);expect(r.totals).toMatchObject({tasks:2,relations:2});
        expect(r.units[1].taskIds).toEqual([1000,1001]);expect(r.units[1].counts.tasks).toBe(2);
    });
    it('assigns unchanged counters to the destination without requiring a period or resetting hours',()=>{
        const s=fixture();s.rows.Tasks=[task()];const before=JSON.stringify(s);const r=Effects.analyze(request(),s);
        expect(r.units[1].taskHours[0]).toEqual({taskId:1000,sourceCaseId:100,sourceContractId:10,contractId:20,personId:6,estimatedHours:'10.00',days:['5.25',null,'0.00',null,null]});
        expect(codes(r)).not.toContain('TIME_PERIOD_UNRESOLVED');expect(r.units[1].state).toBe('ANALYZED');
        expect(JSON.stringify(s)).toBe(before);expect(r.transferReady).toBe(false);
    });
    it('rejects invalid hours rather than silently coercing them',()=>{
        const s=fixture();s.rows.Tasks=[{...task(),HoursMon:'NaN'}];expect(codes(Effects.analyze(request(),s))).toContain('INVALID_HOURS');
    });
    it('joins parent/child and process/task dependencies and blocks inconsistent targets',()=>{
        const s=fixture();s.rows.Cases.push({Id:101,MilestoneId:1,TypeId:51,ParentCaseId:100,GdFolderId:'mock:child'},
            {Id:201,MilestoneId:2,TypeId:51,ParentCaseId:200,GdFolderId:'mock:child-dest'});
        s.rows.Tasks=[task(1000,101)];s.rows.ProcessInstances=[{Id:70,CaseId:100,TaskId:1000}];
        const r=Effects.analyze(request(),s);expect(r.units[1].sourceCaseIds).toEqual([100,101]);
        expect(codes(r)).toContain('PROCESS_TARGET_MISMATCH');expect(r.totals.tasks).toBe(1);
    });
    it('joins several sources mapped to one target, deduplicating only identical letter edges',()=>{
        const s=fixture();s.rows.Cases.push({...s.rows.Cases[0],Id:101,GdFolderId:'mock:source-2'});
        s.rows.Letters_Cases=[{LetterId:5,CaseId:100,EditorId:1},{LetterId:5,CaseId:101,EditorId:2},{LetterId:6,CaseId:101},{LetterId:6,CaseId:200}];
        const r=Effects.analyze(request(),s);expect(r.units[1].sourceCaseIds).toEqual([100,101]);
        expect(r.letterEdges.map(e=>e.action)).toEqual(['REPARENT_EDGE','DEDUPLICATE_EXACT_EDGE','DEDUPLICATE_EXACT_EDGE']);
        expect(r.totals.relations).toBe(3);expect(r.letterEdges[1].sourceEdge.EditorId).toBe(2);
    });
    it('keeps an independent group analyzed when another has invalid hours',()=>{
        const s=fixture();s.rows.CaseTypes.push({Id:52,MilestoneTypeId:5,IsUniquePerMilestone:0,IsSubCaseOnly:0});
        s.rows.Cases.push({Id:102,MilestoneId:1,TypeId:52,ParentCaseId:null,GdFolderId:'mock:other'},
            {Id:202,MilestoneId:2,TypeId:52,ParentCaseId:null,GdFolderId:'mock:other-dest'});s.rows.Tasks=[{...task(),HoursMon:'NaN'}];
        const r=Effects.analyze(request(),s);expect(r.units.find(u=>u.sourceCaseIds.includes(102))?.state).toBe('ANALYZED');
        expect(r.units.find(u=>u.sourceCaseIds.includes(100))?.state).toBe('BLOCKED');
    });
    it('joins a destination process through its source task and a step letter linked to another source case',()=>{
        const s=fixture();s.rows.CaseTypes.push({Id:52,MilestoneTypeId:5,IsUniquePerMilestone:0,IsSubCaseOnly:0});
        s.rows.Cases.push({Id:102,MilestoneId:1,TypeId:52,ParentCaseId:null,GdFolderId:'mock:other'},
            {Id:202,MilestoneId:2,TypeId:52,ParentCaseId:null,GdFolderId:'mock:other-dest'});
        s.rows.Tasks=[task()];s.rows.ProcessInstances=[{Id:70,CaseId:200,TaskId:1000}];
        s.rows.ProcessesStepsInstances=[{Id:80,ProcessInstanceId:70,OurLetterId:5}];s.rows.Letters_Cases=[{LetterId:5,CaseId:102}];
        const r=Effects.analyze(request(),s);expect(r.units[1].sourceCaseIds).toEqual([100,102]);
        expect(r.units[1].counts.processes).toBe(1);expect(codes(r)).not.toContain('PROCESS_TARGET_MISMATCH');
    });
    it('proposes next root number using the current trigger and detects collation-equivalent names',()=>{
        const s=fixture();const q=request();q.mappings=[{sourceCaseId:100,target:{mode:'create',caseTypeId:50,name:'CEL ',parentSourceCaseId:null}}];
        const r=Effects.analyze(q,s);expect(r.numbers[0].number).toBe(5);expect(codes(r)).toContain('NAME_CONFLICT');
        expect(codes(r)).not.toContain('NUMBERING_SCHEMA_UNVERIFIED');
    });
    it('blocks missing comparison evidence and changed trigger/unique index',()=>{
        const s=fixture();const q=request();q.mappings=[{sourceCaseId:100,target:{mode:'create',caseTypeId:50,name:'Nowa',parentSourceCaseId:null}}];
        s.caseTriggers[0].ACTION_STATEMENT='CHANGED';s.nameWeights=[];
        expect(codes(Effects.analyze(q,s))).toEqual(expect.arrayContaining(['NUMBERING_SCHEMA_UNVERIFIED','NAME_COMPARISON_UNVERIFIED']));
        const changed=fixture();changed.indexes.push({TABLE_NAME:'cases',INDEX_NAME:'new_unique',NON_UNIQUE:0,SEQ_IN_INDEX:1,COLUMN_NAME:'Description'});
        expect(codes(Effects.analyze(q,changed))).toContain('NUMBERING_SCHEMA_UNVERIFIED');
    });
    it('allocates distinct numbers across multiple new cases in a deterministic order',()=>{
        const s=fixture();s.rows.Cases.push({...s.rows.Cases[0],Id:101});s.nameWeights.push({name:'Druga',weight:'druga'});
        const q=request();q.mappings=[{sourceCaseId:101,target:{mode:'create',caseTypeId:50,name:'Druga',parentSourceCaseId:null}},
            {sourceCaseId:100,target:{mode:'create',caseTypeId:50,name:'Nowa',parentSourceCaseId:null}}];
        expect(Effects.analyze(q,s).numbers.map(n=>n.number)).toEqual([5,6]);
    });
    it('proposes a subcase number within its mapped parent, keeping the trigger type-wide number separate',()=>{
        const s=fixture();s.rows.Cases.push({Id:101,MilestoneId:1,TypeId:51,ParentCaseId:100,Number:2,SubCaseNumber:1,GdFolderId:'mock:child'},
            {Id:201,MilestoneId:2,TypeId:51,ParentCaseId:200,Number:7,SubCaseNumber:2,Name:'Cel',GdFolderId:'mock:other-child'});
        const q=request();q.mappings=[{sourceCaseId:101,target:{mode:'create',caseTypeId:51,name:'Nowa',parentSourceCaseId:100}}];
        expect(Effects.analyze(q,s).numbers.find(n=>n.sourceCaseId===101)).toMatchObject({number:8,subCaseNumber:3,parentKey:'existing:200'});
    });
    it('does not invent numbers after a prefix-index or generated-parent change',()=>{
        const s=fixture(),q=request();q.mappings=[{sourceCaseId:100,target:{mode:'create',caseTypeId:50,name:'Nowa',parentSourceCaseId:null}}];
        s.parentScopeExpression='ifnull(ParentCaseId,99)';expect(codes(Effects.analyze(q,s))).toContain('NUMBERING_SCHEMA_UNVERIFIED');
        expect(Effects.analyze(q,s).numbers[0].number).toBeNull();
        const prefix=fixture();prefix.indexes.find(i=>i.COLUMN_NAME==='Name')!.SUB_PART=5;
        expect(codes(Effects.analyze(q,prefix))).toContain('NUMBERING_SCHEMA_UNVERIFIED');
    });
    it('blocks names which the database cannot store and number overflow',()=>{
        const s=fixture(),q=request();s.rows.Cases[1].Number=2147483647;
        q.mappings=[{sourceCaseId:100,target:{mode:'create',caseTypeId:50,name:'😀',parentSourceCaseId:null}}];
        expect(codes(Effects.analyze(q,s))).toEqual(expect.arrayContaining(['INVALID_NAME','NUMBER_CONFLICT']));
    });
    it('blocks an unavailable case type even with an existing matching destination',()=>{
        const s=fixture();s.rows.CaseTypes[0].MilestoneTypeId=999;
        expect(codes(Effects.analyze(request(),s))).toContain('TYPE_UNAVAILABLE');
    });
    it('shows an existing number collision even after explicit target selection',()=>{
        const s=fixture();s.rows.Cases.push({...s.rows.Cases[1],Id:201,Name:'Inny'});
        const q=request();q.mappings=[{sourceCaseId:100,target:{mode:'existing',caseId:200}}];
        expect(codes(Effects.analyze(q,s))).toContain('NUMBER_CONFLICT');
    });
    it('detects case and root folder aliases with surviving objects, without treating partial scope as complete',()=>{
        const s=fixture();s.folderReferences=[{table:'Cases',key:'200',milestoneId:2,field:'GdFolderId',folderId:'mock:source'},
            {table:'Projects',key:'7',milestoneId:null,field:'GdFolderId',folderId:'mock:root-source'}];
        const r=Effects.analyze(request(),s);expect(codes(r).filter(c=>c==='FOLDER_ALIAS')).toHaveLength(2);
        expect(r.folderPairs[0]).toMatchObject({aliasConflict:true,globalAliasCheckComplete:false});
    });
    it('flags missing destination folders and retains explicit create as pending',()=>{
        const s=fixture();s.rows.Cases[1].GdFolderId='';expect(codes(Effects.analyze(request(),s))).toContain('FOLDER_NOT_READY');
    });
    it('preserves recipient/file JSON and blocks malformed or unhandled embedded business references',()=>{
        const s=fixture();s.rows.Letters_Cases=[{LetterId:5,CaseId:100}];
        s.rows.LetterEvents=[{Id:9,LetterId:5,GdFilesJSON:'[{"id":"mock:doc"}]',RecipientsJSON:'[{"id":6}]'}];
        expect(codes(Effects.analyze(request(),s))).not.toContain('INVALID_REFERENCE_JSON');
        s.rows.LetterEvents[0].GdFilesJSON='[{"caseId":100}]';expect(codes(Effects.analyze(request(),s))).toContain('UNHANDLED_REFERENCE');
        s.rows.LetterEvents[0].GdFilesJSON='{';expect(codes(Effects.analyze(request(),s))).toContain('INVALID_REFERENCE_JSON');
        s.rows.LetterEvents[0].GdFilesJSON='[{"nested":{"\\u0063ase_id":100}}]';expect(codes(Effects.analyze(request(),s))).toContain('UNHANDLED_REFERENCE');
        s.rows.LetterEvents[0].GdFilesJSON='null';expect(codes(Effects.analyze(request(),s))).not.toContain('INVALID_REFERENCE_JSON');
    });
    it('blocks unknown FK and new JSON columns even when their table is empty',()=>{
        const s=fixture();s.foreignKeys.push({TABLE_NAME:'NewRef',COLUMN_NAME:'Object',REFERENCED_TABLE_NAME:'cases',REFERENCED_COLUMN_NAME:'Id'});
        expect(codes(Effects.analyze(request(),s))).toContain('UNHANDLED_REFERENCE');
        s.columns.push({TABLE_NAME:'cases',COLUMN_NAME:'LinksJSON'});expect(codes(Effects.analyze(request(),s))).toContain('UNHANDLED_REFERENCE');
    });
    it('rejects foreign ownership and source already shared; never copies legal ownership',()=>{
        const s=fixture();s.rows.MilestoneContractLinks=[{MilestoneId:1,ContractId:20,OperationId:null}];
        s.rows.Securities=[{Id:8,CaseId:100,ContractId:10,Value:'123.45'}];
        const before=JSON.stringify(s.rows.Securities);expect(codes(Effects.analyze(request(),s))).toContain('SOURCE_ALREADY_SHARED');
        expect(JSON.stringify(s.rows.Securities)).toBe(before);s.rows.Contracts[1].ProjectOurId='FOREIGN';
        expect(codes(Effects.analyze(request(),s))).toContain('CROSS_PROJECT');
    });
    it('keeps old links as evidence and proposes redirects instead of rewriting text',()=>{
        const s=fixture();s.rows.Cases[0].Description='https://example.test/cases/100';const r=Effects.analyze(request(),s);
        expect(r.textReferences).toHaveLength(1);expect(r.redirects).toContainEqual({entity:'Cases',sourceId:100,targetKey:'existing:200'});
        expect(r.notes.find(n=>n.entity==='Cases')!.record.Description).toBe(s.rows.Cases[0].Description);
    });
});

export {fixture,request};
