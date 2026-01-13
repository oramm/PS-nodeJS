// Mock dla ContractOur.ts używany w testach
import Contract from './Contract';

export default class ContractOur extends Contract {
    ourId: string = '';
    managerId?: number;
    adminId?: number;
    cityId?: number;

    constructor(initParamObject: any) {
        super(initParamObject);
        if (initParamObject) {
            this.ourId = initParamObject.ourId;
            this.managerId = initParamObject.managerId;
            this.adminId = initParamObject.adminId;
            this.cityId = initParamObject.cityId;
        }
    }
}
