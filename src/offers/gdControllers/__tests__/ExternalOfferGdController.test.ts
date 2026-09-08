jest.mock('../../../tools/ToolsGd');
jest.mock('../../../contracts/milestones/cases/CasesController');

import ToolsGd from '../../../tools/ToolsGd';
import ExternalOfferGdController from '../ExternalOfferGdController';

const auth = {} as any;
const offerData = { gdFolderId: 'folder-oferty' } as any;

describe('ExternalOfferGdController.createExternalOfferFolders', () => {
    beforeEach(() => {
        // setFolder oddaje metadane Drive'a proszone tylko o id - bez pola parents.
        (ToolsGd.setFolder as jest.Mock).mockImplementation(
            async (_auth, params: { name: string }) => ({
                id: `id-${params.name}`,
            })
        );
    });

    it('oddaje foldery z wypełnionym folderem nadrzędnym, gotowe do przeniesienia', async () => {
        const controller = new ExternalOfferGdController();

        const { offerContentFolder, specsFolder } =
            await controller.createExternalOfferFolders(auth, offerData);

        expect(offerContentFolder).toEqual({
            id: 'id-SWZ',
            parents: ['folder-oferty'],
        });
        expect(specsFolder).toEqual({
            id: 'id-Oferta',
            parents: ['folder-oferty'],
        });
    });
});
