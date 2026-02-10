import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import Person from './Person';
import { SystemRoleName } from '../types/sessionTypes';
import BaseRepository from '../repositories/BaseRepository';
import Entity from '../entities/Entity';
import EnviErrors from '../tools/Errors';

export interface PersonsSearchParams {
    projectId?: string;
    contractId?: number;
    systemRoleName?: string;
    systemEmail?: string;
    id?: number;
    showPrivateData?: boolean;
    _entities?: Entity[];
    searchText?: string;
}

export default class PersonRepository extends BaseRepository<Person> {
    static readonly ACCOUNT_FIELDS = [
        'systemRoleId',
        'systemEmail',
        'googleId',
        'googleRefreshToken',
        'microsoftId',
        'microsoftRefreshToken',
    ] as const;

    static readonly PROFILE_FIELDS = [
        'headline',
        'summary',
        'profileIsVisible',
        'profileExperiences',
    ] as const;

    constructor() {
        super('Persons');
    }

    private makeSystemEmailConflictError(systemEmail: string): EnviErrors.DbError {
        return new EnviErrors.DbError(
            `SystemEmail '${systemEmail}' is already used by another person account.`,
            'PERSON_ACCOUNT_SYSTEM_EMAIL_CONFLICT',
        );
    }

    private async ensureSystemEmailIsAvailable(
        conn: mysql.PoolConnection,
        personId: number,
        systemEmail: string,
    ): Promise<void> {
        const [rows] = await conn.query<any[]>(
            `SELECT PersonId
             FROM PersonAccounts
             WHERE SystemEmail = ?
               AND PersonId <> ?
             LIMIT 1`,
            [systemEmail, personId],
        );

        if (rows.length > 0) {
            throw this.makeSystemEmailConflictError(systemEmail);
        }
    }

    private isV2ReadEnabled(): boolean {
        return (
            (process.env.PERSONS_MODEL_V2_READ_ENABLED || '').toLowerCase() ===
            'true'
        );
    }

    isV2WriteDualEnabled(): boolean {
        return (
            (process.env.PERSONS_MODEL_V2_WRITE_DUAL || '').toLowerCase() ===
            'true'
        );
    }

    protected mapRowToModel(row: any): Person {
        return new Person({
            id: row.Id,
            name: row.Name,
            surname: row.Surname,
            position: row.Position,
            email: row.Email,
            cellphone: row.Cellphone,
            phone: row.Phone,
            comment: row.Comment,
            systemEmail: row.SystemEmail,
            systemRoleName: row.SystemRoleName,
            systemRoleId: row.SystemRoleId,
            _entity: { id: row.EntityId, name: row.EntityName },
        });
    }

    async find(orConditions: PersonsSearchParams[] = []): Promise<Person[]> {
        return this.findByReadFacade(orConditions);
    }

    async findByReadFacade(
        orConditions: PersonsSearchParams[] = [],
    ): Promise<Person[]> {
        if (!this.isV2ReadEnabled()) {
            return this.findLegacy(orConditions);
        }

        try {
            return await this.findV2(orConditions);
        } catch (err) {
            console.warn(
                '[PersonsV2] find v2 read path failed, fallback to legacy path.',
                err,
            );
            return this.findLegacy(orConditions);
        }
    }

    async getPersonBySystemEmailByReadFacade(
        systemEmail: string,
    ): Promise<Person | undefined> {
        const people = await this.findByReadFacade([
            { systemEmail, showPrivateData: true },
        ]);
        return people[0];
    }

    async getPersonBySystemEmail(
        systemEmail: string,
    ): Promise<Person | undefined> {
        return this.getPersonBySystemEmailByReadFacade(systemEmail);
    }

