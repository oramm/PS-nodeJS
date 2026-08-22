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
            _contractors: [{ id: 1, name: 'ENVI SC', shortName: 'ENVI' }],
        } as any);

        await contract.createFolders(mockAuth);

        expect(setFolderSpy).toHaveBeenNthCalledWith(1, mockAuth, {
            parentId: 'our-root-11',
            name: 'K Beta ENVI',
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

    it('generates ContractOther folder name without entity shortName when contractor has none', () => {
        const contract = new ContractOther({
            alias: 'Beta',
            number: 'RB-12',
            name: 'Roboty budowlane',
            status: 'Aktywny',
            comment: '',
            _type: { id: 2, name: 'RB', isOur: false },
            _project: { id: 1, ourId: 'PRJ-1', gdFolderId: 'project-folder-1' },
            _contractors: [{ id: 1, name: 'ENVI SC' }],
        } as any);

        expect(contract._folderName).toBe('K Beta');
    });

    it('generates ContractOther folder name without alias when alias is missing', () => {
        const contract = new ContractOther({
            number: 'RB-12',
            name: 'Roboty budowlane',
            status: 'Aktywny',
            comment: '',
            _type: { id: 2, name: 'RB', isOur: false },
            _project: { id: 1, ourId: 'PRJ-1', gdFolderId: 'project-folder-1' },
            _contractors: [{ id: 1, name: 'ENVI SC', shortName: 'ENVI' }],
        } as any);

        expect(contract._folderName).toBe('K ENVI');
    });

    /**
     * Konsorcjum BEZ wskazanego lidera: folder nazwał człowiek po liderze, a reguła
     * nazewnicza bierze pierwszego wykonawcę z listy i bez znacznika nie wie, kto nim
     * jest. Zapis kontraktu nie może wtedy przemianować takiego folderu. Para testów,
     * bo sam brak wywołania niczego nie dowodzi - przypadek z jednym wykonawcą pokazuje,
     * że zmiana nazwy w ogóle działa.
     *
     * Przypadek konsorcjum ZE wskazanym liderem (wariant (b) decyzji `G-LDR-5`, gdzie
     * przemianowanie jest dozwolone) siedzi razem z resztą lidera w ContractLeader.test.ts.
     */
    describe('editFolder rename guard', () => {
        const makeContractOther = (contractors: any[]) =>
            new ContractOther({
                id: 1767,
                alias: 'Z.2 OŚII',
                number: '3/ZP/2024',
                name: 'Roboty budowlane',
                status: 'Aktywny',
                comment: '',
                gdFolderId: 'contract-folder-1767',
                _type: { id: 2, name: 'RB', isOur: false },
                _project: {
                    id: 1,
                    ourId: 'PRJ-1',
                    gdFolderId: 'project-folder-1',
                },
                _contractors: contractors,
            } as any);

        beforeEach(() => {
            jest.spyOn(
                ToolsGd,
                'getFileOrFolderMetaDataById'
            ).mockResolvedValue({
                id: 'contract-folder-1767',
                name: 'K Z.2 OŚII WUPRINZ',
            } as any);
        });

        it('does not rename an existing folder when the contract has several contractors and no leader', async () => {
            const updateFolderSpy = jest
                .spyOn(ToolsGd, 'updateFolder')
                .mockResolvedValue({} as any);
            const contract = makeContractOther([
                { id: 537, name: 'Terlan S.A.', shortName: 'Terlan S.A.' },
                { id: 265, name: 'WUPRINŻ S.A.', shortName: 'WUPRINZ' },
            ]);

            await contract.editFolder({} as any);

            expect(updateFolderSpy).not.toHaveBeenCalled();
        });

        it('renames an existing folder when the contract has a single contractor', async () => {
            const updateFolderSpy = jest
                .spyOn(ToolsGd, 'updateFolder')
                .mockResolvedValue({} as any);
            const contract = makeContractOther([
                { id: 265, name: 'WUPRINŻ S.A.', shortName: 'WUPRINZ' },
            ]);

            await contract.editFolder({} as any);

            expect(updateFolderSpy).toHaveBeenCalledWith(expect.anything(), {
                id: 'contract-folder-1767',
                name: 'K Z.2 OŚII WUPRINZ',
            });
        });
    });
});
