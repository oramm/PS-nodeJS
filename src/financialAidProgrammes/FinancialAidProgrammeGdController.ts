import { OAuth2Client } from 'google-auth-library';
import Setup from '../setup/Setup';
import { FinancialAidProgrammeData } from '../types/types';
import FAPGenericGdController from './FAPGenericGdController';

export default class FinancialAidProgrammeGdController extends FAPGenericGdController<FinancialAidProgrammeData> {
    makeFolderName(data: FinancialAidProgrammeData) {
        return `${data.alias}`;
    }

    /** Tworzy folder oferty w folderze _city - nie zmienia FinancialAidProgrammeData*/
    async createFolder(
        auth: OAuth2Client,
        financialAidProgrammeData: FinancialAidProgrammeData
    ) {
        return await super.createFolder(
            auth,
            financialAidProgrammeData,
            Setup.Gd.financialAidProgrammesRootFolderId
        );
    }
}
