/**
 * Guard chroniący folder GD przed skasowaniem przy rollbacku.
 *
 * Regresja: dwa żądania dodania tej samej sprawy trafiały przez ToolsGd.setFolder
 * na ten sam folder (dopasowanie po nazwie). Rollback drugiego kasował folder
 * sprawy zapisanej przez pierwsze.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import CasesController from '../CasesController';

jest.mock('../../../../tools/ToolsDb');
jest.mock('../../../../tools/ToolsSheets');
jest.mock('../../../../tools/ToolsMail');

const deleteFolderIfUnusedInDb = (
    CasesController as any
).deleteFolderIfUnusedInDb.bind(CasesController);

describe('CasesController.deleteFolderIfUnusedInDb()', () => {
    let caseItem: any;

    beforeEach(() => {
        caseItem = { gdFolderId: 'folder-1', deleteFolder: jest.fn() };
    });

    it('NIE kasuje folderu, gdy wskazuje na niego sprawa w DB', async () => {
        const repository = { countCasesWithGdFolder: jest.fn(async () => 1) };

        await deleteFolderIfUnusedInDb(caseItem, {} as any, repository);

        expect(caseItem.deleteFolder).not.toHaveBeenCalled();
    });

    it('kasuje osierocony folder (zwykły duplikat - zachowanie jak dotąd)', async () => {
        const repository = { countCasesWithGdFolder: jest.fn(async () => 0) };

        await deleteFolderIfUnusedInDb(caseItem, {} as any, repository);

        expect(caseItem.deleteFolder).toHaveBeenCalledTimes(1);
    });
});
