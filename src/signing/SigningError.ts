export type SigningErrorCode =
    | 'INVALID_PDF'
    | 'ENCRYPTED_PDF'
    | 'ALREADY_SIGNED'
    | 'INVALID_CERTIFICATE'
    | 'UNSUPPORTED_KEY'
    | 'INVALID_PLACEMENT'
    | 'PLACEMENT_BLOCKED'
    | 'INVALID_PREPARED_PDF'
    | 'SIGNATURE_MISMATCH'
    | 'PLACEHOLDER_TOO_SMALL';

/**
 * Every failure of the signing library is a SigningError with a stable `code`, so the HTTP layer
 * (SIG-2) can map codes to user-facing Polish messages without parsing English text.
 */
export class SigningError extends Error {
    readonly code: SigningErrorCode;

    constructor(code: SigningErrorCode, message: string) {
        super(message);
        this.name = 'SigningError';
        this.code = code;
        Object.setPrototypeOf(this, SigningError.prototype);
    }
}
