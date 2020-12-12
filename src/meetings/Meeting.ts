import Setup from '../setup/Setup';
import ToolsDate from '../tools/ToolsDate';
import ToolsDb from '../tools/ToolsDb';
import ToolsGd from '../tools/ToolsGd';

export default class Meeting {
    id: any;
    name: string;
    description: string;
    date: string | undefined;
    protocolGdId?: string;
    _documentEditUrl?: string;
    _contract: any;
    contractId: any;
    location: string;
    _protocolTemplateId: string;

    constructor(initParamObject: any) {

        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.description = initParamObject.description;

        this.date = ToolsDate.dateJsToSql(initParamObject.date);
        
        if (initParamObject.protocolGdId) {
            this.protocolGdId = initParamObject.protocolGdId;
            this._documentEditUrl = ToolsGd.createDocumentEditUrl(initParamObject.protocolGdId);
        }
        if (initParamObject._contract) {
            this._contract = initParamObject._contract;
            this.contractId = initParamObject._contract.id;
        }
        this.location = initParamObject.location;
        this._protocolTemplateId = Setup.Gd.meetingProtocoTemlateId;

    }

}

