import mysql from 'mysql2/promise';
import BaseController from '../../controllers/BaseController';
import ToolsDb from '../../tools/ToolsDb';
import { BadRequestError } from '../../persons/projectAssignments/ProjectScopeGuard';
import SoftwareLicense from './SoftwareLicense';
import SoftwareLicenseRepository from './SoftwareLicenseRepository';
import SoftwareLicenseValidator from './SoftwareLicenseValidator';
import { encryptLicenseKey, decryptLicenseKey } from './licenseKeyCipher';

export default class SoftwareLicensesController extends BaseController<SoftwareLicense, SoftwareLicenseRepository> {
    private static instance: SoftwareLicensesController;
    private constructor() { super(new SoftwareLicenseRepository()); }
    private static getInstance(): SoftwareLicensesController {
        if (!this.instance) this.instance = new SoftwareLicensesController();
        return this.instance;
    }

    static async find(raw?: any): Promise<SoftwareLicense[]> {
        return this.getInstance().repository.find(SoftwareLicenseValidator.search(raw));
    }

    static async addFromDto(dto: any): Promise<SoftwareLicense> {
        const data = SoftwareLicenseValidator.validatePayload(dto);
        const key = SoftwareLicenseValidator.licenseKey(dto);
        return this.add(new SoftwareLicense(data), key);
    }

    static async add(item: SoftwareLicense, key?: string | null): Promise<SoftwareLicense> {
        return this.transaction(async (conn) => {
            const repo = this.getInstance().repository;
            await repo.addInDb(item, conn, true, key == null ? null : encryptLicenseKey(key));
            return (await repo.find([{ id: item.id }], conn))[0];
        });
    }

    static async editFromDto(dto: any, routeId?: unknown): Promise<SoftwareLicense> {
        SoftwareLicenseValidator.requireObject(dto);
        const id = SoftwareLicenseValidator.requireId(routeId ?? dto.id);
        const key = SoftwareLicenseValidator.licenseKey(dto);
        return this.transaction(async (conn) => {
            const existing = await this.requireExisting(id, conn);
            const data = SoftwareLicenseValidator.validatePayload(dto, existing.data);
            return this.edit(new SoftwareLicense(data, id), key, conn);
        });
    }

    static async edit(item: SoftwareLicense, key?: string | null, conn?: mysql.PoolConnection): Promise<SoftwareLicense> {
        if (!conn) return this.editFromDto({ ...item.data, id: item.id, licenseKey: key });
        const repo = this.getInstance().repository;
        await repo.editInDb(item, conn, true, undefined, key == null ? key : encryptLicenseKey(key));
        return (await repo.find([{ id: item.id }], conn))[0];
    }

    static async revealKey(routeId: unknown, actorId: unknown): Promise<{ licenseKey: string }> {
        const id = SoftwareLicenseValidator.requireId(routeId);
        const actorPersonId = SoftwareLicenseValidator.requireActorId(actorId);
        return this.transaction(async (conn) => {
            const repo = this.getInstance().repository;
            const encrypted = await repo.findEncryptedKey(id, conn);
            if (encrypted === undefined) throw new BadRequestError('Licencja o podanym numerze nie istnieje.');
            if (encrypted === null) throw new BadRequestError('Licencja nie ma zapisanego klucza.');
            const licenseKey = decryptLicenseKey(encrypted);
            // Fail closed: a key leaves the controller only after the audit transaction commits.
            await repo.recordKeyReveal(id, actorPersonId, conn);
            return { licenseKey };
        });
    }

    static async deleteFromDto(dto: any): Promise<SoftwareLicense> {
        const id = SoftwareLicenseValidator.requireId(dto?.id);
        return this.transaction(async (conn) => {
            const existing = await this.requireExisting(id, conn);
            await this.delete(existing, conn);
            return existing;
        });
    }

    static async delete(item: SoftwareLicense, conn?: mysql.PoolConnection): Promise<void> {
        if (!conn) { await this.deleteFromDto({ id: item.id }); return; }
        await this.getInstance().repository.deleteFromDb(item, conn);
    }

    private static async requireExisting(id: number, conn: mysql.PoolConnection): Promise<SoftwareLicense> {
        const [existing] = await this.getInstance().repository.find([{ id }], conn, true);
        if (!existing) throw new BadRequestError('Licencja o podanym numerze nie istnieje.');
        return existing;
    }

    private static async transaction<T>(callback: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
        try { return await ToolsDb.transaction<T>(callback); }
        catch (error) {
            if (error instanceof BadRequestError) throw error;
            throw new Error('Nie można wykonać operacji na licencjach.');
        }
    }
}
