import BaseController from '../controllers/BaseController';
import { OAuth2Client } from 'google-auth-library';
import mysql from 'mysql2/promise';
import Setup from '../setup/Setup';
import ToolsDb from '../tools/ToolsDb';
import ToolsDocs from '../tools/ToolsDocs';
import ToolsGd from '../tools/ToolsGd';
import MeetingArrangementRepository from '../meetings/meetingArrangements/MeetingArrangementRepository';
import MeetingRepository from '../meetings/MeetingRepository';
import { ContractMeetingNoteCreatePayload } from '../types/types';
import ContractMeetingNote from './ContractMeetingNote';
import ContractMeetingNoteValidator from './ContractMeetingNoteValidator';
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
        orConditions: ContractMeetingNoteSearchParams[] = [],
    ): Promise<ContractMeetingNote[]> {
        const instance = this.getInstance();
        return await instance.repository.find(orConditions);
    }

    static async findFromDto(payload: {
        orConditions?: ContractMeetingNoteSearchParams[];
    }): Promise<ContractMeetingNote[]> {
        const normalizedPayload =
            ContractMeetingNoteValidator.validateFindPayload(payload);
        return await this.find(normalizedPayload.orConditions);
    }

    static async addFromDto(
        payload: ContractMeetingNoteCreatePayload,
        fallbackCreatedByPersonId?: number,
    ): Promise<ContractMeetingNote> {
        const instance = this.getInstance();
        const validatedPayload =
            ContractMeetingNoteValidator.validateCreatePayload(payload);
        const normalizedPayload: ContractMeetingNoteCreatePayload = {
            ...validatedPayload,
            createdByPersonId:
                validatedPayload.createdByPersonId ??
                fallbackCreatedByPersonId ??
                null,
        };

        return await this.withAuth(async (_, authClient) => {
            return await instance.addWithAuth(normalizedPayload, authClient);
        });
    }

    static async editFromDto(
        payload: Partial<ContractMeetingNoteCreatePayload> & { id: number },
    ): Promise<ContractMeetingNote> {
        const instance = this.getInstance();
        ContractMeetingNoteValidator.validateEditPayload(payload);
        const note = new ContractMeetingNote({
            id: payload.id,
            contractId: payload.contractId ?? 0,
            meetingId: payload.meetingId,
            sequenceNumber: 0,
            title: payload.title ?? '',
            description: payload.description,
            meetingDate: payload.meetingDate,
        });
        await instance.repository.editInDb(note);
        return note;
    }

    static async deleteById(id: number): Promise<void> {
        if (!Number.isInteger(id) || id <= 0) {
            throw new Error('id must be a positive integer');
        }
        const instance = this.getInstance();
        const items = await instance.repository.find([{ id }]);
        if (items.length === 0) {
            throw new Error(`ContractMeetingNote with id=${id} not found`);
        }
        await instance.repository.deleteFromDb(items[0]);
    }

    private async addWithAuth(
        payload: ContractMeetingNoteCreatePayload,
        authClient: OAuth2Client,
    ): Promise<ContractMeetingNote> {
        let createdProtocolGdId: string | undefined;

        try {
            return await ToolsDb.transaction<ContractMeetingNote>(
                async (conn) => {
                    if (!payload.contractId) {
                        throw new Error('contractId is required');
                    }

                    const createContext =
                        await this.repository.getCreateContext(
                            payload.contractId,
                            conn,
                        );
                    if (!createContext) {
                        throw new Error(
                            `Contract ${payload.contractId} was not found`,
                        );
                    }

                    const protocolFolderId =
                        await this.ensureMeetingProtocolsFolder(
                            createContext,
                            authClient,
                            conn,
                        );
                    const nextSequenceNumber =
                        await this.repository.getNextSequenceNumberForContract(
                            payload.contractId,
                            conn,
                        );

                    const protocolFileName = this.makeProtocolFileName(
                        createContext,
                        nextSequenceNumber,
                        payload.title,
                    );

                    const copiedProtocol = await ToolsGd.copyFile(
                        authClient,
                        Setup.Gd.meetingProtocoTemlateId,
                        protocolFolderId,
                        protocolFileName,
                    );
                    createdProtocolGdId = copiedProtocol.data.id || undefined;
                    if (!createdProtocolGdId) {
                        throw new Error(
                            'Google Docs template copy did not return file id',
                        );
                    }

                    await ToolsGd.createPermissions(authClient, {
                        fileId: createdProtocolGdId,
                    });

                    const populateWarnings =
                        await this.populateNoteDocument(
                            authClient,
                            createdProtocolGdId,
                            payload,
                            createContext,
                        );

                    const note = new ContractMeetingNote({
                        contractId: payload.contractId,
                        meetingId: payload.meetingId ?? null,
                        sequenceNumber: nextSequenceNumber,
                        title: payload.title,
                        description: payload.description ?? null,
                        meetingDate: payload.meetingDate ?? null,
                        protocolGdId: createdProtocolGdId,
                        createdByPersonId: payload.createdByPersonId ?? null,
                    });

                    await this.repository.addInDb(note, conn, true);
                    if (populateWarnings.length > 0) {
                        (note as any)._warnings = populateWarnings;
                    }
                    return note;
                },
            );
        } catch (error) {
            if (createdProtocolGdId) {
                await ToolsGd.trashFileOrFolder(
                    authClient,
                    createdProtocolGdId,
                ).catch((rollbackError) => {
                    console.error(
                        'ContractMeetingNotesController: failed to rollback Google Docs file',
                        rollbackError,
                    );
                });
            }
            throw error;
        }
    }

    private async ensureMeetingProtocolsFolder(
        createContext: ContractMeetingNoteCreateContext,
        authClient: OAuth2Client,
        conn: mysql.PoolConnection,
    ): Promise<string> {
        if (createContext.meetingProtocolsGdFolderId) {
            return createContext.meetingProtocolsGdFolderId;
        }
        if (!createContext.projectGdFolderId) {
            throw new Error(
                `Contract ${createContext.contractId} does not have project Google Drive folder`,
            );
        }

        const notesFolder = await ToolsGd.setFolder(authClient, {
            parentId: createContext.projectGdFolderId,
            name: 'Notatki ze spotkań',
        });
        const notesFolderId = String(notesFolder.id || '');
        if (!notesFolderId) {
            throw new Error('Unable to create or read meeting notes folder id');
        }

        await this.repository.updateContractMeetingProtocolsGdFolderId(
            createContext.contractId,
            notesFolderId,
            conn,
        );
        return notesFolderId;
    }

    private async populateNoteDocument(
        authClient: OAuth2Client,
        documentId: string,
        payload: ContractMeetingNoteCreatePayload,
        createContext: ContractMeetingNoteCreateContext,
    ): Promise<string[]> {
        const warnings: string[] = [];
        // Populate template tags if present; skip gracefully if template has no #ENVI# tags
        let hasNamedRanges = false;
        try {
            await ToolsDocs.initNamedRangesFromTags(authClient, documentId);
            hasNamedRanges = true;
        } catch (e: any) {
            if (e?.message?.includes('No tags for namedRanges found')) {
                const msg =
                    'Szablon Google Docs nie zawiera tagów #ENVI#...# — metadane nie zostały uzupełnione w dokumencie.';
                console.warn(
                    'ContractMeetingNotesController: ' + msg,
                );
                warnings.push(msg);
            } else {
                throw e;
            }
        }

        if (hasNamedRanges) {
            // Prepare metadata for named ranges
            const metadataRanges: { rangeName: string; newText: string }[] = [
                { rangeName: 'MEETING_TITLE', newText: payload.title || '' },
                {
                    rangeName: 'MEETING_DATE',
                    newText: payload.meetingDate || '',
                },
                {
                    rangeName: 'CONTRACT_NUMBER',
                    newText: createContext.contractNumber || '',
                },
            ];

            // Fetch meeting data for location if meetingId provided
            if (payload.meetingId) {
                const meetingRepo = new MeetingRepository();
                const meetings = await meetingRepo.find([
                    { id: payload.meetingId },
                ]);
                if (meetings.length > 0) {
                    metadataRanges.push({
                        rangeName: 'MEETING_LOCATION',
                        newText: meetings[0].location || '',
                    });
                }
            }
            if (
                !metadataRanges.find(
                    (r) => r.rangeName === 'MEETING_LOCATION',
                )
            ) {
                metadataRanges.push({
                    rangeName: 'MEETING_LOCATION',
                    newText: '',
                });
            }

            // Fetch created-by person name
            if (payload.createdByPersonId) {
                const personName = await this.getPersonName(
                    payload.createdByPersonId,
                );
                metadataRanges.push({
                    rangeName: 'CREATED_BY',
                    newText: personName,
                });
            } else {
                metadataRanges.push({
                    rangeName: 'CREATED_BY',
                    newText: '',
                });
            }

            await ToolsDocs.updateTextRunsInNamedRanges(
                authClient,
                documentId,
                metadataRanges,
            );
        }

        // Fetch arrangements and insert agenda structure
        if (payload.meetingId) {
            const arrangementRepo = new MeetingArrangementRepository();
            const arrangements = await arrangementRepo.find({
                meetingId: payload.meetingId,
            });

            if (arrangements.length > 0) {
                const agendaItems = arrangements.map((arr) => ({
                    heading: arr._case?.name
                        ? `${arr._case._type?.folderNumber || ''} ${arr._case.name}`.trim()
                        : arr.name || 'Punkt agendy',
                    body: arr.description || ' ',
                }));

                await ToolsDocs.insertAgendaStructure(
                    authClient,
                    documentId,
                    agendaItems,
                );
            }
        }
        return warnings;
    }

    private async getPersonName(personId: number): Promise<string> {
        const sql = `SELECT Name, Surname FROM Persons WHERE Id = ?`;
        const rows = (await ToolsDb.getQueryCallbackAsync(
            sql,
            undefined,
            [personId],
        )) as { Name?: string; Surname?: string }[];
        if (rows.length > 0) {
            return `${rows[0].Name || ''} ${rows[0].Surname || ''}`.trim();
        }
        return '';
    }

    private makeProtocolFileName(
        createContext: ContractMeetingNoteCreateContext,
        sequenceNumber: number,
        title: string,
    ): string {
        const seq = String(sequenceNumber).padStart(2, '0');
        const contractPart = createContext.contractNumber
            ? `${createContext.contractNumber} - `
            : '';

        return `${contractPart}Notatka ze spotkania ${seq}: ${title}`.trim();
    }
}
