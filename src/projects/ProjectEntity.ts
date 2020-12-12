
import Entity from '../entities/Entity';

export default class ProjectEntity {
  projectId: number;
  _project: any;
  entityId: number | undefined;
  _entity: Entity;
  projectRole: any;
  id: string;
  constructor(initParamObject: any) {
    this.projectId = initParamObject._project.id;
    this._project = initParamObject._project;

    this.entityId = initParamObject._entity.id;
    this._entity = initParamObject._entity;

    this.projectRole = initParamObject.projectRole;
    //id jest usuwane w addInDb(), więc przy asocjacjach musi byś ręcznie odtworeone w controllerze
    this.id = '' + this.projectId + this.entityId;
  }
}