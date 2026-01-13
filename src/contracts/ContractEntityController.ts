import mysql from 'mysql2/promise';
import BaseController from '../controllers/BaseController';
import ContractEntityRepository from './ContractEntityRepository';
import ContractEntity from './ContractEntity';
import { ContractData, EntityData } from '../types/types';

export default class ContractEntityController extends BaseController<
    ContractEntity,
    ContractEntityRepository
> {
    private static instance: ContractEntityController;

    constructor() {
        super(new ContractEntityRepository());
    }

    private static getInstance(): ContractEntityController {
        if (!this.instance) {
            this.instance = new ContractEntityController();
        }
        return this.instance;
    }

    static async find(params: { contractId?: number; projectId?: string }) {
        const instance = this.getInstance();
        return await instance.repository.find(params);
    }

    /**
     * Dodaje asocjacje dla kontraktu (Contractors, Engineers, Employers)
     */
    static async addAssociations(
        contract: ContractData,
        conn: mysql.PoolConnection
    ): Promise<void> {
        const instance = this.getInstance();

        if (contract._contractors?.length) {
            await instance.repository.addAssociations(
                contract,
                contract._contractors,
                'CONTRACTOR',
                conn
            );
        }
        if (contract._engineers?.length) {
            await instance.repository.addAssociations(
                contract,
                contract._engineers,
                'ENGINEER',
                conn
            );
        }
        if (contract._employers?.length) {
            await instance.repository.addAssociations(
                contract,
                contract._employers,
                'EMPLOYER',
                conn
            );
        }
    }

    /**
     * Edytuje asocjacje dla kontraktu (usuwa stare i dodaje nowe)
     */
    static async editAssociations(
        contract: ContractData,
        conn: mysql.PoolConnection
    ): Promise<void> {
        const instance = this.getInstance();

        // 1. Usuń stare
        if (contract.id) {
            await instance.repository.deleteByContractId(contract.id, conn);
        }

        // 2. Dodaj nowe
        await this.addAssociations(contract, conn);
    }

    /**
     * Usuwa asocjacje dla kontraktu
     */
    static async deleteAssociations(
        contractId: number,
        conn: mysql.PoolConnection
    ): Promise<void> {
        const instance = this.getInstance();
        await instance.repository.deleteByContractId(contractId, conn);
    }
}
