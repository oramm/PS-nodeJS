import { OurLetterContractData } from '../../types/types';
import OurLetterGdController from './OurLetterGdController';

export default class OurLetterContractGdController extends OurLetterGdController {
    makeParentFolderGdId(letterData: OurLetterContractData): string {
        if (!letterData._project) throw new Error('Project is not defined');
        if (!letterData._project.lettersGdFolderId)
            throw new Error('Project gdFolderId is not defined');
        return letterData._project.lettersGdFolderId;
    }
}
