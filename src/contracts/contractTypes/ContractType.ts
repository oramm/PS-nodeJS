import ToolsDb from '../../tools/ToolsDb';

export default class ContractType {
    id?: number;
    name: string;
    description: string;
    isOur: boolean;
    status?: string;

    constructor(initParamObject: any) {

        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.description = initParamObject.description;
        this.isOur = initParamObject.isOur;
        if (initParamObject.status)
            this.status = initParamObject.status;
    }
}

