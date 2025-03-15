import { ProjectData, ProjectRoleData, RoleData } from '../../types/types';
import Role from './Role';

export default class ProjectRole extends Role implements ProjectRoleData {
    projectId?: number | null;
    _project?: ProjectData;

    constructor(initParamObject: ProjectRoleData) {
        super({ ...initParamObject });
        this.projectId = initParamObject.projectId ?? null;
        this._project = initParamObject._project;
    }
}
