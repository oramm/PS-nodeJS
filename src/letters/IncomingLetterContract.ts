import EnviErrors from '../tools/Errors';
import { IncomingLetterContractData, ProjectData } from '../types/types';
import IncomingLetter from './IncomingLetter';
import IncomingLetterContractGdController from './gdControlers/IncomingLetterContractGdController';

export default class IncomingLetterContract
    extends IncomingLetter
    implements IncomingLetterContractData
{
    _project: ProjectData;
    projectId?: number;
    _letterGdController = new IncomingLetterContractGdController();

    constructor(initParamObject: IncomingLetterContractData) {
        super(initParamObject);
        if (!initParamObject._project.id)
            throw new Error('Project id is not defined');
        this._project = initParamObject._project;
        this.projectId = initParamObject._project.id;
    }

    makeParentFolderGdId(): string {
        if (!this._project.lettersGdFolderId)
            throw new EnviErrors.NoGdIdError(`: lettersGdFolderId`);
        return this._project.lettersGdFolderId;
    }
}
