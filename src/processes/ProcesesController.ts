import Process from "./Process";
import BaseController from '../controllers/BaseController';
import ProcessRepository from './ProcessRepository';
import { UserData } from "../types/sessionTypes";
import PersonsController from "../persons/PersonsController";

export default class ProcessesController extends BaseController<
    Process,
    ProcessRepository
>{
    private static instance: ProcessesController;

    constructor() {
        super(new ProcessRepository());
    }

    private static getInstance(): ProcessesController {
        if (!this.instance) {
            this.instance = new ProcessesController();
        }
        return this.instance;
    }
    
    static async find(
        initParamObject: any
    ): Promise<Process[]> {
        const instance = this.getInstance();
        return instance.repository.find(initParamObject);
    }

    static async addNewProcess(processData: any, userData: UserData): Promise<Process> {
        const instance = this.getInstance();
        const editor = await PersonsController.getPersonFromSessionUserData(userData);
        const fullProcessData = { ...processData, _editor: editor };

        const process = new Process(fullProcessData);
        await instance.create(process);
        
        console.log(`Process "${process.name}" added to db`);
        return process;
    }

    static async updateProcess(processData: any, fieldsToUpdate: string[], userData: UserData): Promise<Process> {
        const instance = this.getInstance();
        const editor = await PersonsController.getPersonFromSessionUserData(userData);
        const fullProcessData = { ...processData, _editor: editor };

        const process = new Process(fullProcessData);
        await instance.edit(process, undefined, undefined, fieldsToUpdate);
        
        console.log(`Process with id ${process.id} updated in db`);
        return process;
    }

    static async deleteProcess(processData: any): Promise<void> {
        const instance = this.getInstance();
        const process = new Process(processData); 
        await instance.delete(process);
        
        console.log(`Process with id ${process.id} deleted from db`);
    }
}