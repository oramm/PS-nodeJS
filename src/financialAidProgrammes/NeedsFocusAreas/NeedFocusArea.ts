import BusinessObject from '../../BussinesObject';
import {
    FocusAreaData,
    NeedData,
    NeedsFocusAreasData,
} from '../../types/types';

export default class NeedsFocusArea
    extends BusinessObject
    implements NeedsFocusAreasData
{
    needId: number;
    focusAreaId: number;
    _need: NeedData;
    _focusArea: FocusAreaData;
    comment?: string;

    constructor(initParamObject: NeedsFocusAreasData) {
        super({ ...initParamObject, _dbTableName: 'Needs_FocusAreas' });

        if (!initParamObject.needId && !initParamObject._need.id)
            throw new Error('NeedId is required');
        if (!initParamObject.focusAreaId && !initParamObject._focusArea.id)
            throw new Error('FocusAreaId is required');

        this.needId = (initParamObject.needId ??
            initParamObject._need.id) as number;
        this.focusAreaId = (initParamObject.focusAreaId ||
            initParamObject._focusArea.id) as number;

        this._need = initParamObject._need;
        this._focusArea = initParamObject._focusArea;
        this.comment = initParamObject.comment;
        //id jest usuwane w addInDb(), więc przy asocjacjach musi byś ręcznie odtworeone w controllerze
        this.id = '' + this.needId + this.focusAreaId;
    }
}
