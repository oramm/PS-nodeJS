import { Envi } from '../tools/EnviTypes';
import ToolsGd from '../tools/ToolsGd';
import LetterGdController from './LetterGdController';
import { OAuth2Client } from 'google-auth-library';

export default class IncomingLetterGdController extends LetterGdController {
    static makeFolderName(number: string, creationDate: string): string {
        let folderName: string = super.makeFolderName(number, creationDate);
        return (folderName += ': Przychodzące');
    }

    /** przenosi plik do folderu po dodaniu załączników do pisma z pojedynczym plikiem */
    static async moveLetterFIletoFolder(
        letterGdDocumentId: string,
        auth: OAuth2Client,
        letterGdFolderId: string
    ) {
        const letterFile = await ToolsGd.getFileOrFolderById(
            auth,
            letterGdDocumentId
        );
        //przenieś wcześniej istniejący plik do nowego folderu
        await ToolsGd.moveFileOrFolder(auth, letterFile, letterGdFolderId);
    }
}
