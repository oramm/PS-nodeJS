import mysql from 'mysql2';
import mysqlPromise from 'mysql2/promise';
import BaseRepository from '../repositories/BaseRepository';
import ContractMeetingNote from './ContractMeetingNote';
import ToolsDb from '../tools/ToolsDb';
import ToolsDate from '../tools/ToolsDate';

export type ContractMeetingNoteSearchParams = {
    id?: number;
    contractId?: number;
    sequenceNumber?: number;
    title?: string;
    protocolGdId?: string;
    createdByPersonId?: number;
    meetingDateFrom?: string;
    meetingDateTo?: string;
};

export type ContractMeetingNoteCreateContext = {
    contractId: number;
    contractNumber?: string;
    contractName?: string;
    meetingProtocolsGdFolderId?: string | null;
    projectGdFolderId?: string | null;
};

export default class ContractMeetingNoteRepository extends BaseRepository<ContractMeetingNote> {
    constructor() {
        super('ContractMeetingNotes');
    }

    async find(
        orConditions: ContractMeetingNoteSearchParams[] = []
    ): Promise<ContractMeetingNote[]> {
        const sql = `SELECT
                ContractMeetingNotes.Id,
                ContractMeetingNotes.ContractId,
                ContractMeetingNotes.SequenceNumber,
                ContractMeetingNotes.Title,
                ContractMeetingNotes.Description,
                ContractMeetingNotes.MeetingDate,
                ContractMeetingNotes.ProtocolGdId,
                ContractMeetingNotes.CreatedByPersonId,
                ContractMeetingNotes.LastUpdated,
                Contracts.Number AS ContractNumber,
                Contracts.Name AS ContractName,
                Persons.Id AS CreatedById,
                Persons.Name AS CreatedByName,
                Persons.Surname AS CreatedBySurname,
                Persons.Email AS CreatedByEmail
            FROM ContractMeetingNotes
            JOIN Contracts ON Contracts.Id = ContractMeetingNotes.ContractId
            LEFT JOIN Persons ON Persons.Id = ContractMeetingNotes.CreatedByPersonId
            WHERE ${ToolsDb.makeOrGroupsConditions(
                orConditions,
                this.makeAndConditions.bind(this)
            )}
            ORDER BY ContractMeetingNotes.ContractId DESC, ContractMeetingNotes.SequenceNumber DESC`;

        const result = await this.executeQuery(sql);
        return result.map((row) => this.mapRowToModel(row));
    }

    async getNextSequenceNumberForContract(
        contractId: number,
        conn: mysqlPromise.PoolConnection
    ): Promise<number> {
        const sql = `SELECT COALESCE(MAX(SequenceNumber), 0) + 1 AS NextSequenceNumber
            FROM ContractMeetingNotes
            WHERE ContractId = ?
            FOR UPDATE`;
        const [rows] = await conn.execute(sql, [contractId]);
        const typedRows = rows as { NextSequenceNumber?: number }[];
        const nextSequence = typedRows[0]?.NextSequenceNumber ?? 1;
        return Number(nextSequence) || 1;
    }

    async getCreateContext(
        contractId: number,
        conn: mysqlPromise.PoolConnection
    ): Promise<ContractMeetingNoteCreateContext | null> {
        const sql = `SELECT
                Contracts.Id AS ContractId,
                Contracts.Number AS ContractNumber,
                Contracts.Name AS ContractName,
                Contracts.MeetingProtocolsGdFolderId,
                Projects.GdFolderId AS ProjectGdFolderId
            FROM Contracts
            LEFT JOIN Projects ON Projects.OurId = Contracts.ProjectOurId
            WHERE Contracts.Id = ?
            FOR UPDATE`;
        const [rows] = await conn.execute(sql, [contractId]);
        const typedRows = rows as {
            ContractId: number;
            ContractNumber?: string;
            ContractName?: string;
            MeetingProtocolsGdFolderId?: string | null;
            ProjectGdFolderId?: string | null;
        }[];
        const row = typedRows[0];
        if (!row) {
            return null;
        }

        return {
            contractId: row.ContractId,
            contractNumber: row.ContractNumber
                ? ToolsDb.sqlToString(row.ContractNumber)
                : undefined,
            contractName: row.ContractName
                ? ToolsDb.sqlToString(row.ContractName)
                : undefined,
            meetingProtocolsGdFolderId: row.MeetingProtocolsGdFolderId ?? null,
            projectGdFolderId: row.ProjectGdFolderId ?? null,
        };
    }

    async updateContractMeetingProtocolsGdFolderId(
        contractId: number,
        meetingProtocolsGdFolderId: string,
        conn: mysqlPromise.PoolConnection
    ): Promise<void> {
        const sql = `UPDATE Contracts
            SET MeetingProtocolsGdFolderId = ?
            WHERE Id = ?`;
        await conn.execute(sql, [meetingProtocolsGdFolderId, contractId]);
    }

    private makeAndConditions(condition: ContractMeetingNoteSearchParams): string {
        const conditions: string[] = [];

        if (condition.id) {
            conditions.push(
                mysql.format('ContractMeetingNotes.Id = ?', [condition.id])
            );
        }
        if (condition.contractId) {
            conditions.push(
                mysql.format('ContractMeetingNotes.ContractId = ?', [
                    condition.contractId,
                ])
            );
        }
        if (condition.sequenceNumber) {
            conditions.push(
                mysql.format('ContractMeetingNotes.SequenceNumber = ?', [
                    condition.sequenceNumber,
                ])
            );
        }
        if (condition.title) {
            conditions.push(
                mysql.format('ContractMeetingNotes.Title LIKE ?', [
                    `%${condition.title}%`,
                ])
            );
        }
        if (condition.protocolGdId) {
            conditions.push(
                mysql.format('ContractMeetingNotes.ProtocolGdId = ?', [
                    condition.protocolGdId,
                ])
            );
        }
        if (condition.createdByPersonId) {
            conditions.push(
                mysql.format('ContractMeetingNotes.CreatedByPersonId = ?', [
                    condition.createdByPersonId,
                ])
            );
        }
        if (condition.meetingDateFrom) {
            conditions.push(
                mysql.format('ContractMeetingNotes.MeetingDate >= ?', [
                    ToolsDate.dateJsToSql(condition.meetingDateFrom),
                ])
            );
        }
        if (condition.meetingDateTo) {
            conditions.push(
                mysql.format('ContractMeetingNotes.MeetingDate <= ?', [
                    ToolsDate.dateJsToSql(condition.meetingDateTo),
                ])
            );
        }

        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }

    protected mapRowToModel(row: any): ContractMeetingNote {
        return new ContractMeetingNote({
            id: row.Id,
            contractId: row.ContractId,
            sequenceNumber: row.SequenceNumber,
            title: ToolsDb.sqlToString(row.Title),
            description: row.Description
                ? ToolsDb.sqlToString(row.Description)
                : null,
            meetingDate: row.MeetingDate,
            protocolGdId: row.ProtocolGdId,
            createdByPersonId: row.CreatedByPersonId,
            _contract: {
                id: row.ContractId,
                number: row.ContractNumber,
                name: row.ContractName
                    ? ToolsDb.sqlToString(row.ContractName)
                    : undefined,
            },
            _createdBy: row.CreatedById
                ? {
                      id: row.CreatedById,
                      name: row.CreatedByName,
                      surname: row.CreatedBySurname,
                      email: row.CreatedByEmail,
                  }
                : undefined,
            _lastUpdated: row.LastUpdated,
        });
    }
}
