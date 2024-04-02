import { OAuth2Client } from 'google-auth-library';
import ToolsGd from '../tools/ToolsGd';

export default abstract class FAPGenericGdController<T> {
    /** Tworzy folder oferty w folderze _city - nie zmienia FinancialAidProgrammeData*/
    async createFolder(
        auth: OAuth2Client,
        dataObject: T,
        parentFolderGdId: string
    ) {
        const newFolder = await ToolsGd.createFolder(auth, {
            name: this.makeFolderName(dataObject),
            parents: [parentFolderGdId],
        });

        ToolsGd.createPermissions(auth, {
            fileId: <string>newFolder.id,
        });
        return newFolder;
    }

    /** Usuwa folder oferty */
    async deleteFromGd(auth: OAuth2Client, gdFolderId: string) {
        try {
            await ToolsGd.trashFileOrFolder(auth, gdFolderId);
        } catch (error) {
            console.log('Oferta nie miała folderu, więc nic nie usuwam');
        }
    }

    abstract makeFolderName(dataObject: T): string;
}
