import Person from './Person';
import { SystemRoleName, UserData } from '../types/sessionTypes';
import SessionRevoker from '../setup/Sessions/SessionRevoker';
import PersonRepository, { PersonsSearchParams } from './PersonRepository';
import { PersonAccountV2Payload, PersonProfileV2Payload } from '../types/types';
import BaseController from '../controllers/BaseController';
import { OAuth2Client } from 'google-auth-library';
import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import StaffMemberRepository from '../staff/StaffMemberRepository';
import Setup from '../setup/Setup';

export type { PersonsSearchParams };

export default class PersonsController extends BaseController<
    Person,
    PersonRepository
> {
    private static instance: PersonsController;

    // ponytail: fallback gdy caller nie przesle _fieldsToUpdate (stare formularze) -
    // bez tego getPersonsWriteFields/getAccountWriteFields ciszej zwracaja [] i nic sie nie zapisuje
    private static readonly DEFAULT_EDIT_FIELDS = [
        'name',
        'surname',
        'position',
        'email',
        'cellphone',
        'phone',
        'comment',
        'systemRoleId',
        'systemEmail',
    ];

    constructor() {
        super(new PersonRepository());
    }

    private static getInstance(): PersonsController {
        if (!this.instance) {
            this.instance = new PersonsController();
        }
        return this.instance;
    }

    static async find(
        searchParams: PersonsSearchParams[] = [],
    ): Promise<Person[]> {
        const instance = this.getInstance();
        return instance.repository.find(searchParams);
    }

    /**
     * CREATE (DTO)
     * Router powinien wywoływać tę metodę.
     */
    static async addFromDto(personData: {
        name: string;
        surname: string;
        position?: string;
        email?: string;
        cellphone?: string;
        phone?: string;
        comment?: string;
        systemRoleId?: number;
        entityId?: number;
    }): Promise<Person> {
        const person = new Person(personData);
        if (!person._entity?.id)
            throw new Error('Person must be associated with an entity.');

        delete person.systemRoleId;
        delete person.systemEmail;

        return await this.add(person);
    }

    /**
     * CREATE
     * Dodaje osobę (tylko DB).
     */
    /**
     * Po nadaniu roli 1/2/3 zakłada rekord StaffMembers z domyślnymi flagami roli
     * (jeśli jeszcze nie ma). Wołane w tej samej transakcji co zapis konta.
     */
    private static async ensureStaffMemberForRole(
        personId: number | undefined,
        systemRoleId: number | undefined,
        roleWasWritten: boolean,
        conn: mysql.PoolConnection
    ): Promise<void> {
        if (!personId || !roleWasWritten) return;
        // Rola 6 (CONTRACT_WORKER) też dostaje rekord, ale z wyzerowanymi flagami -
        // dostęp do kilometrówki i wizyt na budowie włącza się jej świadomie, per osoba.
        if (systemRoleId === undefined || ![1, 2, 3, 6].includes(systemRoleId))
            return;
        await StaffMemberRepository.ensureDefaultsForRole(
            personId,
            systemRoleId,
            conn
        );
    }

    static async add(person: Person): Promise<Person> {
        const instance = this.getInstance();
        const hasAccountFields =
            person.systemRoleId !== undefined ||
            person.systemEmail !== undefined;

        if (hasAccountFields) {
            await ToolsDb.transaction(async (conn) => {
                const personForPersonsWrite = new Person({
                    ...person,
                    systemRoleId: undefined,
                    systemEmail: undefined,
                });
                await instance.repository.addInDb(
                    personForPersonsWrite,
                    conn,
                    true,
                );
                person.id = personForPersonsWrite.id;
                await instance.repository.upsertPersonAccountInDb(person, conn);
                await this.ensureStaffMemberForRole(
                    person.id,
                    person.systemRoleId,
                    true, // add: domyślnie synchronizuje wszystkie pola konta
                    conn
                );
            });
        } else {
            await instance.repository.addInDb(person);
        }
        console.log(`Person ${person.name} ${person.surname} added in db`);
        return person;
    }

    /**
     * UPDATE (DTO)
     * Router powinien wywoływać tę metodę.
     */
    static async editFromDto(
        personData: any,
        fieldsToUpdate: string[],
    ): Promise<Person> {
        const person = new Person(personData);
        return await this.edit(
            person,
            fieldsToUpdate?.length
                ? fieldsToUpdate
                : this.DEFAULT_EDIT_FIELDS,
        );
    }

    /**
     * UPDATE
     * Edytuje osobę (tylko DB).
     */
    static async edit(
        person: Person,
        fieldsToUpdate: string[],
    ): Promise<Person> {
        const instance = this.getInstance();
        const accountFieldsToSync =
            instance.repository.getAccountWriteFields(fieldsToUpdate);
        const personFieldsToUpdate =
            instance.repository.getPersonsWriteFields(fieldsToUpdate);
        const hasAccountFields = accountFieldsToSync.length > 0;
        const hasPersonFields = personFieldsToUpdate.length > 0;
        // Rola sprzed zapisu - do porównania po commicie (patrz revokeSessionsOnRoleChange).
        const roleIsBeingWritten = accountFieldsToSync.includes('systemRoleId');
        const previousRoleId =
            roleIsBeingWritten && person.id
                ? (await instance.repository.getPersonAccountV2(person.id))
                      ?.systemRoleId
                : undefined;

        if (hasPersonFields && hasAccountFields) {
            await ToolsDb.transaction(async (conn) => {
                await instance.repository.editInDb(
                    person,
                    conn,
                    true,
                    personFieldsToUpdate,
                );
                await instance.repository.upsertPersonAccountInDb(
                    person,
                    conn,
                    accountFieldsToSync,
                );
                await this.ensureStaffMemberForRole(
                    person.id,
                    person.systemRoleId,
                    accountFieldsToSync.includes('systemRoleId'),
                    conn,
                );
            });
        } else {
            if (hasPersonFields) {
                await instance.repository.editInDb(
                    person,
                    undefined,
                    undefined,
                    personFieldsToUpdate,
                );
            }
            if (hasAccountFields) {
                await ToolsDb.transaction(async (conn) => {
                    await instance.repository.upsertPersonAccountInDb(
                        person,
                        conn,
                        accountFieldsToSync,
                    );
                    await this.ensureStaffMemberForRole(
                        person.id,
                        person.systemRoleId,
                        accountFieldsToSync.includes('systemRoleId'),
                        conn,
                    );
                });
            }
        }
        console.log(`Person ${person.name} ${person.surname} updated in db`);

        if (person.id)
            await this.revokeSessionsOnRoleChange(
                person.id,
                previousRoleId,
                roleIsBeingWritten ? person.systemRoleId : undefined,
            );

        return person;
    }

    /**
     * DELETE (DTO)
     * Router powinien wywoływać tę metodę.
     */
    static async deleteFromDto(
        personData: any,
    ): Promise<{ id: number | undefined }> {
        const person = new Person(personData);
        await this.delete(person);
        return { id: person.id };
    }

    /**
     * DELETE
     * Usuwa osobę (tylko DB).
     */
    static async delete(person: Person): Promise<void> {
        const instance = this.getInstance();
        await instance.repository.deleteFromDb(person);
        console.log(`Person with id ${person.id} deleted from db`);
    }

    /**
     * UPDATE USER (DTO)
     * Use-case: edycja użytkownika ENVI + aktualizacja ScrumSheet.
     * @deprecated Używaj editFromDto() dla danych osobowych i upsertPersonAccountV2() dla konta.
     * UWAGA: v2 nie synchronizuje ScrumSheet automatycznie - metoda zostanie wycofana po dodaniu tej funkcjonalności do v2.
     * Router powinien wywoływać tę metodę.
     */
    static async editUserFromDto(userData: any): Promise<Person> {
        return await this.withAuth(async (instance, auth) => {
            const user = new Person(userData);

            const fieldsToUpdate = PersonsController.DEFAULT_EDIT_FIELDS;
            const accountFieldsToSync =
                instance.repository.getAccountWriteFields(fieldsToUpdate);
            // Rola sprzed zapisu - do porównania po commicie (patrz revokeSessionsOnRoleChange).
            const roleIsBeingWritten =
                accountFieldsToSync.includes('systemRoleId');
            const previousRoleId =
                roleIsBeingWritten && user.id
                    ? (await instance.repository.getPersonAccountV2(user.id))
                          ?.systemRoleId
                    : undefined;
            const personFieldsToUpdate =
                instance.repository.getPersonsWriteFields(fieldsToUpdate);

            if (
                personFieldsToUpdate.length > 0 &&
                accountFieldsToSync.length > 0
            ) {
                await ToolsDb.transaction(async (conn) => {
                    await instance.repository.editInDb(
                        user,
                        conn,
                        true,
                        personFieldsToUpdate,
                    );
                    await instance.repository.upsertPersonAccountInDb(
                        user,
                        conn,
                        accountFieldsToSync,
                    );
                });
            } else {
                if (personFieldsToUpdate.length > 0) {
                    await instance.repository.editInDb(
                        user,
                        undefined,
                        undefined,
                        personFieldsToUpdate,
                    );
                }
                if (accountFieldsToSync.length > 0) {
                    await ToolsDb.transaction(async (conn) => {
                        await instance.repository.upsertPersonAccountInDb(
                            user,
                            conn,
                            accountFieldsToSync,
                        );
                    });
                }
            }
            console.log(`User ${user.name} ${user.surname} updated in db`);

            if (user.id)
                await PersonsController.revokeSessionsOnRoleChange(
                    user.id,
                    previousRoleId,
                    roleIsBeingWritten ? user.systemRoleId : undefined,
                );

            // TODO:
            // NOTE: ScrumSheet importuje PersonsController, więc używamy dynamic import
            // (legacy workaround do czasu osobnej analizy/refaktoryzacji modułu ScrumSheet).
            if (Setup.scrumSheetSyncEnabled) {
                const [{ default: Planning }, { default: CurrentSprint }] =
                    await Promise.all([
                        import('../ScrumSheet/Planning'),
                        import('../ScrumSheet/CurrentSprint'),
                    ]);

                await Promise.all([
                    Planning.refreshTimeAvailable(auth),
                    CurrentSprint.makePersonTimePerTaskFormulas(auth),
                ]);
            }

            return user;
        });
    }

    static async getPersonFromSessionUserData(
        userData: UserData,
    ): Promise<Person> {
        const person = (await this.find([{ id: userData.enviId }]))[0];
        if (!person) throw new Error('No person found');
        return person;
    }

    static async getPersonBySystemEmail(systemEmail: string): Promise<Person> {
        const instance = this.getInstance();
        return <Person>(
            await instance.repository.getPersonBySystemEmail(systemEmail)
        );
    }

    static async getSystemRole(params: { id?: number; systemEmail?: string }) {
        const instance = this.getInstance();
        return instance.repository.getSystemRole(params);
    }

    static async getPersonAccountV2(
        personId: number,
    ): Promise<PersonAccountV2Payload | undefined> {
        const instance = this.getInstance();
        return instance.repository.getPersonAccountV2(personId);
    }

    static async upsertPersonAccountV2(
        accountData: PersonAccountV2Payload,
    ): Promise<PersonAccountV2Payload> {
        const instance = this.getInstance();
        if (!accountData.personId) {
            throw new Error('personId is required');
        }

        const providedAccountFields = Object.entries(accountData)
            .filter(
                ([fieldName, fieldValue]) =>
                    fieldName !== 'personId' && fieldValue !== undefined,
            )
            .map(([fieldName]) => fieldName);
        const fieldsToSync = instance.repository.getAccountWriteFields(
            providedAccountFields,
        );
        if (fieldsToSync.length === 0) {
            throw new Error('No account fields provided for v2 account upsert');
        }

        // Rola sprzed zapisu - potrzebna, żeby po commicie wiedzieć, czy się zmieniła.
        const roleIsBeingWritten = fieldsToSync.includes('systemRoleId');
        const previousRoleId = roleIsBeingWritten
            ? (await instance.repository.getPersonAccountV2(accountData.personId))
                  ?.systemRoleId
            : undefined;

        await ToolsDb.transaction(async (conn) => {
            await instance.repository.upsertPersonAccountInDb(
                {
                    id: accountData.personId,
                    systemRoleId: accountData.systemRoleId,
                    systemEmail: accountData.systemEmail,
                    googleId: accountData.googleId,
                    googleRefreshToken: accountData.googleRefreshToken,
                    microsoftId: accountData.microsoftId,
                    microsoftRefreshToken: accountData.microsoftRefreshToken,
                    isActive: accountData.isActive,
                },
                conn,
                fieldsToSync,
            );
            await this.ensureStaffMemberForRole(
                accountData.personId,
                accountData.systemRoleId,
                fieldsToSync.includes('systemRoleId'),
                conn,
            );
        });

        const account = await instance.repository.getPersonAccountV2(
            accountData.personId,
        );
        if (!account) {
            throw new Error(
                `Failed to load account after upsert for PersonId=${accountData.personId}`,
            );
        }

        await this.revokeSessionsOnRoleChange(
            accountData.personId,
            previousRoleId,
            roleIsBeingWritten ? account.systemRoleId : undefined,
        );

        return account;
    }

    /**
     * Po zmianie roli kasuje sesje tej osoby, żeby nowe uprawnienia obowiązywały od razu.
     *
     * Rola jest stemplowana w sesji przy logowaniu i nic jej później nie odświeża, a sesja
     * z `rolling: true` nie wygasa osobie korzystającej z witryny na bieżąco. Bez tego kroku
     * odebranie uprawnień nie zaczęłoby obowiązywać - stara, szersza rola zostałaby w sesji.
     *
     * Wołane PO commicie: dopóki zapis się nie powiódł, nie ma czego unieważniać.
     */
    private static async revokeSessionsOnRoleChange(
        personId: number,
        previousRoleId: number | undefined | null,
        newRoleId: number | undefined | null,
    ): Promise<void> {
        if (newRoleId === undefined) return;
        if (previousRoleId === newRoleId) return;

        await SessionRevoker.revokeForPerson(personId);
    }

    static async getPersonProfileV2(personId: number) {
        const instance = this.getInstance();
        return instance.repository.getPersonProfileV2(personId);
    }

    static async upsertPersonProfileV2(profileData: PersonProfileV2Payload) {
        const instance = this.getInstance();
        if (!profileData.personId) {
            throw new Error('personId is required');
        }
        return await ToolsDb.transaction(async (conn) => {
            return instance.repository.upsertPersonProfileInDb(
                profileData,
                conn,
            );
        });
    }

    /**
     * CREATE SYSTEM USER (DTO)
     * Tworzy użytkownika systemowego z kontem w jednym żądaniu.
     * @deprecated Używaj addFromDto() do utworzenia osoby, a następnie upsertPersonAccountV2() do dodania konta.
     * Metoda zostanie usunięta w kolejnej wersji major.
     */
    static async addNewSystemUser(userData: {
        name: string;
        surname: string;
        position?: string;
        email?: string;
        cellphone?: string;
        phone?: string;
        comment?: string;
        systemRoleId: number;
        systemEmail: string;
        entityId: number;
    }): Promise<Person> {
        const instance = this.getInstance();
        const user = new Person(userData);
        if (!user.systemRoleId || !user.systemEmail || !user._entity?.id) {
            throw new Error(
                'User must have systemRoleId, systemEmail, and be associated with an entity.',
            );
        }

        await ToolsDb.transaction(async (conn) => {
            const userForPersonsWrite = new Person({
                ...user,
                systemRoleId: undefined,
                systemEmail: undefined,
            });
            await instance.repository.addInDb(userForPersonsWrite, conn, true);
            user.id = userForPersonsWrite.id;
            await instance.repository.upsertPersonAccountInDb(user, conn);
        });
        console.log(`User ${user.name} ${user.surname} added in db`);
        return user;
    }

    /**
     * Pobiera listę osób, które mogą być "osobą rejestrującą" pismo
     * - Dla ENVI_COOPERATOR: zwraca tylko siebie
     * - Dla innych ról: zwraca siebie + wszystkich ENVI_MANAGER i ENVI_EMPLOYEE
     */
    static async getRegisteringEditors(userData: UserData): Promise<Person[]> {
        const loggedInPerson = await this.getPersonFromSessionUserData(userData);

        // Współpracownik i pracownik kontraktowy rejestrują wyłącznie na siebie
        if (
            userData.systemRoleName === 'ENVI_COOPERATOR' ||
            userData.systemRoleName === SystemRoleName.CONTRACT_WORKER
        ) {
            return [loggedInPerson];
        }

        // Dla innych ról, zwróć siebie + wszystkich pracowników ENVI
        // Szukamy kolejno każdej roli (zamiast OR which might not work well)
        const adminPersons = await this.find([{ systemRoleName: 'ADMIN' }]);
        const managerPersons = await this.find([{ systemRoleName: 'ENVI_MANAGER' }]);
        const employeePersons = await this.find([{ systemRoleName: 'ENVI_EMPLOYEE' }]);

        // Łącz wyniki i usuń duplikaty
        const allPersonsMap = new Map<number, Person>();
        [adminPersons, managerPersons, employeePersons].forEach((persons) => {
            persons.forEach((person) => {
                if (person.id) {
                    allPersonsMap.set(person.id, person);
                }
            });
        });

        // Upewnij się że zalogowany użytkownik jest na liście (na początku)
        const result = [loggedInPerson];
        allPersonsMap.forEach((person) => {
            if (person.id !== loggedInPerson.id) {
                result.push(person);
            }
        });

        return result;
    }
}
