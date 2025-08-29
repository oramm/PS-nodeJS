import ProcessStep from "./ProcessStep";
import BaseController from '../controllers/BaseController';
import ProcessStepRepository from './ProcessStepRepository';
import PersonsController from '../persons/PersonsController';
import { UserData } from '../types/sessionTypes';

export default class ProcessStepsController extends BaseController<
    ProcessStep,
    ProcessStepRepository
>{
    private static instance: ProcessStepsController;

    constructor() {
        super(new ProcessStepRepository());
    }

    private static getInstance(): ProcessStepsController {
        if (!this.instance) {
            this.instance = new ProcessStepsController();
        }
        return this.instance;
    }
    
    static async find(
        initParamObject: any
    ): Promise<ProcessStep[]> {
        const instance = this.getInstance();
        return instance.repository.find(initParamObject);
    }

    static async addNewProcessStep(processStepData: any, userData: UserData): Promise<ProcessStep> {
        const instance = this.getInstance();
        const editor = await PersonsController.getPersonFromSessionUserData(userData);
        const fullProcessData = { ...processStepData, _editor: editor };

        const processStep = new ProcessStep(fullProcessData);
        await instance.create(processStep);
        
        console.log(`Process step "${processStep.name}" added to db`);
        return processStep;
    }
    
    static async updateProcessStep(processStepData: any, fieldsToUpdate: string[], userData: UserData): Promise<ProcessStep> {
        const instance = this.getInstance();
        const editor = await PersonsController.getPersonFromSessionUserData(userData);
        const fullProcessData = { ...processStepData, _editor: editor };

        const processStep = new ProcessStep(fullProcessData);
        await instance.edit(processStep, undefined, undefined, fieldsToUpdate);
        
        console.log(`Process step with id ${processStep.id} updated in db`);
        return processStep;
    }

    static async deleteProcessStep(processStepData: any): Promise<void> {
        const instance = this.getInstance();
        const processStep = new ProcessStep(processStepData); 
        await instance.delete(processStep);
        
        console.log(`Process step with id ${processStep.id} deleted from db`);
    }
}