jest.mock('googleapis', () => ({ google: { drive: jest.fn() } }));
import { google } from 'googleapis';
import Drive from '../MilestoneShortcutDrive';

it('uses shortcut-specific IDs and supports Shared Drives with ownership metadata', async () => {
    const api = { generateIds: jest.fn().mockResolvedValue({ data: { ids: ['id'] } }),
        create: jest.fn().mockResolvedValue({}), get: jest.fn().mockResolvedValue({ data: { id: 'id' } }) };
    (google.drive as jest.Mock).mockReturnValue({ files: api });
    const auth = {} as any;
    expect(await Drive.reserve(auth)).toBe('id');
    await Drive.create(auth, 'id', 'source', 'parent', 'name', '10:2');
    await Drive.get(auth, 'id');
    expect(api.generateIds).toHaveBeenCalledWith({ count: 1, space: 'drive', type: 'shortcuts' }, { timeout: 30000, retry: false });
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ supportsAllDrives: true,
        requestBody: expect.objectContaining({ id: 'id', parents: ['parent'],
            shortcutDetails: { targetId: 'source' }, appProperties: { psMilestoneLink: '10:2' } }) }), { timeout: 30000, retry: false });
    expect(api.get).toHaveBeenCalledWith(expect.objectContaining({ fileId: 'id', supportsAllDrives: true,
        fields: expect.stringContaining('appProperties') }), { timeout: 30000, retry: false });
});

it('trashes exactly the supplied ID with bounded transport and never deletes the target', async () => {
    const update = jest.fn().mockResolvedValue({});
    (google.drive as jest.Mock).mockReturnValue({ files: { update } });
    await Drive.trash({} as any, 'owned-shortcut');
    expect(update).toHaveBeenCalledWith({ fileId: 'owned-shortcut', supportsAllDrives: true,
        fields: 'id', requestBody: { trashed: true } }, { timeout: 30000, retry: false });
});