    private async findLegacy(
        orConditions: PersonsSearchParams[] = [],
    ): Promise<Person[]> {
        const conditions =
            orConditions.length > 0
                ? this.makeOrGroupsConditions(orConditions, (searchParams) =>
                      this.makeAndConditions(searchParams, 'legacy'),
                  )
                : '1';

        const sql = `SELECT Persons.Id, 
                            Persons.EntityId, 
                            Persons.Name, 
                            Persons.Surname, 
                            Persons.Position, 
                            Persons.Email, 
                            Persons.Cellphone, 
                            Persons.Phone, 
                            Persons.Comment, 
                            Persons.SystemEmail,
                            SystemRoles.Name AS SystemRoleName,
                            SystemRoles.Id AS SystemRoleId,
                            Entities.Name AS EntityName
                    FROM Persons
                    JOIN Entities ON Persons.EntityId=Entities.Id
                    LEFT JOIN Roles ON Roles.PersonId = Persons.Id
                    JOIN SystemRoles ON Persons.SystemRoleId=SystemRoles.Id
                    WHERE ${conditions}
                    GROUP BY Persons.Id
                    ORDER BY Persons.Surname, Persons.Name ASC`;

        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToModel(row));
    }

    private async findV2(
        orConditions: PersonsSearchParams[] = [],
    ): Promise<Person[]> {
        const conditions =
            orConditions.length > 0
                ? this.makeOrGroupsConditions(orConditions, (searchParams) =>
                      this.makeAndConditions(searchParams, 'v2'),
                  )
                : '1';

        const sql = `SELECT Persons.Id, 
                            Persons.EntityId, 
                            Persons.Name, 
                            Persons.Surname, 
                            Persons.Position, 
                            Persons.Email, 
                            Persons.Cellphone, 
                            Persons.Phone, 
                            Persons.Comment, 
                            COALESCE(PersonAccounts.SystemEmail, Persons.SystemEmail) AS SystemEmail,
                            COALESCE(V2SystemRoles.Name, LegacySystemRoles.Name) AS SystemRoleName,
                            COALESCE(PersonAccounts.SystemRoleId, Persons.SystemRoleId) AS SystemRoleId,
                            Entities.Name AS EntityName
                    FROM Persons
                    JOIN Entities ON Persons.EntityId=Entities.Id
                    LEFT JOIN Roles ON Roles.PersonId = Persons.Id
                    LEFT JOIN PersonAccounts ON PersonAccounts.PersonId = Persons.Id AND PersonAccounts.IsActive = 1
                    LEFT JOIN SystemRoles V2SystemRoles ON PersonAccounts.SystemRoleId = V2SystemRoles.Id
                    JOIN SystemRoles LegacySystemRoles ON Persons.SystemRoleId = LegacySystemRoles.Id
                    WHERE ${conditions}
                    GROUP BY Persons.Id
                    ORDER BY Persons.Surname, Persons.Name ASC`;

        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToModel(row));
    }

    async getSystemRole(params: { id?: number; systemEmail?: string }) {
        return this.getSystemRoleByReadFacade(params);
    }

    async getSystemRoleByReadFacade(params: {
        id?: number;
        systemEmail?: string;
    }) {
        if (!this.isV2ReadEnabled()) {
            return this.getSystemRoleLegacy(params);
        }

        try {
            const systemRole = await this.getSystemRoleV2(params);
            if (systemRole) return systemRole;
            return this.getSystemRoleLegacy(params);
        } catch (err) {
            console.warn(
                '[PersonsV2] getSystemRole v2 read path failed, fallback to legacy path.',
                err,
            );
            return this.getSystemRoleLegacy(params);
        }
    }

    private async getSystemRoleLegacy(params: {
        id?: number;
        systemEmail?: string;
    }) {
        if (!params.id && !params.systemEmail)
            throw new Error('Person should have an ID or systemEmail');
        const personIdCondition = params.id
            ? mysql.format('Persons.Id = ?', [params.id])
            : '1';

        const systemEmailCondition = params.systemEmail
            ? mysql.format('Persons.SystemEmail = ?', [params.systemEmail])
            : '1';

        const sql = `SELECT 
                Persons.SystemRoleId, 
                Persons.Id AS PersonId, 
                Persons.GoogleId AS GoogleId, 
                Persons.GoogleRefreshToken AS GoogleRefreshToken, 
                SystemRoles.Name AS SystemRoleName 
                FROM Persons 
                JOIN SystemRoles ON Persons.SystemRoleId=SystemRoles.Id 
                WHERE ${systemEmailCondition} AND ${personIdCondition}`;

        try {
            const result: any[] = <any[]>(
                await ToolsDb.getQueryCallbackAsync(sql)
            );
            const row = result[0];
            if (!row) return undefined;
            return {
                id: <number>row.SystemRoleId,
                name: <SystemRoleName>row.SystemRoleName,
                personId: <number>row.PersonId,
                googleId: <string | undefined>row.GoogleId,
                microsofId: <string | undefined>row.MicrosoftId,
                googleRefreshToken: <string | undefined>row.GoogleRefreshToken,
            };
        } catch (err) {
            throw err;
        }
    }

    private async getSystemRoleV2(params: {
        id?: number;
        systemEmail?: string;
    }) {
        if (!params.id && !params.systemEmail)
            throw new Error('Person should have an ID or systemEmail');

        const personIdCondition = params.id
            ? mysql.format('Persons.Id = ?', [params.id])
            : '1';

        const systemEmailCondition = params.systemEmail
            ? mysql.format(
                  'COALESCE(PersonAccounts.SystemEmail, Persons.SystemEmail) = ?',
                  [params.systemEmail],
              )
            : '1';

        const sql = `SELECT 
                        COALESCE(PersonAccounts.SystemRoleId, Persons.SystemRoleId) AS SystemRoleId,
                        Persons.Id AS PersonId,
                        COALESCE(PersonAccounts.GoogleId, Persons.GoogleId) AS GoogleId,
                        COALESCE(PersonAccounts.GoogleRefreshToken, Persons.GoogleRefreshToken) AS GoogleRefreshToken,
                        PersonAccounts.MicrosoftId AS MicrosoftId,
                        COALESCE(V2SystemRoles.Name, LegacySystemRoles.Name) AS SystemRoleName
                    FROM Persons
                    LEFT JOIN PersonAccounts ON PersonAccounts.PersonId = Persons.Id AND PersonAccounts.IsActive = 1
                    LEFT JOIN SystemRoles V2SystemRoles ON PersonAccounts.SystemRoleId = V2SystemRoles.Id
                    LEFT JOIN SystemRoles LegacySystemRoles ON Persons.SystemRoleId = LegacySystemRoles.Id
                    WHERE ${systemEmailCondition} AND ${personIdCondition}`;

        try {
            const result: any[] = <any[]>(
                await ToolsDb.getQueryCallbackAsync(sql)
            );
            const row = result[0];
            if (!row) return undefined;
            return {
                id: <number>row.SystemRoleId,
                name: <SystemRoleName>row.SystemRoleName,
                personId: <number>row.PersonId,
                googleId: <string | undefined>row.GoogleId,
                microsofId: <string | undefined>(row.MicrosoftId ?? undefined),
                googleRefreshToken: <string | undefined>row.GoogleRefreshToken,
            };
        } catch (err) {
            throw err;
        }
    }

    private makeAndConditions(
        searchParams: PersonsSearchParams,
        readPath: 'legacy' | 'v2' = 'legacy',
    ): string {
        const conditions: string[] = [];
        const systemRoleNameColumn =
            readPath === 'v2'
                ? 'COALESCE(V2SystemRoles.Name, LegacySystemRoles.Name)'
                : 'SystemRoles.Name';
        const systemEmailColumn =
            readPath === 'v2'
                ? 'COALESCE(PersonAccounts.SystemEmail, Persons.SystemEmail)'
                : 'Persons.SystemEmail';

        if (searchParams.projectId) {
            conditions.push(
                mysql.format(`Roles.ProjectOurId=?`, [searchParams.projectId]),
            );
        }

        if (searchParams.contractId) {
            conditions.push(
                mysql.format(
                    `(Roles.ContractId=(SELECT ProjectOurId FROM Contracts WHERE Contracts.Id=?) OR Roles.ContractId IS NULL)`,
                    [searchParams.contractId],
                ),
            );
        }

        if (searchParams.systemRoleName) {
            conditions.push(
                mysql.format(`${systemRoleNameColumn} REGEXP ?`, [
                    searchParams.systemRoleName,
                ]),
            );
        }

        if (searchParams.systemEmail) {
            conditions.push(
                mysql.format(`${systemEmailColumn}=?`, [
                    searchParams.systemEmail,
                ]),
            );
        }

        if (searchParams.id) {
            conditions.push(mysql.format(`Persons.Id=?`, [searchParams.id]));
        }

        const entityCondition = ToolsDb.makeOrConditionFromValueOrArray1(
            searchParams._entities,
            'Persons',
            'EntityId',
            'id',
        );
        if (entityCondition !== '1') {
            conditions.push(entityCondition);
        }

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText,
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }

        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }

    private makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';

        const words = searchText.toString().split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(Persons.Name LIKE ${mysql.escape(`%${word}%`)}
                OR Persons.Surname LIKE ${mysql.escape(`%${word}%`)}
                OR Persons.Email LIKE ${mysql.escape(`%${word}%`)}
                OR Persons.Comment LIKE ${mysql.escape(`%${word}%`)}
                OR Persons.Position LIKE ${mysql.escape(`%${word}%`)})`,
            ),
        );
        return conditions.join(' AND ');
    }

    /**
     * Upsert = "INSERT albo UPDATE":
     * - jeśli konto dla PersonId istnieje -> aktualizuje wskazane pola,
     * - jeśli nie istnieje -> tworzy nowy rekord konta.
     */
    async upsertPersonAccountInDb(
        person: {
            id?: number;
            systemRoleId?: number;
            systemEmail?: string;
            googleId?: string;
            googleRefreshToken?: string;
            microsoftId?: string;
            microsoftRefreshToken?: string;
        },
        conn: mysql.PoolConnection,
        fieldsToSync: Array<
            | 'systemRoleId'
            | 'systemEmail'
            | 'googleId'
            | 'googleRefreshToken'
            | 'microsoftId'
            | 'microsoftRefreshToken'
        > = [
            'systemRoleId',
            'systemEmail',
            'googleId',
            'googleRefreshToken',
            'microsoftId',
            'microsoftRefreshToken',
        ],
    ): Promise<void> {
        if (!person.id)
            throw new Error('Person must have an ID for account upsert');

        const syncFieldMap = {
            systemRoleId:
                fieldsToSync.includes('systemRoleId') &&
                person.systemRoleId !== undefined,
            systemEmail:
                fieldsToSync.includes('systemEmail') &&
                person.systemEmail !== undefined,
            googleId:
                fieldsToSync.includes('googleId') &&
                person.googleId !== undefined,
            googleRefreshToken:
                fieldsToSync.includes('googleRefreshToken') &&
                person.googleRefreshToken !== undefined,
            microsoftId:
                fieldsToSync.includes('microsoftId') &&
                person.microsoftId !== undefined,
            microsoftRefreshToken:
                fieldsToSync.includes('microsoftRefreshToken') &&
                person.microsoftRefreshToken !== undefined,
        };

        if (!Object.values(syncFieldMap).some(Boolean)) return;

        try {
            if (
                syncFieldMap.systemEmail &&
                person.systemEmail &&
                person.systemEmail.trim().length > 0
            ) {
                await this.ensureSystemEmailIsAvailable(
                    conn,
                    person.id,
                    person.systemEmail,
                );
            }

            const [rows] = await conn.query<any[]>(
                'SELECT Id FROM PersonAccounts WHERE PersonId = ? LIMIT 1',
                [person.id],
            );

            if (rows.length > 0) {
                const setParts: string[] = [];
                const updateValues: any[] = [];

                if (syncFieldMap.systemRoleId) {
                    setParts.push('SystemRoleId = ?');
                    updateValues.push(person.systemRoleId ?? null);
                }
                if (syncFieldMap.systemEmail) {
                    setParts.push('SystemEmail = ?');
                    updateValues.push(person.systemEmail ?? null);
                }
                if (syncFieldMap.googleId) {
                    setParts.push('GoogleId = ?');
                    updateValues.push(person.googleId ?? null);
                }
                if (syncFieldMap.googleRefreshToken) {
                    setParts.push('GoogleRefreshToken = ?');
                    updateValues.push(person.googleRefreshToken ?? null);
                }
                if (syncFieldMap.microsoftId) {
                    setParts.push('MicrosoftId = ?');
                    updateValues.push(person.microsoftId ?? null);
                }
                if (syncFieldMap.microsoftRefreshToken) {
                    setParts.push('MicrosoftRefreshToken = ?');
                    updateValues.push(person.microsoftRefreshToken ?? null);
                }

                updateValues.push(person.id);
                await conn.execute(
                    `UPDATE PersonAccounts SET ${setParts.join(', ')} WHERE PersonId = ?`,
                    updateValues,
                );
            } else {
                const columns = ['PersonId'];
                const placeholders = ['?'];
                const insertValues: any[] = [person.id];

                if (syncFieldMap.systemRoleId) {
                    columns.push('SystemRoleId');
                    placeholders.push('?');
                    insertValues.push(person.systemRoleId ?? null);
                }
                if (syncFieldMap.systemEmail) {
                    columns.push('SystemEmail');
                    placeholders.push('?');
                    insertValues.push(person.systemEmail ?? null);
                }
                if (syncFieldMap.googleId) {
                    columns.push('GoogleId');
                    placeholders.push('?');
                    insertValues.push(person.googleId ?? null);
                }
                if (syncFieldMap.googleRefreshToken) {
                    columns.push('GoogleRefreshToken');
                    placeholders.push('?');
                    insertValues.push(person.googleRefreshToken ?? null);
                }
                if (syncFieldMap.microsoftId) {
                    columns.push('MicrosoftId');
                    placeholders.push('?');
                    insertValues.push(person.microsoftId ?? null);
                }
                if (syncFieldMap.microsoftRefreshToken) {
                    columns.push('MicrosoftRefreshToken');
                    placeholders.push('?');
                    insertValues.push(person.microsoftRefreshToken ?? null);
                }

                await conn.execute(
                    `INSERT INTO PersonAccounts (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
                    insertValues,
                );
            }
        } catch (error: any) {
            if (error?.code === 'ER_DUP_ENTRY' && person.systemEmail) {
                throw this.makeSystemEmailConflictError(person.systemEmail);
            }
            throw error;
        }

        console.log(
            `[PersonsV2] PersonAccount upserted for PersonId=${person.id}`,
        );
    }

    getPersonsWriteFields(fieldsToUpdate: string[] = []): string[] {
        if (fieldsToUpdate.length === 0) return [];
        const accountFields = new Set<string>([...PersonRepository.ACCOUNT_FIELDS]);
        const profileFields = new Set<string>([...PersonRepository.PROFILE_FIELDS]);
        return fieldsToUpdate.filter(
            (field) => !accountFields.has(field) && !profileFields.has(field),
        );
    }

    getAccountWriteFields(
        fieldsToUpdate: string[] = [],
    ): Array<
        | 'systemRoleId'
        | 'systemEmail'
        | 'googleId'
        | 'googleRefreshToken'
        | 'microsoftId'
        | 'microsoftRefreshToken'
    > {
        const accountFields = new Set<string>([...PersonRepository.ACCOUNT_FIELDS]);
        return fieldsToUpdate.filter((field) =>
            accountFields.has(field),
        ) as Array<
            | 'systemRoleId'
            | 'systemEmail'
            | 'googleId'
            | 'googleRefreshToken'
            | 'microsoftId'
            | 'microsoftRefreshToken'
        >;
    }

    hasProfileWriteFields(fieldsToUpdate: string[] = []): boolean {
        const profileFields = new Set<string>([...PersonRepository.PROFILE_FIELDS]);
        return fieldsToUpdate.some((field) => profileFields.has(field));
    }
}
