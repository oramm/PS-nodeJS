import { LetterData } from '../../types/types';
import LetterGdController from './LetterGdController';

export default abstract class OurLetterGdController extends LetterGdController {
    static makeFolderName(number: string, creationDate: string): string {
        let folderName: string = super.makeFolderName(number, creationDate);
        return (folderName += ': Wychodzące');
    }
}
