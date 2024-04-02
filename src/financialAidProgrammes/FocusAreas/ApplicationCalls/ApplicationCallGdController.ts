import { OAuth2Client } from 'google-auth-library';
import { ApplicationCallData } from '../../../types/types';
import FAPGenericGdController from '../../FAPGenericGdController';

export default class ApplicationCallGdController extends FAPGenericGdController<ApplicationCallData> {
    makeFolderName(data: ApplicationCallData) {
        return `Nabór do ${data.endDate}`;
    }

    /** Tworzy folder oferty w folderze _city - nie zmienia FinancialAidProgrammeData*/
    async createFolder(
        auth: OAuth2Client,
        applicationCallData: ApplicationCallData
    ) {
        const parentFolderGdId = applicationCallData._focusArea.gdFolderId;
        return await super.createFolder(
            auth,
            applicationCallData,
            parentFolderGdId
        );
    }
}
