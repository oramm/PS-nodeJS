import BusinessObject from '../BussinesObject';
import ToolsDb from '../tools/ToolsDb';
import { EntityData } from '../types/types';

export default class Entity extends BusinessObject implements EntityData {
    id?: number;
    name?: string;
    address?: string;
    taxNumber?: string;
    www?: string;
    email?: string;
    phone?: string;
    fax?: string;
    constructor(initParamObject: any) {
        super({ ...initParamObject, _dbTableName: 'Entities' });
        if (initParamObject) {
            this.id = initParamObject.id;
            if (initParamObject.name) this.name = initParamObject.name.trim();
            this.address = initParamObject.address;
            if (initParamObject.taxNumber)
                this.taxNumber = initParamObject.taxNumber;
            this.www = initParamObject.www;
            this.email = initParamObject.email;
            this.phone = initParamObject.phone;
            this.fax = initParamObject.fax;
        }
    }
}
