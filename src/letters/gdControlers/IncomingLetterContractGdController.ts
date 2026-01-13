import { IncomingLetterContractData } from '../../types/types';
import IncomingLetterGdController from './IncomingLetterGdController';

export default class IncomingLetterContractGdController extends IncomingLetterGdController {
    makeParentFolderGdId(letterData: IncomingLetterContractData): string {
        if (!letterData._project) throw new Error('Project is not defined');
        if (!letterData._project.lettersGdFolderId)
            throw new Error('Project .lettersGdFolderId is not defined');
        return letterData._project.lettersGdFolderId;
    }
}
