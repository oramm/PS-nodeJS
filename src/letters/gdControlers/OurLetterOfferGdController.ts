import { OurLetterOfferData } from '../../types/types';
import OurLetterGdController from './OurLetterGdController';

export default class OurLetterOfferGdController extends OurLetterGdController {
    makeParentFolderGdId(letterData: OurLetterOfferData): string {
        if (!letterData._cases[0].gdFolderId)
            throw new Error('Letter folder gdId is not defined');
        return letterData._cases[0].gdFolderId;
    }
}
