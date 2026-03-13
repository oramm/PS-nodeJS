import ContractOur from '../ContractOur';
import ContractOther from '../ContractOther';
import ToolsGd from '../../tools/ToolsGd';

describe('Contract folder structure', () => {
    const mockAuth = { mocked: true } as any;

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('creates meeting notes folder inside ContractOur root folder', async () => {
        const setFolderSpy = jest
            .spyOn(ToolsGd, 'setFolder')
            .mockResolvedValueOnce({ id: 'contract-folder-1' } as any)
            .mockResolvedValueOnce({ id: 'meeting-folder-1' } as any);
        const contract = new ContractOur({
            ourId: 'WAW.UR.001',
            alias: 'Alpha',
            number: '001',
            name: 'Test contract',
            status: 'Aktywny',
            comment: '',
            _type: { id: 1, name: 'UR', isOur: true },
            _project: { id: 1, ourId: 'PRJ-1', gdFolderId: 'project-folder-1' },
        } as any);

        await contract.createFolders(mockAuth);

        expect(setFolderSpy).toHaveBeenNthCalledWith(1, mockAuth, {
            parentId: 'project-folder-1',
            name: 'WAW.UR.001 Alpha',
        });
        expect(setFolderSpy).toHaveBeenNthCalledWith(2, mockAuth, {
            parentId: 'contract-folder-1',
            name: 'Notatki ze spotkań',
        });
        expect(contract.gdFolderId).toBe('contract-folder-1');
        expect(contract.meetingProtocolsGdFolderId).toBe('meeting-folder-1');
    });

    it('creates meeting notes folder inside ContractOther root folder', async () => {
        const setFolderSpy = jest
            .spyOn(ToolsGd, 'setFolder')
            .mockResolvedValueOnce({ id: 'contract-folder-2' } as any)
            .mockResolvedValueOnce({ id: 'meeting-folder-2' } as any)
            .mockResolvedValueOnce({ id: 'materials-folder-2' } as any);
        const contract = new ContractOther({
            alias: 'Beta',
            number: 'RB-12',
            name: 'Roboty budowlane',
            status: 'Aktywny',
            comment: '',
            _type: { id: 2, name: 'RB', isOur: false },
            _project: { id: 1, ourId: 'PRJ-1', gdFolderId: 'project-folder-1' },
            _ourContract: { id: 11, ourId: 'WAW.UR.010', gdFolderId: 'our-root-11' },
        } as any);

        await contract.createFolders(mockAuth);

        expect(setFolderSpy).toHaveBeenNthCalledWith(1, mockAuth, {
            parentId: 'our-root-11',
            name: 'RB-12 Beta',
        });
        expect(setFolderSpy).toHaveBeenNthCalledWith(2, mockAuth, {
            parentId: 'contract-folder-2',
            name: 'Notatki ze spotkań',
        });
        expect(setFolderSpy).toHaveBeenNthCalledWith(3, mockAuth, {
            parentId: 'contract-folder-2',
            name: 'Wnioski Materiałowe',
        });
        expect(contract.gdFolderId).toBe('contract-folder-2');
        expect(contract.meetingProtocolsGdFolderId).toBe('meeting-folder-2');
    });
});
