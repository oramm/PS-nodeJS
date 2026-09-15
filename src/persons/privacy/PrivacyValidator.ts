import { PrivacyError, PrivacyNotice } from './PrivacyNotice';
export default class PrivacyValidator {
    static identity(personId: number): void {
        if (!Number.isSafeInteger(personId) || personId <= 0)
            throw new PrivacyError('Użytkownik niezalogowany', 'UNAUTHENTICATED', 401);
    }
    static acknowledgement(dto: any, notice: PrivacyNotice): void {
        if (dto?.acknowledged !== true)
            throw new PrivacyError('Potwierdź zapoznanie się z informacją.', 'PRIVACY_ACKNOWLEDGEMENT_INVALID', 400);
        if (dto.version !== notice.version || dto.revision !== notice.revision)
            throw new PrivacyError('Treść informacji zmieniła się. Pobierz ją ponownie.', 'PRIVACY_NOTICE_STALE', 409);
    }
}

