export default class Entity {
    id?: number;
    name?: string;
    address?: string;
    taxNumber?: string;
    www?: string;
    email?: string;
    phone?: string;
    fax?: string;
    constructor(initParamObject: any) {
        if (initParamObject) {
            this.id = initParamObject.id;
            if (initParamObject.name)
                this.name = initParamObject.name.trim();
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

