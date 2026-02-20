export class PublicProfileSubmissionError extends Error {
    readonly code: string;
    readonly httpStatus: number;
    readonly retryAfterSeconds?: number;

    constructor(
        message: string,
        code: string,
        httpStatus = 400,
        retryAfterSeconds?: number,
    ) {
        super(message);
        this.name = 'PublicProfileSubmissionError';
        this.code = code;
        this.httpStatus = httpStatus;
        this.retryAfterSeconds = retryAfterSeconds;
        Object.setPrototypeOf(this, PublicProfileSubmissionError.prototype);
    }
}

export const PublicProfileSubmissionErrorCodes = {
    PUBLIC_TOKEN_INVALID: 'PUBLIC_TOKEN_INVALID',
    PUBLIC_TOKEN_EXPIRED: 'PUBLIC_TOKEN_EXPIRED',
    EMAIL_VERIFY_REQUIRED: 'EMAIL_VERIFY_REQUIRED',
    EMAIL_CODE_INVALID: 'EMAIL_CODE_INVALID',
    EMAIL_CODE_EXPIRED: 'EMAIL_CODE_EXPIRED',
    EMAIL_VERIFY_RATE_LIMITED: 'EMAIL_VERIFY_RATE_LIMITED',
    LINK_RECOVERY_RATE_LIMITED: 'LINK_RECOVERY_RATE_LIMITED',
    ITEM_ALREADY_RESOLVED: 'ITEM_ALREADY_RESOLVED',
    REVIEW_COMMENT_REQUIRED: 'REVIEW_COMMENT_REQUIRED',
    FORBIDDEN: 'FORBIDDEN',
} as const;
