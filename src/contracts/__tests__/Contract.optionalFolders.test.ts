/**
 * TESTY dla wyboru folderów opcjonalnych w Contract.createFolders().
 *
 * Brak argumentu = twórz wszystko (zachowanie sprzed drzewa struktury; z tej
 * ścieżki korzysta też odtworzenie folderu w Contract.editFolder()).
 */

import ContractOur from '../ContractOur';
import ContractOther from '../ContractOther';
import ToolsGd from '../../tools/ToolsGd';

describe('Contract.createFolders() - foldery opcjonalne', () => {
    const mockAuth = { mocked: true } as any;

    const ourContract = () =>
        new ContractOur({
            ourId: 'WAW.UR.001',
            alias: 'Alpha',
            number: '001',
            name: 'Test contract',
            status: 'Aktywny',
            comment: '',
            _type: { id: 1, name: 'UR', isOur: true },
            _project: { id: 1, ourId: 'PRJ-1', gdFolderId: 'project-folder-1' },
        } as any);

    const otherContract = () =>
        new ContractOther({
            alias: 'Beta',
            number: 'RB-12',
            name: 'Roboty budowlane',
            status: 'Aktywny',
            comment: '',
            _type: { id: 2, name: 'RB', isOur: false },
            _project: { id: 1, ourId: 'PRJ-1', gdFolderId: 'project-folder-1' },
            _ourContract: {
                id: 11,
                ourId: 'WAW.UR.010',
                gdFolderId: 'our-root-11',
            },
            _contractors: [{ id: 1, name: 'ENVI SC', shortName: 'ENVI' }],
        } as any);

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('bez argumentu tworzy komplet folderów umowy zewnętrznej', async () => {
        const setFolderSpy = jest
            .spyOn(ToolsGd, 'setFolder')
            .mockResolvedValueOnce({ id: 'contract-folder' } as any)
            .mockResolvedValueOnce({ id: 'meeting-folder' } as any)
            .mockResolvedValueOnce({ id: 'materials-folder' } as any);

        const contract = otherContract();
        await contract.createFolders(mockAuth);

        expect(setFolderSpy).toHaveBeenCalledTimes(3);
        expect(contract.meetingProtocolsGdFolderId).toBe('meeting-folder');
        expect(contract.materialCardsGdFolderId).toBe('materials-folder');
    });

    it('pusta lista tworzy wyłącznie folder główny umowy', async () => {
        const setFolderSpy = jest
            .spyOn(ToolsGd, 'setFolder')
            .mockResolvedValueOnce({ id: 'contract-folder' } as any);

        const contract = otherContract();
        await contract.createFolders(mockAuth, []);

        expect(setFolderSpy).toHaveBeenCalledTimes(1);
        expect(contract.gdFolderId).toBe('contract-folder');
        // Kolumny zostają puste - ToolsDb pomija undefined przy INSERT
        expect(contract.meetingProtocolsGdFolderId).toBeUndefined();
        expect(contract.materialCardsGdFolderId).toBeUndefined();
    });

    it('wybór częściowy pomija Wnioski Materiałowe', async () => {
        const setFolderSpy = jest
            .spyOn(ToolsGd, 'setFolder')
            .mockResolvedValueOnce({ id: 'contract-folder' } as any)
            .mockResolvedValueOnce({ id: 'meeting-folder' } as any);

        const contract = otherContract();
        await contract.createFolders(mockAuth, ['MEETING_PROTOCOLS']);

        expect(setFolderSpy).toHaveBeenCalledTimes(2);
        expect(contract.meetingProtocolsGdFolderId).toBe('meeting-folder');
        expect(contract.materialCardsGdFolderId).toBeUndefined();
    });

    it('wybór samych Wniosków Materiałowych pomija notatki ze spotkań', async () => {
        const setFolderSpy = jest
            .spyOn(ToolsGd, 'setFolder')
            .mockResolvedValueOnce({ id: 'contract-folder' } as any)
            .mockResolvedValueOnce({ id: 'materials-folder' } as any);

        const contract = otherContract();
        await contract.createFolders(mockAuth, ['MATERIAL_CARDS']);

        expect(setFolderSpy).toHaveBeenNthCalledWith(2, mockAuth, {
            parentId: 'contract-folder',
            name: 'Wnioski Materiałowe',
        });
        expect(contract.meetingProtocolsGdFolderId).toBeUndefined();
        expect(contract.materialCardsGdFolderId).toBe('materials-folder');
    });

    it('umowa ENVI ignoruje klucz MATERIAL_CARDS - nie ma takiego folderu', async () => {
        const setFolderSpy = jest
            .spyOn(ToolsGd, 'setFolder')
            .mockResolvedValueOnce({ id: 'contract-folder' } as any);

        const contract = ourContract();
        await contract.createFolders(mockAuth, ['MATERIAL_CARDS']);

        expect(setFolderSpy).toHaveBeenCalledTimes(1);
        expect(contract.meetingProtocolsGdFolderId).toBeUndefined();
    });
});
