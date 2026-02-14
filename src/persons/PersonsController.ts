import Person from './Person';
import { UserData } from '../types/sessionTypes';
import PersonRepository, { PersonsSearchParams } from './PersonRepository';
import {
    PersonAccountV2Payload,
    PersonProfileExperienceV2Payload,
    PersonProfileV2Payload,
} from '../types/types';
import BaseController from '../controllers/BaseController';
import { OAuth2Client } from 'google-auth-library';
import ToolsDb from '../tools/ToolsDb';
import EducationController from './educations/EducationController';

export type { PersonsSearchParams };

export default class PersonsController extends BaseController<
    Person,
    PersonRepository
> {
    private static instance: PersonsController;

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
        return await this.edit(person, fieldsToUpdate);
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
                });
            }
        }
        console.log(`Person ${person.name} ${person.surname} updated in db`);
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

            const fieldsToUpdate = [
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
            const accountFieldsToSync =
                instance.repository.getAccountWriteFields(fieldsToUpdate);
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

            // TODO:
            // NOTE: ScrumSheet importuje PersonsController, więc używamy dynamic import
            // (legacy workaround do czasu osobnej analizy/refaktoryzacji modułu ScrumSheet).
            const [{ default: Planning }, { default: CurrentSprint }] =
                await Promise.all([
                    import('../ScrumSheet/Planning'),
                    import('../ScrumSheet/CurrentSprint'),
                ]);

            await Promise.all([
                Planning.refreshTimeAvailable(auth),
                CurrentSprint.makePersonTimePerTaskFormulas(auth),
            ]);

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

        const fieldsToSync = instance.repository.getAccountWriteFields(
            Object.keys(accountData).filter((key) => key !== 'personId'),
        );
        if (fieldsToSync.length === 0) {
            throw new Error('No account fields provided for v2 account upsert');
        }

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
                },
                conn,
                fieldsToSync,
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
        return account;
    }

    static async getPersonProfileV2(personId: number) {
        const instance = this.getInstance();
        const profile = await instance.repository.getPersonProfileV2(personId);
        if (!profile) return undefined;
        const [profileExperiences, profileEducations] = await Promise.all([
            instance.repository.listPersonProfileExperiencesV2(personId),
            EducationController.find(personId),
        ]);
        return {
            ...profile,
            profileExperiences,
            profileEducations,
        };
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

    static async listPersonProfileExperiencesV2(personId: number) {
        const instance = this.getInstance();
        return instance.repository.listPersonProfileExperiencesV2(personId);
    }

    static async addPersonProfileExperienceV2(
        personId: number,
        experienceData: PersonProfileExperienceV2Payload,
    ) {
        const instance = this.getInstance();
        return await ToolsDb.transaction(async (conn) => {
            return instance.repository.addPersonProfileExperienceInDb(
                personId,
                experienceData,
                conn,
            );
        });
    }

    static async editPersonProfileExperienceV2(
        personId: number,
        experienceId: number,
        experienceData: PersonProfileExperienceV2Payload,
    ) {
        const instance = this.getInstance();
        return await ToolsDb.transaction(async (conn) => {
            return instance.repository.editPersonProfileExperienceInDb(
                personId,
                experienceId,
                experienceData,
                conn,
            );
        });
    }

    static async deletePersonProfileExperienceV2(
        personId: number,
        experienceId: number,
    ): Promise<{ id: number }> {
        const instance = this.getInstance();
        await ToolsDb.transaction(async (conn) => {
            await instance.repository.deletePersonProfileExperienceInDb(
                personId,
                experienceId,
                conn,
            );
        });
        return { id: experienceId };
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
}
