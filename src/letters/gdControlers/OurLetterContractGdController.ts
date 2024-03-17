import { OurLetterContractData } from '../../types/types';
import OurLetterGdController from './OurLetterGdController';

export default class OurLetterContractGdController extends OurLetterGdController {
    makeFolderName(number: string, creationDate: string): string {
        let folderName: string = super.makeFolderName(number, creationDate);
        return (folderName += ': Wychodzące');
    }

    makeParentFolderGdId(letterData: OurLetterContractData): string {
        if (!letterData._project.gdFolderId)
            throw new Error('Project gdFolderId is not defined');
        return letterData._project.gdFolderId;
    }
}
