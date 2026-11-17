import Repository, { ContentRow, SqlContentSnapshot } from '../ConsolidationReadRepository';
import Coverage from '../ConsolidationReadCoverage';

const schemaEdges = [
    ['Cases', 'MilestoneId', 'Milestones'], ['Cases', 'ParentCaseId', 'Cases'],
    ['Tasks', 'CaseId', 'Cases'], ['Tasks_Watchers', 'TaskId', 'Tasks'],
    ['Letters_Cases', 'CaseId', 'Cases'], ['Letters_Cases', 'LetterId', 'Letters'],
    ['LetterEvents', 'LetterId', 'Letters'], ['Letters_Entities', 'LetterId', 'Letters'],
    ['ProcessInstances', 'CaseId', 'Cases'], ['ProcessInstances', 'TaskId', 'Tasks'],
    ['ProcessesStepsInstances', 'ProcessInstanceId', 'ProcessInstances'],
    ['ProcessesStepsInstances', 'OurLetterId', 'Letters'], ['Risks', 'CaseId', 'Cases'],
    ['Securities', 'CaseId', 'Cases'], ['MeetingArrangements', 'CaseId', 'Cases'],
    ['MilestoneDates', 'MilestoneId', 'Milestones'], ['MilestoneContractLinks', 'MilestoneId', 'Milestones'],
    ['MilestoneSharingState', 'MilestoneId', 'Milestones'], ['CaseTypeFolders', 'MilestoneId', 'Milestones'],
];
const metadata = () => schemaEdges.map(([TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME]) =>
    ({ TABLE_NAME: TABLE_NAME.toLowerCase(), COLUMN_NAME, REFERENCED_TABLE_NAME: REFERENCED_TABLE_NAME.toLowerCase(), REFERENCED_COLUMN_NAME: 'Id' }));
const empty = (): SqlContentSnapshot => ({ projectOurId: 'P', rows: {Cases: [], Tasks: [], ProcessInstances: []},
    columns: metadata(), foreignKeys: metadata(), indexes: [], boundaryReferences: 0 });

describe('SQL coverage, never transfer readiness', () => {
    it('accepts both Windows lowercase and original metadata without claiming application coverage', () => {
        const snapshot = empty();
        for (const row of snapshot.foreignKeys) row.TABLE_NAME = String(row.TABLE_NAME).toUpperCase();
        expect(Coverage.inspect(snapshot)).toMatchObject({ blockers: [], transferReady: false, applicationReferencesVerified: false });
    });
    it('blocks unknown FK with an arbitrary column name', () => {
        const snapshot = empty();
        snapshot.foreignKeys.push({ TABLE_NAME: 'NewAudit', COLUMN_NAME: 'Object', REFERENCED_TABLE_NAME: 'Cases', REFERENCED_COLUMN_NAME: 'Id' });
        expect(Coverage.inspect(snapshot).blockers).toContainEqual({code:'UNHANDLED_REFERENCE',reference:'newaudit.object'});
    });
    it('blocks unknown application reference without FK even in an empty table', () => {
        const snapshot = empty();
        snapshot.columns.push({TABLE_NAME:'NewQueue',COLUMN_NAME:'TaskId'});
        expect(Coverage.inspect(snapshot).blockers).toContainEqual({code:'UNHANDLED_REFERENCE',reference:'newqueue.taskid'});
    });
    it('does not accept a known column referencing a different parent key', () => {
        const snapshot = empty(); snapshot.foreignKeys[0].REFERENCED_COLUMN_NAME = 'OtherId';
        expect(Coverage.inspect(snapshot).blockers).toContainEqual({code:'UNHANDLED_REFERENCE',reference:'cases.milestoneid'});
    });
    it('blocks missing application-managed reference metadata', () => {
        const snapshot = empty(); snapshot.columns.pop();
        expect(Coverage.inspect(snapshot).blockers).toContainEqual({code:'SCHEMA_REFERENCE_MISSING',reference:'casetypefolders.milestoneid'});
    });
    it('flags incoming and outgoing boundaries without returning foreign content', () => {
        const snapshot = empty(); snapshot.boundaryReferences = 2;
        snapshot.rows.Cases.push({Id:1,ParentCaseId:999});
        snapshot.rows.ProcessInstances.push({Id:2,TaskId:999});
        expect(Coverage.inspect(snapshot).blockers).toHaveLength(3);
    });
    it('keeps entity counts distinct from edge counts', () => {
        const snapshot = empty(); snapshot.rows.Tasks = [{Id:1}];
        snapshot.rows.Tasks_Watchers = [{TaskId:1,PersonId:1},{TaskId:1,PersonId:2}];
        expect(Coverage.inspect(snapshot).rowCounts).toMatchObject({Tasks:1,Tasks_Watchers:2});
    });
});

