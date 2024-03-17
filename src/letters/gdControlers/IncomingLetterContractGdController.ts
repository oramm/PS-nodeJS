import { IncomingLetterContractData } from '../../types/types';
import IncomingLetterGdController from './IncomingLetterGdController';

export default class IncomingLetterContractGdController extends IncomingLetterGdController {
    makeParentFolderGdId(letterData: IncomingLetterContractData): string {
        if (!letterData._project.gdFolderId)
            throw new Error('Project gdFolderId is not defined');
        return letterData._project.gdFolderId;
    }
}
