import LetterGdController from './LetterGdController';

export default abstract class OurLetterGdController extends LetterGdController {
    makeFolderName(number: string, creationDate: string): string {
        let folderName: string = super.makeFolderName(number, creationDate);
        return (folderName += ': Wychodzące');
    }
}
