import { createHash } from 'crypto';
import type { EffectsSnapshot } from './ConsolidationEffectsRepository';
import type { MappingResult } from './ConsolidationMapping';
import type { ContentRow } from './ConsolidationReadRepository';

export type NumberProposal = { sourceCaseId: number; number: number | null; subCaseNumber: number | null;
    name: string | null; targetKey: string; parentKey: string | null; conflictCodes: string[] };
const triggerHashes: Record<string, string> = {
    'INSERT:BEFORE': 'dc55be407b3623a0f6c80e59f1ee7f47e0571ca8a44b0a6e6ab0a393e8f6722d',
    'UPDATE:BEFORE': '02e178dce58439ce8c7ce62a8cae9ecdc39e0094c1fe284dfc35d6104a8a09ea',
};

export default class ConsolidationNumbering {
    static propose(snapshot: EffectsSnapshot, sourceId: number, destinationId: number, mappings: readonly MappingResult[]): NumberProposal[] {
        const all = snapshot.rows.Cases;
        const destination = all.filter(c => Number(c.MilestoneId) === destinationId);
        const sources = all.filter(c => Number(c.MilestoneId) === sourceId).sort((a,b) => Number(a.Id)-Number(b.Id));
        const types = new Map(snapshot.rows.CaseTypes.map(t => [Number(t.Id),t]));
        const weights = new Map(snapshot.nameWeights.map(n => [n.name,n.weight]));
        const selected = new Map(mappings.map(m => [m.sourceCaseId,m]));
        const proposals = new Map<number,NumberProposal>();
        const rows: (ContentRow & {key:string;parentKey:string|null})[] = destination.map(c => ({ ...c, key:`existing:${c.Id}`, parentKey:c.ParentCaseId == null ? null : `existing:${c.ParentCaseId}` }));
        const triggersKnown = snapshot.caseTriggers.length === 2 && snapshot.caseTriggers.every(t =>
            createHash('sha256').update(String(t.ACTION_STATEMENT).replace(/\s+/g,' ').trim().toLowerCase()).digest('hex') ===
                triggerHashes[`${t.EVENT_MANIPULATION}:${t.ACTION_TIMING}`]);
        const uniqueIndexes = new Map<string, ContentRow[]>();
        for (const idx of snapshot.indexes.filter(i=>String(i.TABLE_NAME).toLowerCase()==='cases' && Number(i.NON_UNIQUE)===0)) {
            const key=String(idx.INDEX_NAME); uniqueIndexes.set(key,[...(uniqueIndexes.get(key)||[]),idx]);
        }
        const signatures=[...uniqueIndexes.values()].map(list=>list.sort((a,b)=>Number(a.SEQ_IN_INDEX)-Number(b.SEQ_IN_INDEX)).map(i=>i.COLUMN_NAME).join(',')).sort();
        const schemaKnown = JSON.stringify(signatures)===JSON.stringify(['Id','Name,TypeId,MilestoneId,ParentCaseIdForUnique','ParentCaseId,SubCaseNumber'].sort()) &&
            [...uniqueIndexes.values()].flat().every(i=>i.SUB_PART==null) &&
            /^(?:ifnull|coalesce)\(parentcaseid,0\)$/.test(snapshot.parentScopeExpression.replace(/[\s`]/g,'').toLowerCase()) &&
            snapshot.columns.some(c=>String(c.TABLE_NAME).toLowerCase()==='cases' && c.COLUMN_NAME==='Name' && c.COLUMN_TYPE==='varchar(200)' && c.COLLATION_NAME==='utf8mb3_polish_ci');
        const pending = new Set<number>();
        const resolve = (source: ContentRow): NumberProposal => {
            const id=Number(source.Id), prior=proposals.get(id); if(prior) return prior;
            const mapping=selected.get(id), target=mapping?.target;
            const result: NumberProposal={sourceCaseId:id,number:null,subCaseNumber:null,name:null,targetKey:`unresolved:${id}`,parentKey:null,conflictCodes:[]};
            proposals.set(id,result);
            if (!target || mapping?.state==='BLOCKED') { result.conflictCodes.push('INVALID_MAPPING'); return result; }
            if(target.mode==='existing') {
                const row=destination.find(c=>Number(c.Id)===target.caseId);
                if(!row){result.conflictCodes.push('INVALID_MAPPING');return result;}
                Object.assign(result,{number:row.Number??null,subCaseNumber:row.SubCaseNumber??null,name:row.Name??null,
                    targetKey:`existing:${row.Id}`,parentKey:row.ParentCaseId == null ? null : `existing:${row.ParentCaseId}`});
                const collides=destination.some(other=>other.Id!==row.Id && (row.ParentCaseId==null
                    ? other.ParentCaseId==null && row.Number!=null && Number(other.TypeId)===Number(row.TypeId) && Number(other.Number)===Number(row.Number)
                    : other.ParentCaseId===row.ParentCaseId && row.SubCaseNumber!=null && Number(other.SubCaseNumber)===Number(row.SubCaseNumber)));
                if(collides)result.conflictCodes.push('NUMBER_CONFLICT');
                return result;
            }
            result.targetKey=`create:${id}`; result.name=target.name==='' ? null : target.name;
            if(!triggersKnown || !schemaKnown) result.conflictCodes.push('NUMBERING_SCHEMA_UNVERIFIED');
            const type=types.get(Number(source.TypeId));
            if(!type || (type.MilestoneTypeId != null && Number(type.MilestoneTypeId)!==Number(snapshot.rows.Milestones.find(m=>Number(m.Id)===destinationId)?.TypeId)))
                result.conflictCodes.push('TYPE_UNAVAILABLE');
            if(result.name!==null && ([...result.name].length>200 || [...result.name].some(ch=>ch.codePointAt(0)!>0xffff)))
                result.conflictCodes.push('INVALID_NAME');
            pending.add(id);
            if(target.parentSourceCaseId!==null) {
                const parent=sources.find(c=>Number(c.Id)===target.parentSourceCaseId);
                if(!parent || pending.has(Number(parent.Id))) result.conflictCodes.push('INVALID_PARENT_MAPPING');
                else { const p=resolve(parent);result.parentKey=p.targetKey;if(p.conflictCodes.length)result.conflictCodes.push('INVALID_PARENT_MAPPING'); }
            }
            pending.delete(id);
            if(triggersKnown && schemaKnown && type && !Number(type.IsUniquePerMilestone)) {
                const numbers=rows.filter(c=>Number(c.TypeId)===Number(source.TypeId)).map(c=>c.Number).filter(n=>n!=null).map(Number);
                result.number=numbers.reduce((max,n)=>Math.max(max,n),0)+1;
                if(!Number.isSafeInteger(result.number)||result.number>2147483647)result.conflictCodes.push('NUMBER_CONFLICT');
            }
            if(result.parentKey && triggersKnown && schemaKnown) {
                result.subCaseNumber=rows.filter(c=>c.parentKey===result.parentKey).reduce((max,c)=>Math.max(max,Number(c.SubCaseNumber)||0),0)+1;
                if(!Number.isSafeInteger(result.subCaseNumber)||result.subCaseNumber>2147483647)result.conflictCodes.push('NUMBER_CONFLICT');
            }
            if(result.name!==null) {
                const weight=weights.get(result.name);
                if(weight===undefined)result.conflictCodes.push('NAME_COMPARISON_UNVERIFIED');
                for(const row of rows.filter(c=>Number(c.TypeId)===Number(source.TypeId) && c.parentKey===result.parentKey && c.Name!=null)) {
                    const other=weights.get(String(row.Name));
                    if(other===undefined)result.conflictCodes.push('NAME_COMPARISON_UNVERIFIED');
                    else if(other===weight)result.conflictCodes.push('NAME_CONFLICT');
                }
            }
            rows.push({...source,Id:null,MilestoneId:destinationId,Name:result.name,Number:result.number,SubCaseNumber:result.subCaseNumber,
                key:result.targetKey,parentKey:result.parentKey});
            result.conflictCodes=[...new Set(result.conflictCodes)];return result;
        };
        return sources.map(resolve);
    }
}
