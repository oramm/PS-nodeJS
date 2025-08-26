import BusinessObject from '../../BussinesObject';
import {
    ApplicationCallData,
    EntityData,
    FocusAreaData,
    NeedData,
} from '../../types/types';

export default class Need extends BusinessObject implements NeedData {
    id?: number;
    clientId: number;
    _client: EntityData;
    name: string;
    description: string;
    status: string;
    _applicationCall?: ApplicationCallData | null;
    applicationCallId?: number | null;
    _focusAreas?: FocusAreaData[] = [];
    _focusAreasNames?: string[] | undefined;

    constructor(initParamObject: NeedData) {
        super({ ...initParamObject, _dbTableName: 'Needs' });
        if (!initParamObject.clientId && !initParamObject._client.id)
            throw new Error('clientId is required');
        this.clientId = (initParamObject.clientId ||
            initParamObject._client.id) as number;
        this._client = initParamObject._client;
        this.name = initParamObject.name;
        this.description = initParamObject.description;
        this.status = initParamObject.status;
        this._applicationCall = initParamObject._applicationCall;
        if (initParamObject._applicationCall === null)
            this.applicationCallId = null;
        else
            this.applicationCallId =
                initParamObject.applicationCallId ??
                initParamObject._applicationCall?.id;
        this._focusAreas = initParamObject._focusAreas;
        this.setFocusAreasNames(
            initParamObject._focusAreasNames,
            initParamObject._focusAreas
        );
    }

    setFocusAreasNames(
        _focusAreasNames: string[] | undefined,
        _focusAreas: FocusAreaData[] | undefined
    ) {
        if (_focusAreas && _focusAreas.length > 0)
            this._focusAreasNames = _focusAreas.map((fa) => fa.name);
        else this._focusAreasNames = _focusAreasNames;
    }
}
