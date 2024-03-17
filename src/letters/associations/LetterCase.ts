import BusinessObject from '../../BussinesObject';
import Case from '../../contracts/milestones/cases/Case';
import { CaseData } from '../../types/types';
import Letter from '../Letter';

export default class LetterCase extends BusinessObject {
    letterId: number;
    caseId: number;
    id: string;
    _letter: any;
    _case: any;

    constructor(initParamObject: { _letter: any; _case: CaseData }) {
        super({ _dbTableName: 'Letters_Cases' });
        this.letterId = initParamObject._letter.id;
        this.caseId = <number>initParamObject._case.id;
        //id jest usuwane w addInDb(), więc przy asocjacjach musi byś ręcznie odtworeone w controllerze
        this.id = '' + this.letterId + this.caseId;
        this._letter = initParamObject._letter;
        this._case = initParamObject._case;
    }
}
