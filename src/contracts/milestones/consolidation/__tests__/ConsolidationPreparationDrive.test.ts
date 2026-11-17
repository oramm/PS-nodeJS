const mockFiles = { generateIds: jest.fn(), get: jest.fn(), create: jest.fn() };
jest.mock('googleapis', () => ({ google: { drive: () => ({ files: mockFiles }) } }));
import Drive from '../ConsolidationPreparationDrive';
import Repository from '../ConsolidationPreparationRepository';

it('reserves a Drive file ID usable for a folder without transport retries', async () => {
    mockFiles.generateIds.mockResolvedValue({ data: { ids: ['reserved'] } });
    expect(await Drive.reserve({} as any)).toBe('reserved');
    expect(mockFiles.generateIds).toHaveBeenCalledWith({count:1,space:'drive',type:'files'}, {timeout:30000,retry:false});
});
it('creates the exact preallocated folder with parent and ownership marker', async () => {
    await Drive.create({} as any,'reserved','parent','name','owner');
    expect(mockFiles.create).toHaveBeenCalledWith({supportsAllDrives:true,fields:'id',requestBody:{id:'reserved',name:'name',
        parents:['parent'],mimeType:'application/vnd.google-apps.folder',appProperties:{psConsolidationPreparation:'owner'}}},
    {timeout:30000,retry:false});
});
it('propagates an uncertain create response without a replacement ID or hidden retry', async () => {
    mockFiles.create.mockRejectedValueOnce(new Error('lost response'));
    await expect(Drive.create({} as any,'same-id','parent','name','owner')).rejects.toThrow('lost response');
    expect(mockFiles.generateIds).not.toHaveBeenCalled();
});
it('requests metadata needed to distinguish a folder, shortcut, moved, trashed and foreign object', async () => {
    mockFiles.get.mockResolvedValue({data:{id:'id'}}); await Drive.get({} as any,'id');
    expect(mockFiles.get.mock.calls[0][0]).toEqual({fileId:'id',supportsAllDrives:true,
        fields:'id,name,mimeType,parents,trashed,appProperties,capabilities(canAddChildren)'});
});
it('checks all recorded folder columns, including unknown tables, without reading their content',async()=>{
    const known=['Projects','Contracts','Milestones','Cases','Letters','CaseTypeFolders'];
    const queries:string[]=[];
    const conn:any={query:jest.fn(async(sql:string,values:any[])=>{
        queries.push(sql);
        if(sql.startsWith('SELECT TABLE_NAME')) return [[...known.map(TABLE_NAME=>({TABLE_NAME,COLUMN_NAME:'GdFolderId'})),
            {TABLE_NAME:'Contracts',COLUMN_NAME:'MeetingProtocolsGdFolderId'}, {TABLE_NAME:'Offers',COLUMN_NAME:'GdFolderId'}]];
        expect(values.every(v=>v==='folder')).toBe(true);
        if(sql.includes('FROM `Offers`'))return [[{n:1}]];
        return [[]];
    })};
    expect(await new Repository().aliases('folder',conn)).toEqual([{table:'Offers',key:'*'}]);
    expect(queries.find(q=>q.includes('FROM Contracts'))).toContain('`GdFolderId`=? OR `MeetingProtocolsGdFolderId`=?');
    expect(queries.find(q=>q.includes('FROM `Offers`'))).toContain('COUNT(*)');
});

it.each([0, 1])('checks bare FolderId in an unrelated module, including alias count %i', async (count) => {
    // Matches local metadata after the funding module added FundingFolderIntents.FolderId.
    const known = ['Projects', 'Contracts', 'Milestones', 'Cases', 'Letters', 'CaseTypeFolders'];
    const conn: any = { query: jest.fn(async (sql: string, values: any[]) => {
        if (sql.startsWith('SELECT TABLE_NAME')) return [[...known.map(TABLE_NAME => ({ TABLE_NAME, COLUMN_NAME: 'GdFolderId' })),
            { TABLE_NAME: 'fundingfolderintents', COLUMN_NAME: 'FolderId' }]];
        expect(values).toEqual(['folder']);
        if (sql.includes('FROM `fundingfolderintents`')) return [[{ n: count }]];
        return [[]];
    }) };
    expect(await new Repository().aliases('folder', conn)).toEqual(count ? [{ table: 'fundingfolderintents', key: '*' }] : []);
    expect(conn.query).toHaveBeenCalledWith('SELECT COUNT(*) AS n FROM `fundingfolderintents` WHERE `FolderId`=?', ['folder']);
});
it.each(['`FolderId', 'FolderId;DROP', '1FolderId'])('rejects an unsafe folder column %s before interpolation', async (column) => {
    const known = ['Projects', 'Contracts', 'Milestones', 'Cases', 'Letters', 'CaseTypeFolders'];
    const conn: any = { query: jest.fn(async (sql: string) => sql.startsWith('SELECT TABLE_NAME')
        ? [[...known.map(TABLE_NAME => ({ TABLE_NAME, COLUMN_NAME: 'GdFolderId' })), { TABLE_NAME: 'FundingFolderIntents', COLUMN_NAME: column }]]
        : [[]]) };
    await expect(new Repository().aliases('folder', conn)).rejects.toThrow('UNVERIFIED_FOLDER_SCHEMA');
    expect(conn.query.mock.calls.slice(1).every(([sql]: [string]) => !sql.includes(column))).toBe(true);
});
it('still refuses an incomplete global folder inventory', async () => {
    const conn: any = { query: jest.fn(async () => [[{ TABLE_NAME: 'Cases', COLUMN_NAME: 'FolderId' }]]) };
    await expect(new Repository().aliases('folder', conn)).rejects.toThrow('UNVERIFIED_FOLDER_SCHEMA');
    expect(conn.query).toHaveBeenCalledTimes(1);
});
