import BaseController from '../controllers/BaseController';
import { OAuth2Client } from 'google-auth-library';
import mysql from 'mysql2/promise';
import Setup from '../setup/Setup';
import ToolsDb from '../tools/ToolsDb';
import ToolsGd from '../tools/ToolsGd';
import { ContractMeetingNoteCreatePayload } from '../types/types';
import ContractMeetingNote from './ContractMeetingNote';
import ContractMeetingNoteRepository, {
    ContractMeetingNoteCreateContext,
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
        fallbackCreatedByPersonId?: number
    ): Promise<ContractMeetingNote> {
        const instance = this.getInstance();
        const normalizedPayload: ContractMeetingNoteCreatePayload = {
            ...payload,
            createdByPersonId:
                payload.createdByPersonId ?? fallbackCreatedByPersonId ?? null,
        };

        return await this.withAuth(async (_, authClient) => {
            return await instance.addWithAuth(normalizedPayload, authClient);
        });
    }

    private async addWithAuth(
        payload: ContractMeetingNoteCreatePayload,
        authClient: OAuth2Client
    ): Promise<ContractMeetingNote> {
        let createdProtocolGdId: string | undefined;

        try {
            return await ToolsDb.transaction<ContractMeetingNote>(async (conn) => {
                if (!payload.contractId) {
                    throw new Error('contractId is required');
                }

                const createContext = await this.repository.getCreateContext(
                    payload.contractId,
                    conn
                );
                if (!createContext) {
                    throw new Error(`Contract ${payload.contractId} was not found`);
                }

                const protocolFolderId = await this.ensureMeetingProtocolsFolder(
                    createContext,
                    authClient,
                    conn
                );
                const nextSequenceNumber =
                    await this.repository.getNextSequenceNumberForContract(
                        payload.contractId,
                        conn
                    );

                const protocolFileName = this.makeProtocolFileName(
                    createContext,
                    nextSequenceNumber,
                    payload.title
                );

                const copiedProtocol = await ToolsGd.copyFile(
                    authClient,
                    Setup.Gd.meetingProtocoTemlateId,
                    protocolFolderId,
                    protocolFileName
                );
                createdProtocolGdId = copiedProtocol.data.id || undefined;
                if (!createdProtocolGdId) {
                    throw new Error(
                        'Google Docs template copy did not return file id'
                    );
                }

                await ToolsGd.createPermissions(authClient, {
                    fileId: createdProtocolGdId,
                });

                const note = new ContractMeetingNote({
                    contractId: payload.contractId,
                    meetingId: null,
                    sequenceNumber: nextSequenceNumber,
                    title: payload.title,
                    description: payload.description ?? null,
                    meetingDate: payload.meetingDate ?? null,
                    protocolGdId: createdProtocolGdId,
                    createdByPersonId: payload.createdByPersonId ?? null,
                });

                await this.repository.addInDb(note, conn, true);
                return note;
            });
        } catch (error) {
            if (createdProtocolGdId) {
                await ToolsGd.trashFileOrFolder(authClient, createdProtocolGdId).catch(
                    (rollbackError) => {
                    console.error(
                        'ContractMeetingNotesController: failed to rollback Google Docs file',
                        rollbackError
                    );
                    }
                );
            }
            throw error;
        }
    }

    private async ensureMeetingProtocolsFolder(
        createContext: ContractMeetingNoteCreateContext,
        authClient: OAuth2Client,
        conn: mysql.PoolConnection
    ): Promise<string> {
        if (createContext.meetingProtocolsGdFolderId) {
            return createContext.meetingProtocolsGdFolderId;
        }
        if (!createContext.projectGdFolderId) {
            throw new Error(
                `Contract ${createContext.contractId} does not have project Google Drive folder`
            );
        }

        const notesFolder = await ToolsGd.setFolder(authClient, {
            parentId: createContext.projectGdFolderId,
            name: 'Notatki ze spotkan',
        });
        const notesFolderId = String(notesFolder.id || '');
        if (!notesFolderId) {
            throw new Error('Unable to create or read meeting notes folder id');
        }

        await this.repository.updateContractMeetingProtocolsGdFolderId(
            createContext.contractId,
            notesFolderId,
            conn
        );
        return notesFolderId;
    }

    private makeProtocolFileName(
        createContext: ContractMeetingNoteCreateContext,
        sequenceNumber: number,
        title: string
    ): string {
        const seq = String(sequenceNumber).padStart(2, '0');
        const contractPart = createContext.contractNumber
            ? `${createContext.contractNumber} - `
            : '';

        return `${contractPart}Notatka ze spotkania ${seq}: ${title}`.trim();
    }
}
