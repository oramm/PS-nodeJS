import BusinessObject from '../BussinesObject';
import Entity from '../entities/Entity';
import { ProjectData } from '../types/types';

export default class ProjectEntity extends BusinessObject {
    projectId: number;
    _project: ProjectData;
    entityId: number | undefined;
    _entity: Entity;
    projectRole: 'EMPLOYER' | 'ENGINEER';
    id: string;
    constructor(initParamObject: any) {
        super({ ...initParamObject, _dbTableName: 'Projects_Entities' });
        this.projectId = initParamObject._project.id;
        this._project = initParamObject._project;

        this.entityId = initParamObject._entity.id;
        this._entity = initParamObject._entity;

        this.projectRole = initParamObject.projectRole;
        //id jest usuwane w addInDb(), więc przy asocjacjach musi byś ręcznie odtworeone w controllerze
        this.id = '' + this.projectId + this.entityId;
    }
}
