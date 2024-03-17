import { IncomingLetterOfferData } from '../../types/types';
import IncomingLetterGdController from './IncomingLetterGdController';

export default class IncomingLetterOfferGdController extends IncomingLetterGdController {
    makeParentFolderGdId(letterData: IncomingLetterOfferData): string {
        if (!letterData._cases[0].gdFolderId)
            throw new Error('Letter folder gdId is not defined');
        return letterData._cases[0].gdFolderId;
    }
}
