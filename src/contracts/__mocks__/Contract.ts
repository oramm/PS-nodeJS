// Mock dla Contract.ts używany w testach

export default class Contract {
    id?: number;
    alias: string = '';
    name?: string;
    description?: string;
    startDate?: Date;
    endDate?: Date;
    value?: number;
    _editor?: any;
    _type?: any;
    _city?: any;
    _parent?: any;
    gdFolderId?: string;

    constructor(initParamObject: any) {
        if (initParamObject) {
            Object.assign(this, initParamObject);
        }
    }

    // Mock methods - będą nadpisane w testach
    isUniquePerProject = jest.fn();
    validateStartDateNotGreaterThanEndDate = jest.fn();
    createFolders = jest.fn();
    deleteFolder = jest.fn();
    addInScrum = jest.fn();
    deleteFromScrum = jest.fn();
    createDefaultMilestones = jest.fn();
}