describe('read repository', () => {
    const longText = 'ąść źródło '.repeat(10000);
    function fixture() {
        const data: Record<string, ContentRow[]> = {
            Projects:[{Id:7,OurId:'P'}], Contracts:[{Id:10,ProjectOurId:'P'}],
            Milestones:[{Id:20,ContractId:10,TypeId:5,Description:longText}],
            Cases:[{Id:30,MilestoneId:20,TypeId:4,Description:longText,ParentCaseId:null}],
            Tasks:[{Id:40,CaseId:30,Description:longText,HoursMon:5,EstimatedHours:9}],
            Tasks_Watchers:[{TaskId:40,PersonId:1},{TaskId:40,PersonId:2}],
            Letters_Cases:[{LetterId:50,CaseId:30}], Letters:[{Id:50,ProjectId:7,Description:longText}],
            LetterEvents:[{Id:60,LetterId:50,GdFilesJSON:'[{"id":"mock:doc"}]',Description:longText}],
            ProcessInstances:[{Id:70,CaseId:30,TaskId:40}], ProcessesStepsInstances:[{Id:80,ProcessInstanceId:70,OurLetterId:50}],
            Risks:[{Id:90,CaseId:30,ProjectOurId:'P',AdditionalActionsDescription:longText}],
            Securities:[{Id:91,CaseId:30,ContractId:11,Value:'123.45'}],
            MilestoneDates:[{Id:92,MilestoneId:20}], CaseTypeFolders:[{MilestoneId:20,CaseTypeId:4,GdFolderId:'mock:folder'}],
        };
        const query = jest.fn(async (options: { sql: string; dateStrings: boolean }, args: unknown[] = []) => {
            const sql = options.sql;
            expect(options.dateStrings).toBe(true);
            if (!/^SELECT\s/.test(sql)) throw new Error('Mutation forbidden');
            if (sql.includes('information_schema.COLUMNS')) return [metadata()];
            if (sql.includes('information_schema.KEY_COLUMN_USAGE')) return [metadata()];
            if (sql.includes('information_schema.STATISTICS')) return [[{INDEX_NAME:'unique-name',COLUMN_NAME:'Name'}]];
            if (sql.includes('COUNT(*)')) return [[{n:0}]];
            const table = sql.match(/FROM (\w+)/)![1];
            return [data[table] || []];
        });
        return {data,query,conn:{query} as any};
    }
    it('reads full records without GROUP_CONCAT, pagination, truncation or cross-product counts', async () => {
        const {query,conn} = fixture();
        const snapshot = await new Repository().read('P',[20],conn);
        expect(snapshot.rows.Cases[0].Description).toBe(longText);
        expect(snapshot.rows.LetterEvents[0].GdFilesJSON).toBe('[{"id":"mock:doc"}]');
        expect(snapshot.rows.Tasks[0]).toMatchObject({HoursMon:5,EstimatedHours:9});
        expect(snapshot.rows.Securities[0]).toMatchObject({ContractId:11,Value:'123.45'});
        expect(Coverage.inspect(snapshot)).toMatchObject({blockers:[],rowCounts:{Tasks:1,Tasks_Watchers:2,Letters:1}});
        expect(query.mock.calls.every(([options]) => !/GROUP_CONCAT|LIMIT|SUBSTRING|LEFT\(/i.test(options.sql))).toBe(true);
        expect(query.mock.calls.find(([options])=>options.sql.includes('m.Id IN'))![1]).toEqual(['P',[20]]);
        expect(query.mock.calls.find(([options])=>options.sql.includes('FROM Letters WHERE'))![1]).toEqual([7,[50]]);
    });
    it('rejects a foreign or missing milestone before fetching its subtree', async () => {
        const {data,query,conn} = fixture(); data.Milestones = [];
        await expect(new Repository().read('P',[999],conn)).rejects.toThrow('READ_SCOPE_NOT_FOUND');
        expect(query).toHaveBeenCalledTimes(2);
    });
    it('requires every requested milestone, accepting repeated IDs only once', async () => {
        const {conn} = fixture();
        await expect(new Repository().read('P',[20,21],conn)).rejects.toThrow('READ_SCOPE_NOT_FOUND');
        await expect(new Repository().read('P',[20,20],conn)).resolves.toHaveProperty('projectOurId','P');
    });
    it.each([[],[0],[-1],[1.1],[NaN]].map(ids => ({ids})))('rejects invalid scope $ids without SQL', async ({ids}) => {
        const {query,conn} = fixture();
        await expect(new Repository().read('P',ids as number[],conn)).rejects.toThrow('INVALID_READ_SCOPE');
        expect(query).not.toHaveBeenCalled();
    });
    it('does not issue IN () for an empty milestone and retains its metadata', async () => {
        const {data,query,conn} = fixture(); data.Cases=[]; data.Tasks=[];
        const snapshot = await new Repository().read('P',[20],conn);
        expect(snapshot.rows.Tasks).toEqual([]);
        expect(snapshot.rows.MilestoneDates).toHaveLength(1);
        expect(query.mock.calls.some(([options])=>options.sql.includes('FROM ProcessInstances'))).toBe(false);
    });
    it('does not turn SQL errors into an empty successful inventory', async () => {
        const {query,conn} = fixture(); query.mockRejectedValueOnce(new Error('READ_FAILED'));
        await expect(new Repository().read('P',[20],conn)).rejects.toThrow('READ_FAILED');
    });
    it('flags unavailable/out-of-project letters instead of treating them as absent', async () => {
        const {data,conn} = fixture(); data.Letters=[];
        const snapshot = await new Repository().read('P',[20],conn);
        expect(snapshot.boundaryReferences).toBe(1);
        expect(snapshot.rows.LetterEvents).toEqual([]);
    });
});

describe('optional signing modules preserve letter identity',()=>{
    it.each(['DocumentSignatures','SigningJobs'])('accepts only the known %s LetterId to Letters.Id edge',table=>{
        const snapshot=empty();const edge={TABLE_NAME:table,COLUMN_NAME:'LetterId',REFERENCED_TABLE_NAME:'Letters',REFERENCED_COLUMN_NAME:'Id',ORDINAL_POSITION:1};
        snapshot.columns.push(edge);snapshot.foreignKeys.push(edge);
        expect(Coverage.inspect(snapshot).blockers).toEqual([]);
        edge.REFERENCED_COLUMN_NAME='OtherId';
        expect(Coverage.inspect(snapshot).blockers).toContainEqual({code:'UNHANDLED_REFERENCE',reference:table.toLowerCase()+'.letterid'});
    });
    it('does not require signing tables on older installations',()=>expect(Coverage.inspect(empty()).blockers).toEqual([]));
    it.each(['DocumentSignatures','SigningJobs'])('still rejects an unexpected case dependency in %s',table=>{
        const snapshot=empty();snapshot.columns.push({TABLE_NAME:table,COLUMN_NAME:'CaseId'});
        expect(Coverage.inspect(snapshot).blockers).toContainEqual({code:'UNHANDLED_REFERENCE',reference:table.toLowerCase()+'.caseid'});
    });
});
