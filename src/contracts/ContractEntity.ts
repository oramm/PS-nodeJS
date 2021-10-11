import BusinessObject from "../BussinesObject";
import Entity from "../entities/Entity";
import Contract from "./Contract";

export default class ContractEntity extends BusinessObject {
    contractId: number;
    _contract: Contract;
    entityId: number;
    _entity: Entity;
    contractRole: string;
    id: string;
    constructor(initParamObject: any) {
        super({ _dbTableName: 'Contracts_Entities' });
        this.contractId = initParamObject._contract.id;
        this._contract = initParamObject._contract;
        this.entityId = initParamObject._entity.id;
        this._entity = initParamObject._entity;

        this.contractRole = initParamObject.contractRole;
        //id jest usuwane w addInDb(), więc przy asocjacjach musi byś ręcznie odtworeone w controllerze
        this.id = '' + this.contractId + this.entityId;
    }
}