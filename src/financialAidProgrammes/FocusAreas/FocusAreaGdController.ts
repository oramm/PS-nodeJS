import { OAuth2Client } from 'google-auth-library';
import { FocusAreaData } from '../../types/types';
import FAPGenericGdController from '../FAPGenericGdController';

export default class FocusAreaGdController extends FAPGenericGdController<FocusAreaData> {
    makeFolderName(data: FocusAreaData) {
        return `${data.alias}`;
    }

    /** Tworzy folder oferty w folderze _city - nie zmienia FinancialAidProgrammeData*/
    async createFolder(auth: OAuth2Client, focusAreaDataData: FocusAreaData) {
        const parentFolderGdId = focusAreaDataData._programme.gdFolderId;
        return await super.createFolder(
            auth,
            focusAreaDataData,
            parentFolderGdId
        );
    }
}
