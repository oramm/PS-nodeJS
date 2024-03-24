import BusinessObject from '../BussinesObject';
import { EntityData, FocusAreaData, NeedData } from '../types/types';

export default class Need extends BusinessObject {
    clientId: number;
    _client: EntityData;
    name: string;
    description: string;
    status: string;

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
    }
}
