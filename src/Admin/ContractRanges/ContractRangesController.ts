import ContractRange from './ContractRange';
import { ContractRangeData } from '../../types/types';
import BaseController from '../../controllers/BaseController';
import ContractRangeRepository, { ContractRangeSearchParams } from './ContractRangeRepository';

export type { ContractRangeSearchParams };

export default class ContractRangesController extends BaseController<
    ContractRange, 
    ContractRangeRepository
    > {
        private static _instance: ContractRangesController;

        constructor() {
            super(new ContractRangeRepository);
        }
        private static getInstance(): ContractRangesController {
            if (!this._instance) {
                this._instance = new ContractRangesController();
            }
            return this._instance;
        }

        static async addNewContractRange(ContractData: ContractRangeData) : Promise<ContractRange> {
            const instance = this.getInstance();
            const contractRange = new ContractRange(ContractData);
            await instance.create(contractRange);
            console.log(`Contract range ${contractRange.name} added`);
            return contractRange;
    }
        static async find(
            searchParams: ContractRangeSearchParams[] = []
        ): Promise<ContractRange[]> {
            const instance = this.getInstance();
            return await instance.repository.find(searchParams);
        }
    static async updateContractRange(
        ContractRangeData: ContractRangeData, 
        fieldsToUpdate?: string[]
    ) : Promise<ContractRange> {
        const instance = this.getInstance();
        const contractRange = new ContractRange(ContractRangeData);
        await instance.edit(contractRange, undefined, false, fieldsToUpdate);
        console.log(`Contract range ${contractRange.name} updated in db`);
        return contractRange;
    }
    static async deleteContractRange(
        ContractRangeData: ContractRangeData
    ): Promise<void> {
        const instance = this.getInstance();
        const contractRange = new ContractRange(ContractRangeData);
        await instance.delete(contractRange);
        console.log(`Contract range ${contractRange.name} deleted from db`);
    }
}