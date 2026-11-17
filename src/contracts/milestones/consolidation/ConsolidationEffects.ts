import Mapping, { MappingRequest } from './ConsolidationMapping';
import Validator from './ConsolidationMappingValidator';
import Coverage from './ConsolidationReadCoverage';
import Numbering from './ConsolidationNumbering';
import type { EffectsSnapshot } from './ConsolidationEffectsRepository';
import type { ContentRow } from './ConsolidationReadRepository';

type Conflict = { code: string; sourceCaseId: number | null; reference: string };
type Note = { entity: string; sourceId: number; sourceContractId: number; record: ContentRow };
const number = (value: unknown) => Number(value);
const contentTables = ['Cases','Tasks','Tasks_Watchers','Letters_Cases','ProcessInstances','ProcessesStepsInstances',
    'Risks','Securities','MeetingArrangements','Meetings','ContractMeetingNotes','Letters','LetterEvents','Letters_Entities','MilestoneDates','CaseTypeFolders'];

/** Internal, immutable impact analysis. No unit here authorizes a transfer or folder deletion. */
export default class ConsolidationEffects {
    static analyze(input: MappingRequest, snapshot: EffectsSnapshot) {
        const request=Validator.request(input);
        const rows=(table:string)=>snapshot.rows[table]||[];
        const source=rows('Milestones').find(m=>number(m.Id)===request.sourceMilestoneId);
        const destination=rows('Milestones').find(m=>number(m.Id)===request.destinationMilestoneId);
        if(!source||!destination)throw new Error('READ_SCOPE_NOT_FOUND');
        const conflicts:Conflict[]=[];
        const block=(code:string,sourceCaseId:number|null=null,reference='')=>{
            if(!conflicts.some(c=>c.code===code&&c.sourceCaseId===sourceCaseId&&c.reference===reference))
                conflicts.push({code,sourceCaseId,reference});
        };
        const sourceCases=rows('Cases').filter(c=>number(c.MilestoneId)===request.sourceMilestoneId);
        const targetCases=rows('Cases').filter(c=>number(c.MilestoneId)===request.destinationMilestoneId);
        const caseIds=new Set(sourceCases.map(c=>number(c.Id)));
        const taskById=new Map(rows('Tasks').map(t=>[number(t.Id),t]));
        const tasks=rows('Tasks').filter(t=>caseIds.has(number(t.CaseId)));
        const taskIds=new Set(tasks.map(t=>number(t.Id)));
        const sourceContractId=number(source.ContractId), accountingContractId=number(destination.ContractId);
        for(const m of [source,destination]) {
            const contract=rows('Contracts').find(c=>number(c.Id)===number(m.ContractId));
            if(!contract||contract.ProjectOurId!==snapshot.projectOurId||m.OfferId!=null)block('CROSS_PROJECT');
        }
        if(number(source.TypeId)!==number(destination.TypeId))block('TYPE_MISMATCH');
        const sourceContract=rows('Contracts').find(c=>number(c.Id)===sourceContractId);
        if(!rows('MilestoneTypes_ContractTypes').some(a=>number(a.MilestoneTypeId)===number(destination.TypeId)&&number(a.ContractTypeId)===number(sourceContract?.TypeId)))
            block('TYPE_UNAVAILABLE');
        if(rows('MilestoneContractLinks').some(l=>number(l.MilestoneId)===request.sourceMilestoneId))block('SOURCE_ALREADY_SHARED');
        if(rows('MilestoneContractLinks').some(l=>l.OperationId!=null))block('OPERATION_IN_PROGRESS');
        for(const c of Coverage.inspect(snapshot).blockers)block(c.code,null,c.reference);

        const mapCase=(c:ContentRow)=>({id:number(c.Id),milestoneId:number(c.MilestoneId),caseTypeId:number(c.TypeId),parentCaseId:c.ParentCaseId==null?null:number(c.ParentCaseId)});
        const types=rows('CaseTypes').map(t=>({id:number(t.Id),isUniquePerMilestone:!!number(t.IsUniquePerMilestone),isSubCaseOnly:!!number(t.IsSubCaseOnly),
            allowedSubCaseTypeIds:rows('CaseType_SubCaseTypes').filter(r=>number(r.ParentCaseTypeId)===number(t.Id)).map(r=>number(r.SubCaseTypeId))}));
        const mappings=Mapping.resolve(request,sourceCases.map(mapCase),targetCases.map(mapCase),types);
        for(const m of mappings)for(const code of m.conflictCodes)block(code,m.sourceCaseId);
        for(const c of sourceCases) {
            const type=rows('CaseTypes').find(t=>number(t.Id)===number(c.TypeId));
            if(type?.MilestoneTypeId!=null && number(type.MilestoneTypeId)!==number(destination.TypeId))block('TYPE_UNAVAILABLE',number(c.Id));
        }
        const numbers=Numbering.propose(snapshot,request.sourceMilestoneId,request.destinationMilestoneId,mappings);
        for(const n of numbers)for(const code of n.conflictCodes)block(code,n.sourceCaseId);
        const targetKeys=new Map(numbers.map(n=>[n.sourceCaseId,n.targetKey]));

        const parents=new Map([...caseIds].map(id=>[id,id]));
        const root=(id:number):number=>{let r=id;while(parents.get(r)!==r)r=parents.get(r)!;return r;};
        const join=(a:number,b:number)=>{if(caseIds.has(a)&&caseIds.has(b)){const x=root(a),y=root(b);parents.set(Math.max(x,y),Math.min(x,y));}};
        for(const c of sourceCases)if(c.ParentCaseId!=null)join(number(c.Id),number(c.ParentCaseId));
        const byTarget=new Map<string,number>();
        for(const [id,key] of targetKeys){const previous=byTarget.get(key);if(previous!==undefined)join(previous,id);else byTarget.set(key,id);}
        const letterCases=new Map<number,number[]>();
        for(const edge of rows('Letters_Cases').filter(e=>caseIds.has(number(e.CaseId)))) {
            const id=number(edge.LetterId);letterCases.set(id,[...(letterCases.get(id)||[]),number(edge.CaseId)]);
        }
        for(const list of letterCases.values())for(const id of list.slice(1))join(list[0],id);
        const processes=rows('ProcessInstances').filter(p=>caseIds.has(number(p.CaseId))||taskIds.has(number(p.TaskId)));
        for(const process of processes) {
            const caseId=number(process.CaseId),task=taskById.get(number(process.TaskId));
            if(process.TaskId!=null) {
                if(!task)block('DEPENDENCY_OUTSIDE_READ_SCOPE',caseIds.has(caseId)?caseId:null,`ProcessInstances:${process.Id}`);
                else {
                    join(caseId,number(task.CaseId));
                    const caseTarget=targetKeys.get(caseId)||`existing:${caseId}`;
                    const taskTarget=targetKeys.get(number(task.CaseId))||`existing:${task.CaseId}`;
                    if(caseTarget!==taskTarget)block('PROCESS_TARGET_MISMATCH',caseIds.has(caseId)?caseId:number(task.CaseId),`ProcessInstances:${process.Id}`);
                }
            }
            for(const step of rows('ProcessesStepsInstances').filter(s=>number(s.ProcessInstanceId)===number(process.Id)))
                for(const linkedCase of letterCases.get(number(step.OurLetterId))||[])
                    join(caseIds.has(caseId)?caseId:number(task?.CaseId),linkedCase);
        }
        // Shared source folders are a single dependency group, not independently removable folders.
        const sourceFolders=new Map<string,number>();
        for(const c of sourceCases)if(typeof c.GdFolderId==='string'&&c.GdFolderId){
            const previous=sourceFolders.get(c.GdFolderId);if(previous!==undefined)join(previous,number(c.Id));else sourceFolders.set(c.GdFolderId,number(c.Id));
        }

        const classification:{table:string;policy:string;count:number;scope:string}[]=[];
        const policy:Record<string,string>={Cases:'MAP_AND_PRESERVE_SOURCE_SNAPSHOT',Tasks:'REPARENT_SAME_ID_KEEP_HOURS',Tasks_Watchers:'KEEP_TASK_ID',
            Letters_Cases:'REPARENT_AND_DEDUPLICATE_EXACT_EDGE',ProcessInstances:'REPARENT_WITH_TASK',ProcessesStepsInstances:'KEEP_IDS_AND_LETTER',
            Risks:'REPARENT_KEEP_PROJECT',Securities:'REPARENT_KEEP_LEGAL_CONTRACT',MeetingArrangements:'REPARENT_KEEP_MEETING',
            Meetings:'KEEP_MEETING_AND_LEGAL_CONTRACT',ContractMeetingNotes:'KEEP_NOTE_AND_PROTOCOL',
            Letters:'KEEP_ID_AND_CONTENT',LetterEvents:'KEEP_ID_JSON_AND_CONTENT',Letters_Entities:'KEEP_LETTER_EDGE',
            MilestoneDates:'PRESERVE_SOURCE_SNAPSHOT',CaseTypeFolders:'MANUAL_DRIVE_NO_MOVE'};
        for(const table of contentTables)classification.push({table,policy:policy[table],count:rows(table).length,scope:'SOURCE_AND_DESTINATION_READ'});
        for(const risk of rows('Risks').filter(r=>caseIds.has(number(r.CaseId))))
            if(risk.ProjectOurId!==snapshot.projectOurId)block('CROSS_PROJECT',number(risk.CaseId),`Risks:${risk.Id}`);
        for(const security of rows('Securities').filter(s=>caseIds.has(number(s.CaseId))))
            if(!rows('Contracts').some(c=>number(c.Id)===number(security.ContractId)))block('DEPENDENCY_OUTSIDE_READ_SCOPE',number(security.CaseId),`Securities:${security.Id}`);

        const applicationReferences=[
            {surface:'CaseEvents',policy:'DERIVED_FROM_LETTERS_AND_MEETING_ARRANGEMENTS'},
            {surface:'RiskReactions',policy:'TASKS_NOT_EXTRA_ENTITIES'},
            {surface:'MilestoneSharingRequests',policy:'PRESERVE_AUDIT_AND_OLD_IDS; CONTENT_NOT_ENUMERATED'},
            {surface:'MilestoneConsolidationPreviews',policy:'PRESERVE_SNAPSHOT_AND_OLD_IDS; CONTENT_NOT_ENUMERATED'},
            {surface:'MilestoneConsolidationNotes',policy:'PRESERVE_FULL_TRANSFER_NOTES_AND_OLD_IDS; CONTENT_NOT_ENUMERATED'},
            {surface:'MilestoneConsolidationBatches',policy:'PRESERVE_FULL_BATCH_AUDIT; CONTENT_NOT_ENUMERATED'},
            {surface:'MilestoneConsolidationOperations',policy:'PRESERVE_OPERATION_STATE_AND_OLD_IDS; CONTENT_NOT_ENUMERATED'},
            {surface:'URL/sessionStorage/ScrumSheet/SB',policy:'PRESERVE_ARCHIVES; ACCESS_CONTROLLED_REDIRECTS_REQUIRED'},
        ];
        const textReferences:{table:string;id:unknown;field:string;value:string}[]=[];
        for(const [table,records] of Object.entries(snapshot.rows)) {
            for(const column of snapshot.columns.filter(c=>String(c.TABLE_NAME).toLowerCase()===table.toLowerCase())) {
                const field=String(column.COLUMN_NAME);
                if(/json|payload|result/i.test(field) && !(table==='LetterEvents'&&['GdFilesJSON','RecipientsJSON'].includes(field)))
                    block('UNHANDLED_REFERENCE',null,`${table}.${field}`);
            }
            for(const row of records) for(const [field,value] of Object.entries(row)) {
                if(typeof value!=='string')continue;
                if(/(?:case|task|milestone)s?(?:id)?[=/][0-9]+/i.test(value))textReferences.push({table,id:row.Id,field,value});
                if(table==='LetterEvents'&&['GdFilesJSON','RecipientsJSON'].includes(field)&&value) {
                    const affected=letterCases.get(number(row.LetterId))||[];
                    const bad=(code:string)=>affected.length?affected.forEach(id=>block(code,id,`${table}:${row.Id}:${field}`)):block(code,null,`${table}:${row.Id}:${field}`);
                    try {
                        const parsed:unknown=JSON.parse(value);
                        if(parsed!==null && (!Array.isArray(parsed)||parsed.some(item=>!item||typeof item!=='object'||Array.isArray(item))))bad('INVALID_REFERENCE_JSON');
                        // Files and recipients keep their IDs. Embedded business IDs have no approved rewrite policy.
                        const pending:unknown[]=[parsed];
                        while(pending.length) {
                            const item=pending.pop();if(!item||typeof item!=='object')continue;
                            for(const [key,nested] of Object.entries(item)) {
                                if(/^(?:case|milestone|task|parentcase)(?:s|ids?)?$/.test(key.replace(/[^a-z]/gi,'').toLowerCase()))bad('UNHANDLED_REFERENCE');
                                if(nested&&typeof nested==='object')pending.push(nested);
                            }
                        }
                    }catch{bad('INVALID_REFERENCE_JSON');}
                }
            }
        }
        const taskHours=tasks.map(t=>{
            const days=['HoursMon','HoursTue','HoursWed','HoursThu','HoursFri'].map(field=>t[field]??null);
            if(days.some(v=>v!==null && !/^\d+(?:\.\d{1,2})?$/.test(String(v))))block('INVALID_HOURS',number(t.CaseId),`Tasks:${t.Id}`);
            // Existing counters follow the task; consolidation does not introduce period accounting.
            return {taskId:number(t.Id),sourceCaseId:number(t.CaseId),sourceContractId,contractId:accountingContractId,
                personId:t.OwnerId==null?null:number(t.OwnerId),days,estimatedHours:t.EstimatedHours??null};
        });
        const removedReference=(ref:EffectsSnapshot['folderReferences'][number])=>ref.milestoneId===request.sourceMilestoneId;
        const folderPairs=mappings.map(m=>{
            const c=sourceCases.find(c=>number(c.Id)===m.sourceCaseId)!;
            const target=m.target?.mode==='existing'?targetCases.find(t=>number(t.Id)===(m.target as {caseId:number}).caseId):undefined;
            const sourceFolderId=typeof c.GdFolderId==='string'?c.GdFolderId:'';
            const destinationFolderId=typeof target?.GdFolderId==='string'?target.GdFolderId:null;
            const aliases=sourceFolderId?snapshot.folderReferences.filter(r=>r.folderId===sourceFolderId&&!removedReference(r)):[];
            if(aliases.length)block('FOLDER_ALIAS',m.sourceCaseId,sourceFolderId);
            if(!sourceFolderId||!destinationFolderId)block('FOLDER_NOT_READY',m.sourceCaseId);
            return {sourceCaseId:m.sourceCaseId,destinationCaseId:target?number(target.Id):null,sourceFolderId,destinationFolderId,
                aliasConflict:aliases.length>0,aliases,verificationScope:snapshot.folderReferenceScope,globalAliasCheckComplete:false};
        });
        const sourceRootFolder=typeof source.GdFolderId==='string'?source.GdFolderId:'';
        if(!sourceRootFolder||!destination.GdFolderId)block('FOLDER_NOT_READY',null,'Milestones');
        const rootAliases=sourceRootFolder?snapshot.folderReferences.filter(r=>r.folderId===sourceRootFolder&&!removedReference(r)):[];
        if(rootAliases.length)block('FOLDER_ALIAS',null,sourceRootFolder);
        for(const folder of rows('CaseTypeFolders').filter(f=>number(f.MilestoneId)===request.sourceMilestoneId))
            if(folder.GdFolderId && snapshot.folderReferences.some(r=>r.folderId===folder.GdFolderId&&!removedReference(r)))
                block('FOLDER_ALIAS',null,`CaseTypeFolders:${folder.CaseTypeId}`);

        const notes:Note[]=[{entity:'Milestones',sourceId:number(source.Id),sourceContractId,record:{...source}},
            ...sourceCases.map(c=>({entity:'Cases',sourceId:number(c.Id),sourceContractId,record:{...c}})),
            ...rows('MilestoneDates').filter(d=>number(d.MilestoneId)===request.sourceMilestoneId).map(d=>({entity:'MilestoneDates',sourceId:number(d.Id),sourceContractId,record:{...d}}))];
        const edgeEffects=rows('Letters_Cases').filter(e=>caseIds.has(number(e.CaseId))).map(e=>{
            const targetKey=targetKeys.get(number(e.CaseId))!;
            const exists=rows('Letters_Cases').some(d=>number(d.LetterId)===number(e.LetterId)&&`existing:${d.CaseId}`===targetKey);
            return {sourceCaseId:number(e.CaseId),letterId:number(e.LetterId),targetKey,existingDestinationEdge:exists,sourceEdge:{...e}};
        });
        const resultingEdges=new Set<string>();
        const letterEdges=edgeEffects.sort((a,b)=>a.sourceCaseId-b.sourceCaseId||a.letterId-b.letterId).map(e=>{
            const key=`${e.letterId}:${e.targetKey}`,deduplicate=e.existingDestinationEdge||resultingEdges.has(key);resultingEdges.add(key);
            return {...e,action:deduplicate?'DEDUPLICATE_EXACT_EDGE':'REPARENT_EDGE'};
        });
        const groups=new Map<number,number[]>();for(const id of [...caseIds].sort((a,b)=>a-b)){const key=root(id);groups.set(key,[...(groups.get(key)||[]),id]);}
        const units=[...groups].map(([key,ids])=>{
            const ownTasks=tasks.filter(t=>ids.includes(number(t.CaseId)));
            const tids=new Set(ownTasks.map(t=>number(t.Id)));
            const unitConflicts=conflicts.filter(c=>c.sourceCaseId===null||ids.includes(c.sourceCaseId));
            const associations=letterEdges.filter(e=>ids.includes(e.sourceCaseId)).length+rows('Tasks_Watchers').filter(w=>tids.has(number(w.TaskId))).length;
            return {unitKey:`cases:${key}`,sourceCaseIds:ids,taskIds:[...tids].sort((a,b)=>a-b),state:unitConflicts.length?'BLOCKED' as const:'ANALYZED' as const,
                conflicts:unitConflicts,counts:{tasks:ownTasks.length,relations:associations,notes:ids.length,
                    processes:processes.filter(p=>ids.includes(number(p.CaseId))||tids.has(number(p.TaskId))).length,
                    risks:rows('Risks').filter(r=>ids.includes(number(r.CaseId))).length,
                    securities:rows('Securities').filter(s=>ids.includes(number(s.CaseId))).length,
                    meetingArrangements:rows('MeetingArrangements').filter(a=>ids.includes(number(a.CaseId))).length},
                taskHours:taskHours.filter(h=>ids.includes(h.sourceCaseId))};
        });
        const globalConflicts=conflicts.filter(c=>c.sourceCaseId===null);
        const metadataUnit={unitKey:`milestone:${source.Id}`,sourceCaseIds:[] as number[],taskIds:[] as number[],
            state:globalConflicts.length?'BLOCKED' as const:'ANALYZED' as const,conflicts:globalConflicts,
            counts:{tasks:0,relations:0,notes:notes.length-sourceCases.length,processes:0,risks:0,securities:0,meetingArrangements:0},taskHours:[] as typeof taskHours};
        const allUnits=[metadataUnit,...units];
        return {stage:'IMPACT_ANALYSIS_ONLY' as const,transferReady:false as const,sourceContractId,accountingContractId,
            mappings,numbers,units:allUnits,conflicts,classification,applicationReferences,textReferences,folderPairs,
            milestoneFolderPair:{sourceFolderId:sourceRootFolder,destinationFolderId:destination.GdFolderId??null,aliases:rootAliases,globalAliasCheckComplete:false},
            notes,letterEdges,redirects:[{entity:'Milestones',sourceId:number(source.Id),targetKey:`existing:${destination.Id}`},
                ...numbers.map(n=>({entity:'Cases',sourceId:n.sourceCaseId,targetKey:n.targetKey}))],
            totals:{tasks:tasks.length,relations:units.reduce((sum,u)=>sum+u.counts.relations,0),notes:notes.length,
                analyzedUnits:allUnits.filter(u=>u.state==='ANALYZED').length,blockedUnits:allUnits.filter(u=>u.state==='BLOCKED').length},
            requirements:['AUTHORIZED_DURABLE_PREVIEW','TRANSFER_PRESERVE_HOURS_AND_REDIRECTS','FULL_FOLDER_ALIAS_CHECK_BEFORE_FINALIZATION',
                'AUDIT_AND_EXTERNAL_ARCHIVES_PRESERVED_WITHOUT_REWRITE'],
            destinationFieldsPolicy:'KEEP_DESCRIPTION_STATUS_DATES_AND_LEGAL_CONTRACTS'};
    }
}
