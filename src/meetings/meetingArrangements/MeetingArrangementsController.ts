import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import MeetingArrangement from './MeetingArrangement';
import MeetingArrangementRepository, {
    MeetingArrangementSearchParams,
} from './MeetingArrangementRepository';

export default class MeetingArrangementsController {
    private static _instance: MeetingArrangementsController;
    private repository: MeetingArrangementRepository;

    private constructor() {
        this.repository = new MeetingArrangementRepository();
    }

    static getInstance(): MeetingArrangementsController {
        if (!this._instance) {
            this._instance = new MeetingArrangementsController();
        }
        return this._instance;
    }

    /**
     * Wyszukuje MeetingArrangements według podanych kryteriów
     */
    static async find(
        params?: MeetingArrangementSearchParams
    ): Promise<MeetingArrangement[]> {
        const instance = this.getInstance();
        return await instance.repository.find(params);
    }

    /**
     * Dodaje nowy MeetingArrangement
     */
    static async add(
        item: MeetingArrangement,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ): Promise<MeetingArrangement> {
        const instance = this.getInstance();
        await instance.repository.addInDb(
            item,
            externalConn,
            isPartOfTransaction
        );
        return item;
    }

    /**
     * Aktualizuje istniejący MeetingArrangement
     */
    static async edit(
        item: MeetingArrangement,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean,
        fieldsToUpdate?: string[]
    ): Promise<MeetingArrangement> {
        const instance = this.getInstance();
        await instance.repository.editInDb(
            item,
            externalConn,
            isPartOfTransaction,
            fieldsToUpdate
        );
        return item;
    }

    /**
     * Usuwa MeetingArrangement
     */
    static async delete(
        item: MeetingArrangement,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ): Promise<void> {
        const instance = this.getInstance();
        await instance.repository.deleteFromDb(
            item,
            externalConn,
            isPartOfTransaction
        );
    }

    /**
     * @deprecated Użyj MeetingArrangementsController.find() zamiast tego.
     *
     * Migracja:
     * ```typescript
     * // STARE:
     * await MeetingArrangementsController.getMeetingArrangementsList(params);
     *
     * // NOWE:
     * await MeetingArrangementsController.find(params);
     * ```
     */
    static async getMeetingArrangementsList(
        initParamObject?: MeetingArrangementSearchParams
    ): Promise<MeetingArrangement[]> {
        return await this.find(initParamObject);
    }
}
