import BusinessObject from '../BussinesObject';
import { EntityData } from '../types/types';

export default class Entity extends BusinessObject implements EntityData {
    id?: number;
    name?: string;
    shortName?: string;
    address?: string;
    taxNumber?: string;
    www?: string;
    email?: string;
    phone?: string;
    constructor(initParamObject: any) {
        super({ ...initParamObject, _dbTableName: 'Entities' });
        if (initParamObject) {
            this.id = initParamObject.id;
            if (initParamObject.name) this.name = initParamObject.name.trim();
            if (initParamObject.shortName) {
                const shortName = initParamObject.shortName.trim();
                if (shortName.length === 0)
                    throw new Error('shortName nie może być pusty');
                if (shortName.length > 15)
                    throw new Error(
                        'shortName nie może przekraczać 15 znaków'
                    );
                this.shortName = shortName;
            }
            this.address = initParamObject.address;
            if (initParamObject.taxNumber)
                this.taxNumber = initParamObject.taxNumber;
            this.www = initParamObject.www;
            this.email = initParamObject.email;
            this.phone = initParamObject.phone;
        }
    }
}
