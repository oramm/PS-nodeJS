import mysql from 'mysql2/promise';
import BaseController from '../controllers/BaseController';
import ToolsDb from '../tools/ToolsDb';
import { ContractMeetingNoteCreatePayload } from '../types/types';
import ContractMeetingNote from './ContractMeetingNote';
import ContractMeetingNoteRepository, {
    ContractMeetingNoteSearchParams,
} from './ContractMeetingNoteRepository';

export type { ContractMeetingNoteSearchParams };

export default class ContractMeetingNotesController extends BaseController<
    ContractMeetingNote,
    ContractMeetingNoteRepository
> {
    private static instance: ContractMeetingNotesController;

    constructor() {
        super(new ContractMeetingNoteRepository());
    }

    private static getInstance(): ContractMeetingNotesController {
        if (!this.instance) {
            this.instance = new ContractMeetingNotesController();
        }
        return this.instance;
    }

    static async find(
        orConditions: ContractMeetingNoteSearchParams[] = []
    ): Promise<ContractMeetingNote[]> {
        const instance = this.getInstance();
        return await instance.repository.find(orConditions);
    }

    static async addFromDto(
        payload: ContractMeetingNoteCreatePayload,
        externalConn?: mysql.PoolConnection
    ): Promise<ContractMeetingNote> {
        const instance = this.getInstance();

        if (externalConn) {
            return await instance.addWithinTransaction(payload, externalConn);
        }

        return await ToolsDb.transaction<ContractMeetingNote>(
            async (conn: mysql.PoolConnection) =>
                await instance.addWithinTransaction(payload, conn)
        );
    }

    private async addWithinTransaction(
        payload: ContractMeetingNoteCreatePayload,
        conn: mysql.PoolConnection
    ): Promise<ContractMeetingNote> {
        if (!payload.contractId) {
            throw new Error('contractId is required');
        }

        const nextSequenceNumber =
            await this.repository.getNextSequenceNumberForContract(
                payload.contractId,
                conn
            );

        const note = new ContractMeetingNote({
            contractId: payload.contractId,
            sequenceNumber: nextSequenceNumber,
            title: payload.title,
            description: payload.description ?? null,
            meetingDate: payload.meetingDate ?? null,
            protocolGdId: payload.protocolGdId ?? null,
            createdByPersonId: payload.createdByPersonId ?? null,
        });

        await this.repository.addInDb(note, conn, true);
        return note;
    }
}
