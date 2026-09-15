import { createHash } from 'crypto';
import ToolsDb from '../../tools/ToolsDb';
import PrivacyRepository from './PrivacyRepository';
import PrivacyValidator from './PrivacyValidator';
import { currentNotice, PrivacyScope, PrivacyError } from './PrivacyNotice';
export default class PrivacyController {
    private static repository = new PrivacyRepository();
    static async status(personId: number, scope: PrivacyScope) {
        PrivacyValidator.identity(personId);
        const notice = currentNotice(scope);
        const acknowledgedAt = await this.repository.find(personId, scope, notice.version);
        return { notice, acknowledged: acknowledgedAt !== null, acknowledgedAt };
    }
    static async acknowledge(personId: number, scope: PrivacyScope, dto: unknown) {
        PrivacyValidator.identity(personId);
        const notice = currentNotice(scope);
        PrivacyValidator.acknowledgement(dto, notice);
        const snapshot = JSON.stringify(notice);
        const hash = createHash('sha256').update(snapshot).digest('hex');
        await ToolsDb.transaction(async (conn) => {
            const storedHash = await this.repository.insertSnapshot(notice, snapshot, hash, conn);
            if (hash !== storedHash) throw new PrivacyError('Wersja informacji wymaga korekty konfiguracji.', 'PRIVACY_SNAPSHOT_CONFLICT', 503);
            await this.repository.insertAcknowledgement(personId, notice, conn);
        });
        return this.status(personId, scope);
    }
    static async requireAcknowledgement(personId: number, scope: PrivacyScope) {
        const status = await this.status(personId, scope);
        if (!status.acknowledged)
            throw new PrivacyError('Zapoznaj się z informacją o przetwarzaniu danych osobowych.', 'PRIVACY_ACKNOWLEDGEMENT_REQUIRED', 428);
    }
}

