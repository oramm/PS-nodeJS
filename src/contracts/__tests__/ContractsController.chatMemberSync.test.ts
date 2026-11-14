/**
 * DOSTEP-2 (poprawki po przeglądzie): przeniesienie kontraktu do innego projektu i usunięcie kontraktu
 * wyrównują skład pokoi Chat - przeniesienie obu projektów, usunięcie projektu kontraktu.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../tools/ToolsDb');
jest.mock('../../tools/ToolsGd');
jest.mock('../../projects/ProjectRepository');
jest.mock('../chatSpaces/ChatSpacesController', () => ({
    __esModule: true,
    default: { withMemberSync: jest.fn(async (_projects: any, work: any) => work()) },
}));

import ToolsDb from '../../tools/ToolsDb';
import ProjectRepository from '../../projects/ProjectRepository';
import ChatSpacesController from '../chatSpaces/ChatSpacesController';
import ContractsController from '../ContractsController';

const withMemberSync = ChatSpacesController.withMemberSync as unknown as jest.Mock<any>;

describe('ContractsController - wyrównanie pokoi Chat', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (ToolsDb.transaction as jest.Mock<any>).mockImplementation(async (cb: any) => cb({ execute: jest.fn() }));
    });

    it('przeniesienie do innego projektu: stary i nowy projekt, zapis w bazie wewnątrz wyrównania', async () => {
        const contract: any = { id: 5, ourId: 'A.01', projectOurId: 'A', gdFolderId: 'f', editInScrum: jest.fn(async () => undefined) };
        jest.spyOn(ContractsController, 'find').mockResolvedValue([contract]);
        (ProjectRepository.prototype.find as jest.Mock<any>).mockImplementation(async (conds: any) =>
            [{ ourId: conds[0].ourId, gdFolderId: `gd-${conds[0].ourId}` }]);
        await ContractsController.moveToProject(5, 'B', {} as any);
        expect(withMemberSync).toHaveBeenCalledTimes(1);
        expect(withMemberSync.mock.calls[0][0]).toEqual(['A', 'B']);
        expect(ToolsDb.transaction).toHaveBeenCalledTimes(1);
    });

    it('usunięcie kontraktu: projekt kontraktu', async () => {
        jest.spyOn(ContractsController as any, 'withAuth').mockImplementation(async () => 'usunięty');
        await expect(ContractsController.deleteWithAuth({ projectOurId: 'A' } as any)).resolves.toBe('usunięty');
        expect(withMemberSync.mock.calls[0][0]).toEqual(['A']);
    });
});
