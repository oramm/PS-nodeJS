import OurLetterGdFile from './OurLetterGdFIle';

import {
    DocumentTemplateData,
    OurLetterContractData,
    ProjectData,
} from '../types/types';
import OurLetter from './OurLetter';
import OurLetterContractGdFile from './OurLetterContractGdFIle';

export default class OurLetterContract
    extends OurLetter
    implements OurLetterContractData
{
    _project: ProjectData;
    projectId: number;

    constructor(initParamObject: OurLetterContractData) {
        super(initParamObject);
        if (!initParamObject._project.id)
            throw new Error('Project id is not defined');
        this._project = initParamObject._project;
        this.projectId = initParamObject._project.id;
    }

    makeLetterGdFileController(_template?: DocumentTemplateData) {
        return new OurLetterContractGdFile({
            _template,
            enviDocumentData: { ...this },
        });
    }
}
