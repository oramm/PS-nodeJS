/**
 * Blad biznesowy zlecen podpisu. `status` czyta globalny error handler (4xx = blad uzytkownika,
 * bez raportu awarii do zespolu); `message` jest po polsku i trafia do uzytkownika (PS i program
 * czytaja pole errorMessage). `code` to stabilny identyfikator do testow i klientow.
 */
export type SigningJobErrorCode =
    | 'BAD_REQUEST'
    | 'NOT_FOUND'
    | 'FORBIDDEN'
    | 'EXPIRED'
    | 'WRONG_STATE'
    | 'CERTIFICATE_REJECTED'
    | 'PREPARE_FAILED'
    | 'SIGNATURE_REJECTED'
    | 'UPLOAD_REJECTED'
    | 'DRIVE_FAILED';

export class SigningJobError extends Error {
    constructor(
        readonly code: SigningJobErrorCode,
        message: string,
        readonly status: number
    ) {
        super(message);
        this.name = 'SigningJobError';
        Object.setPrototypeOf(this, SigningJobError.prototype);
    }
}
