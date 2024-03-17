import { LetterData, OurLetterOfferData } from '../../types/types';
import OurLetterGdController from './OurLetterGdController';

export default class OurLetterOfferGdController extends OurLetterGdController {
    static makeFolderName(number: string, creationDate: string): string {
        let folderName: string = super.makeFolderName(number, creationDate);
        return (folderName += ': Wychodzące');
    }

    static makeParentFolderGdId(letterData: OurLetterOfferData): string {
        if (!letterData._cases[0].gdFolderId)
            throw new Error('Letter folder gdId is not defined');
        return letterData._cases[0].gdFolderId;
    }
}
