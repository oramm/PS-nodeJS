import { LetterData, OurLetterContractData } from '../../types/types';
import LetterGdController from './LetterGdController';

export default class OurLetterContractGdController extends LetterGdController {
    static makeFolderName(number: string, creationDate: string): string {
        let folderName: string = super.makeFolderName(number, creationDate);
        return (folderName += ': Wychodzące');
    }

    static makeParentFolderGdId(letterData: OurLetterContractData): string {
        if (!letterData._project.gdFolderId)
            throw new Error('Project gdFolderId is not defined');
        return letterData._project.gdFolderId;
    }
}
