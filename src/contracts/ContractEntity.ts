import BusinessObject from '../BussinesObject';
import Entity from '../entities/Entity';
import { ContractData } from '../types/types';

export default class ContractEntity extends BusinessObject {
    declare id: string;
    contractId: number;
    _contract: ContractData;
    entityId: number;
    _entity: Entity;
    contractRole: string;
    // Lider konsorcjum — znacznik siedzi na wierszu powiązania, nie na kontrakcie:
    // powiązania są przy każdej edycji kasowane i dopisywane od nowa, więc znacznik
    // umiera razem z nimi i nie ma jak wskazywać firmy, której przy kontrakcie już nie ma.
    // Nieobowiązkowy, domyślnie false — brak wskazania nie różni się od stanu sprzed pola.
    isLeader: boolean;
    constructor(initParamObject: any) {
        super({ ...initParamObject, _dbTableName: 'Contracts_Entities' });
        this.contractId = initParamObject._contract.id;
        this._contract = initParamObject._contract;
        this.entityId = initParamObject._entity.id;
        this._entity = initParamObject._entity;

        this.contractRole = initParamObject.contractRole;
        this.isLeader = initParamObject.isLeader ?? false;
        //id jest usuwane w addInDb(), więc przy asocjacjach musi byś ręcznie odtworeone w controllerze
        this.id = '' + this.contractId + this.entityId;
    }
}
