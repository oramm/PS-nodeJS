// @ts-nocheck
export {};
('use strict');
var __awaiter =
    (this && this.__awaiter) ||
    function (thisArg, _arguments, P, generator) {
        function adopt(value) {
            return value instanceof P
                ? value
                : new P(function (resolve) {
                      resolve(value);
                  });
        }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) {
                try {
                    step(generator.next(value));
                } catch (e) {
                    reject(e);
                }
            }
            function rejected(value) {
                try {
                    step(generator['throw'](value));
                } catch (e) {
                    reject(e);
                }
            }
            function step(result) {
                result.done
                    ? resolve(result.value)
                    : adopt(result.value).then(fulfilled, rejected);
            }
            step(
                (generator = generator.apply(thisArg, _arguments || [])).next(),
            );
        });
    };
var __importDefault =
    (this && this.__importDefault) ||
    function (mod) {
        return mod && mod.__esModule ? mod : { default: mod };
    };
var _a, _b, _c, _d;
Object.defineProperty(exports, '__esModule', { value: true });
const ToolsDb_1 = __importDefault(require('../../tools/ToolsDb'));
const ToolsMail_1 = __importDefault(require('../../tools/ToolsMail'));
const ToolsAI_1 = __importDefault(require('../../tools/ToolsAI'));
const ExperienceController_1 = __importDefault(
    require('../experiences/ExperienceController'),
);
const EducationController_1 = __importDefault(
    require('../educations/EducationController'),
);
const ProfileSkillController_1 = __importDefault(
    require('../profileSkills/ProfileSkillController'),
);
const PublicProfileSubmissionErrors_1 = require('./PublicProfileSubmissionErrors');
const PublicProfileSubmissionRepository_1 = __importDefault(
    require('./PublicProfileSubmissionRepository'),
);
const LINK_TTL_DAYS = Number(
    (_a = process.env.PUBLIC_PROFILE_SUBMISSION_LINK_TTL_DAYS) !== null &&
        _a !== void 0
        ? _a
        : 30,
);
const VERIFY_CODE_TTL_MINUTES = Number(
    (_b = process.env.PUBLIC_PROFILE_SUBMISSION_VERIFY_CODE_TTL_MINUTES) !==
        null && _b !== void 0
        ? _b
        : 10,
);
const VERIFY_CODE_MAX_ATTEMPTS = Number(
    (_c = process.env.PUBLIC_PROFILE_SUBMISSION_VERIFY_CODE_MAX_ATTEMPTS) !==
        null && _c !== void 0
        ? _c
        : 5,
);
const SESSION_TTL_HOURS = Number(
    (_d = process.env.PUBLIC_PROFILE_SUBMISSION_SESSION_TTL_HOURS) !== null &&
        _d !== void 0
        ? _d
        : 24,
);
const LINK_RECOVERY_COOLDOWN_SECONDS = (() => {
    var _a;
    const value = Number(
        (_a =
            process.env
                .PUBLIC_PROFILE_SUBMISSION_LINK_RECOVERY_COOLDOWN_SECONDS) !==
            null && _a !== void 0
            ? _a
            : 60,
    );
    if (!Number.isFinite(value) || value < 0) return 60;
    return value;
})();
const toIsoDate = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
const ensureArray = (value) => (Array.isArray(value) ? value : []);
const normalizeTextInput = (value) => {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value))
        return String(value).trim();
    return '';
};
const normalizeEmail = (value) => {
    const email = normalizeTextInput(value).toLowerCase();
    if (!email) return undefined;
    return email.includes('@') ? email : undefined;
};
const resolvePublicSubmissionBaseUrl = () => {
    const configuredBaseUrl = (
        process.env.PUBLIC_PROFILE_SUBMISSION_BASE_URL ||
        'https://ps.envi.com.pl/#/public/profile-submission'
    ).trim();
    const baseUrl = configuredBaseUrl
        .replace(/\/React(?=\/#\/)/i, '')
        .replace(/\/+$/, '');
    if (!baseUrl) return 'https://ps.envi.com.pl/#/public/profile-submission';
    if (/#[/]?public\/profile-submission$/i.test(baseUrl)) return baseUrl;
    if (/\/public\/profile-submission$/i.test(baseUrl))
        return baseUrl.replace(
            /\/public\/profile-submission$/i,
            '/#/public/profile-submission',
        );
    if (baseUrl.includes('#/')) return `${baseUrl}/public/profile-submission`;
    return `${baseUrl}/#/public/profile-submission`;
};
class PublicProfileSubmissionController {
    constructor() {
        this.repository = new PublicProfileSubmissionRepository_1.default();
    }
    static getInstance() {
        if (!this.instance)
            this.instance = new PublicProfileSubmissionController();
        return this.instance;
    }
    static createOrRefreshLink(personId, createdByPersonId, params) {
        return __awaiter(this, void 0, void 0, function* () {
            const instance = this.getInstance();
            const sendNowRequested = Boolean(
                params === null || params === void 0 ? void 0 : params.sendNow,
            );
            const requestedRecipient = normalizeEmail(
                params === null || params === void 0
                    ? void 0
                    : params.recipientEmail,
            );
            if (
                (params === null || params === void 0
                    ? void 0
                    : params.recipientEmail) &&
                !requestedRecipient
            ) {
                throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                    'Invalid recipient email',
                    'INVALID_EMAIL',
                    400,
                );
            }
            let resolvedRecipientEmail = requestedRecipient;
            if (sendNowRequested && !resolvedRecipientEmail) {
                resolvedRecipientEmail =
                    yield instance.repository.getDefaultRecipientEmailForPerson(
                        personId,
                    );
            }
            if (sendNowRequested && !resolvedRecipientEmail) {
                throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                    'Recipient email is required for sendNow',
                    'RECIPIENT_EMAIL_REQUIRED',
                    400,
                );
            }
            yield instance.ensureLinkRecoveryNotRateLimited(personId);
            const token =
                PublicProfileSubmissionRepository_1.default.generateToken(32);
            const tokenHash =
                PublicProfileSubmissionRepository_1.default.hashToken(token);
            const expiresAt = new Date(
                Date.now() + LINK_TTL_DAYS * 24 * 60 * 60 * 1000,
            );
            const submissionId = yield ToolsDb_1.default.transaction((conn) =>
                __awaiter(this, void 0, void 0, function* () {
                    yield instance.repository.revokeActiveLinksForPerson(
                        personId,
                        conn,
                    );
                    const linkId = yield instance.repository.createLink(
                        {
                            personId,
                            tokenHash,
                            expiresAt: toIsoDate(expiresAt),
                            createdByPersonId,
                        },
                        conn,
                    );
                    const createdSubmissionId =
                        yield instance.repository.createSubmission(
                            { linkId, personId },
                            conn,
                        );
                    yield instance.repository.updateSubmissionLastLinkEvent({
                        submissionId: createdSubmissionId,
                        recipientEmail: resolvedRecipientEmail,
                        eventType: 'LINK_GENERATED',
                        eventByPersonId: createdByPersonId,
                        conn,
                    });
                    return createdSubmissionId;
                }),
            );
            const baseUrl = resolvePublicSubmissionBaseUrl();
            const url = `${baseUrl}/${token}`;
            let dispatchStatus = 'LINK_GENERATED';
            if (sendNowRequested) {
                const recipientForSend = resolvedRecipientEmail;
                try {
                    yield instance.sendSubmissionLinkMail(
                        recipientForSend,
                        url,
                        expiresAt,
                    );
                    dispatchStatus = 'LINK_SENT';
                } catch (error) {
                    dispatchStatus = 'LINK_SEND_FAILED';
                    console.error(
                        'Public profile submission link send failed:',
                        error,
                    );
                }
                try {
                    yield ToolsDb_1.default.transaction((conn) =>
                        __awaiter(this, void 0, void 0, function* () {
                            yield instance.repository.updateSubmissionLastLinkEvent(
                                {
                                    submissionId,
                                    recipientEmail: recipientForSend,
                                    eventType: dispatchStatus,
                                    eventByPersonId: createdByPersonId,
                                    conn,
                                },
                            );
                        }),
                    );
                } catch (error) {
                    console.error(
                        'Public profile submission link event update failed:',
                        error,
                    );
                }
            }
            return {
                personId,
                token,
                url,
                expiresAt: expiresAt.toISOString(),
                submissionId,
                dispatch: {
                    recipientEmail: resolvedRecipientEmail,
                    status: dispatchStatus,
                    eventAt: new Date().toISOString(),
                    sendNowRequested,
                },
            };
        });
    }
    static getPublicSubmission(token) {
        return __awaiter(this, void 0, void 0, function* () {
            const instance = this.getInstance();
            const { link, submission } =
                yield instance.resolveLinkAndSubmission(token);
            const items = yield instance.repository.getSubmissionItems(
                submission.id,
            );
            return instance.buildSubmissionView(link.id, submission, items);
        });
    }
    static requestVerifyCode(token, emailRaw) {
        return __awaiter(this, void 0, void 0, function* () {
            const instance = this.getInstance();
            const email = normalizeTextInput(emailRaw).toLowerCase();
            if (!email || !email.includes('@')) {
                throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                    'Email is required',
                    'INVALID_EMAIL',
                    400,
                );
            }
            const code =
                PublicProfileSubmissionRepository_1.default.generateCode();
            const codeHash =
                PublicProfileSubmissionRepository_1.default.hashToken(code);
            const expiresAt = new Date(
                Date.now() + VERIFY_CODE_TTL_MINUTES * 60 * 1000,
            );
            const { submission } = yield ToolsDb_1.default.transaction((conn) =>
                __awaiter(this, void 0, void 0, function* () {
                    const resolved =
                        yield instance.resolveLinkAndSubmissionInConn(
                            token,
                            conn,
                        );
                    yield instance.repository.updateSubmissionEmail(
                        resolved.submission.id,
                        email,
                        conn,
                    );
                    yield instance.repository.createVerifyChallenge(
                        {
                            submissionId: resolved.submission.id,
                            email,
                            codeHash,
                            expiresAt: toIsoDate(expiresAt),
                            attemptsLeft: VERIFY_CODE_MAX_ATTEMPTS,
                        },
                        conn,
                    );
                    return resolved;
                }),
            );
            yield ToolsMail_1.default.sendMail({
                to: email,
                subject: 'Verification code - Public Profile Submission',
                text: `Your verification code: ${code}. The code is valid for ${VERIFY_CODE_TTL_MINUTES} minutes.`,
                footer: ToolsMail_1.default.makeENVIFooter(),
            });
            return {
                submissionId: submission.id,
                email,
                codeExpiresAt: expiresAt.toISOString(),
            };
        });
    }
    static confirmVerifyCode(token, emailRaw, codeRaw) {
        return __awaiter(this, void 0, void 0, function* () {
            const instance = this.getInstance();
            const email = normalizeTextInput(emailRaw).toLowerCase();
            const code = normalizeTextInput(codeRaw);
            if (!email || !code) {
                throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                    'Email and code are required',
                    'INVALID_VERIFY_INPUT',
                    400,
                );
            }
            const sessionToken =
                PublicProfileSubmissionRepository_1.default.generateToken(48);
            const sessionTokenHash =
                PublicProfileSubmissionRepository_1.default.hashToken(
                    sessionToken,
                );
            const sessionExpiresAt = new Date(
                Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000,
            );
            const codeHash =
                PublicProfileSubmissionRepository_1.default.hashToken(code);
            const submission = yield ToolsDb_1.default.transaction((conn) =>
                __awaiter(this, void 0, void 0, function* () {
                    const { submission: resolvedSubmission } =
                        yield instance.resolveLinkAndSubmissionInConn(
                            token,
                            conn,
                        );
                    const challenge =
                        yield instance.repository.getActiveVerifyChallenge(
                            resolvedSubmission.id,
                            email,
                            conn,
                        );
                    if (!challenge) {
                        throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                            'Verification code required',
                            PublicProfileSubmissionErrors_1
                                .PublicProfileSubmissionErrorCodes
                                .EMAIL_VERIFY_REQUIRED,
                            401,
                        );
                    }
                    const isExpired =
                        new Date(challenge.ExpiresAt).getTime() <= Date.now();
                    if (isExpired) {
                        yield instance.repository.consumeVerifyChallenge(
                            challenge.Id,
                            conn,
                        );
                        throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                            'Verification code expired',
                            PublicProfileSubmissionErrors_1
                                .PublicProfileSubmissionErrorCodes
                                .EMAIL_CODE_EXPIRED,
                            400,
                        );
                    }
                    if (Number(challenge.AttemptsLeft) <= 0) {
                        throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                            'Verification attempts exceeded',
                            PublicProfileSubmissionErrors_1
                                .PublicProfileSubmissionErrorCodes
                                .EMAIL_VERIFY_RATE_LIMITED,
                            429,
                        );
                    }
                    if (challenge.CodeHash !== codeHash) {
                        yield instance.repository.decrementVerifyAttempts(
                            challenge.Id,
                            conn,
                        );
                        const refreshed =
                            yield instance.repository.getActiveVerifyChallenge(
                                resolvedSubmission.id,
                                email,
                                conn,
                            );
                        if (!refreshed || Number(refreshed.AttemptsLeft) <= 0) {
                            throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                                'Verification attempts exceeded',
                                PublicProfileSubmissionErrors_1
                                    .PublicProfileSubmissionErrorCodes
                                    .EMAIL_VERIFY_RATE_LIMITED,
                                429,
                            );
                        }
                        throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                            'Invalid verification code',
                            PublicProfileSubmissionErrors_1
                                .PublicProfileSubmissionErrorCodes
                                .EMAIL_CODE_INVALID,
                            400,
                        );
                    }
                    yield instance.repository.consumeVerifyChallenge(
                        challenge.Id,
                        conn,
                    );
                    yield instance.repository.createSubmissionSession(
                        {
                            submissionId: resolvedSubmission.id,
                            email,
                            sessionTokenHash,
                            expiresAt: toIsoDate(sessionExpiresAt),
                        },
                        conn,
                    );
                    return resolvedSubmission;
                }),
            );
            return {
                submissionId: submission.id,
                publicSessionToken: sessionToken,
                expiresAt: sessionExpiresAt.toISOString(),
            };
        });
    }
    static getDraft(token, bearerToken) {
        return __awaiter(this, void 0, void 0, function* () {
            const instance = this.getInstance();
            const { submission } =
                yield instance.resolveLinkAndSubmission(token);
            yield instance.ensureVerifiedSession(submission.id, bearerToken);
            const items = yield instance.repository.getSubmissionItems(
                submission.id,
            );
            return instance.buildDraftPayload(submission.status, items);
        });
    }
    static updateDraft(token, bearerToken, payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const instance = this.getInstance();
            const { submission } =
                yield instance.resolveLinkAndSubmission(token);
            yield instance.ensureVerifiedSession(submission.id, bearerToken);
            if (submission.status === 'CLOSED') {
                throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                    'Submission already closed',
                    'SUBMISSION_ALREADY_CLOSED',
                    409,
                );
            }
            yield ToolsDb_1.default.transaction((conn) =>
                __awaiter(this, void 0, void 0, function* () {
                    if (payload.experiences !== undefined) {
                        yield instance.replacePendingItemsByType(
                            submission.id,
                            'EXPERIENCE',
                            ensureArray(payload.experiences),
                            conn,
                        );
                    }
                    if (payload.educations !== undefined) {
                        yield instance.replacePendingItemsByType(
                            submission.id,
                            'EDUCATION',
                            ensureArray(payload.educations),
                            conn,
                        );
                    }
                    if (payload.skills !== undefined) {
                        yield instance.replacePendingItemsByType(
                            submission.id,
                            'SKILL',
                            ensureArray(payload.skills),
                            conn,
                        );
                    }
                }),
            );
            const refreshedItems = yield instance.repository.getSubmissionItems(
                submission.id,
            );
            return instance.buildDraftPayload(
                submission.status,
                refreshedItems,
            );
        });
    }
    static submit(token, bearerToken) {
        return __awaiter(this, void 0, void 0, function* () {
            const instance = this.getInstance();
            const { submission } =
                yield instance.resolveLinkAndSubmission(token);
            yield instance.ensureVerifiedSession(submission.id, bearerToken);
            yield ToolsDb_1.default.transaction((conn) =>
                __awaiter(this, void 0, void 0, function* () {
                    yield instance.repository.markSubmissionSubmitted(
                        submission.id,
                        conn,
                    );
                }),
            );
            const refreshed =
                yield instance.repository.findSubmissionByIdUnscoped(
                    submission.id,
                );
            if (!refreshed)
                throw new Error('Submission not found after submit');
            return refreshed;
        });
    }
    static analyzeFile(token, bearerToken, file, hint) {
        return __awaiter(this, void 0, void 0, function* () {
            const instance = this.getInstance();
            const { submission } =
                yield instance.resolveLinkAndSubmission(token);
            yield instance.ensureVerifiedSession(submission.id, bearerToken);
            const result = yield ToolsAI_1.default.analyzePersonProfile(
                file,
                hint,
            );
            return {
                experiences: result.experiences,
                educations: result.educations,
                skills: result.skills,
                _extractedText: result.text,
                _model: result._model,
                _usage: result._usage,
            };
        });
    }
    static searchSubmissions(personId, status) {
        return __awaiter(this, void 0, void 0, function* () {
            const instance = this.getInstance();
            return instance.repository.searchSubmissionsForPerson(
                personId,
                status,
            );
        });
    }
    static getSubmissionDetails(personId, submissionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const instance = this.getInstance();
            const submission = yield instance.repository.findSubmissionById(
                personId,
                submissionId,
            );
            if (!submission) {
                throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                    'Submission not found',
                    'SUBMISSION_NOT_FOUND',
                    404,
                );
            }
            const items = yield instance.repository.getSubmissionItems(
                submission.id,
            );
            return instance.buildSubmissionView(
                submission.linkId,
                submission,
                items,
            );
        });
    }
    static reviewItem(
        personId,
        submissionId,
        itemId,
        decision,
        reviewerPersonId,
    ) {
        return __awaiter(this, void 0, void 0, function* () {
            const instance = this.getInstance();
            return ToolsDb_1.default.transaction((conn) =>
                __awaiter(this, void 0, void 0, function* () {
                    const submission =
                        yield instance.repository.findSubmissionById(
                            personId,
                            submissionId,
                        );
                    if (!submission) {
                        throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                            'Submission not found',
                            'SUBMISSION_NOT_FOUND',
                            404,
                        );
                    }
                    const item = yield instance.repository.getSubmissionItem(
                        submission.id,
                        itemId,
                        conn,
                    );
                    if (!item) {
                        throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                            'Submission item not found',
                            'ITEM_NOT_FOUND',
                            404,
                        );
                    }
                    if (item.itemStatus !== 'PENDING') {
                        throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                            'Item already resolved',
                            PublicProfileSubmissionErrors_1
                                .PublicProfileSubmissionErrorCodes
                                .ITEM_ALREADY_RESOLVED,
                            409,
                        );
                    }
                    let acceptedTargetId;
                    if (decision === 'ACCEPT') {
                        acceptedTargetId = yield instance.acceptItem(
                            submission.personId,
                            item,
                        );
                        yield instance.repository.markItemAccepted(
                            {
                                itemId: item.id,
                                reviewedByPersonId: reviewerPersonId,
                                acceptedTargetId,
                            },
                            conn,
                        );
                    } else {
                        yield instance.repository.markItemRejected(
                            {
                                itemId: item.id,
                                reviewedByPersonId: reviewerPersonId,
                            },
                            conn,
                        );
                    }
                    const pending = yield instance.repository.countPendingItems(
                        submission.id,
                        conn,
                    );
                    if (pending === 0) {
                        yield instance.repository.markSubmissionClosed(
                            submission.id,
                            conn,
                        );
                    }
                    return {
                        submissionId: submission.id,
                        itemId: item.id,
                        decision,
                        acceptedTargetId,
                        autoClosed: pending === 0,
                    };
                }),
            );
        });
    }
    static closeSubmission(personId, submissionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const instance = this.getInstance();
            return ToolsDb_1.default.transaction((conn) =>
                __awaiter(this, void 0, void 0, function* () {
                    const submission =
                        yield instance.repository.findSubmissionById(
                            personId,
                            submissionId,
                        );
                    if (!submission) {
                        throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                            'Submission not found',
                            'SUBMISSION_NOT_FOUND',
                            404,
                        );
                    }
                    const pending = yield instance.repository.countPendingItems(
                        submission.id,
                        conn,
                    );
                    if (pending > 0) {
                        throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                            'Cannot close submission with pending items',
                            'SUBMISSION_HAS_PENDING_ITEMS',
                            409,
                        );
                    }
                    yield instance.repository.markSubmissionClosed(
                        submission.id,
                        conn,
                    );
                    return { submissionId: submission.id, closed: true };
                }),
            );
        });
    }
    ensureLinkRecoveryNotRateLimited(personId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (LINK_RECOVERY_COOLDOWN_SECONDS <= 0) {
                return;
            }
            const latest = (yield this.repository.searchSubmissionsForPerson(
                personId,
            )).find((submission) => Boolean(submission.lastLinkEventAt));
            if (
                !(latest === null || latest === void 0
                    ? void 0
                    : latest.lastLinkEventAt)
            ) {
                return;
            }
            const lastEventAtMs = new Date(latest.lastLinkEventAt).getTime();
            if (!Number.isFinite(lastEventAtMs)) {
                return;
            }
            const elapsedMs = Date.now() - lastEventAtMs;
            const cooldownMs = LINK_RECOVERY_COOLDOWN_SECONDS * 1000;
            if (elapsedMs >= cooldownMs) {
                return;
            }
            const retryAfterSeconds = Math.max(
                1,
                Math.ceil((cooldownMs - elapsedMs) / 1000),
            );
            throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                `Link recovery is rate limited. Retry in ${retryAfterSeconds}s.`,
                PublicProfileSubmissionErrors_1
                    .PublicProfileSubmissionErrorCodes
                    .LINK_RECOVERY_RATE_LIMITED,
                429,
                retryAfterSeconds,
            );
        });
    }
    resolveLinkAndSubmission(token) {
        return __awaiter(this, void 0, void 0, function* () {
            const tokenHash =
                PublicProfileSubmissionRepository_1.default.hashToken(token);
            const link = yield this.repository.findLinkByTokenHash(tokenHash);
            if (!link || link.revokedAt) {
                throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                    'Invalid public token',
                    PublicProfileSubmissionErrors_1
                        .PublicProfileSubmissionErrorCodes.PUBLIC_TOKEN_INVALID,
                    404,
                );
            }
            if (new Date(link.expiresAt).getTime() <= Date.now()) {
                throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                    'Public token expired',
                    PublicProfileSubmissionErrors_1
                        .PublicProfileSubmissionErrorCodes.PUBLIC_TOKEN_EXPIRED,
                    410,
                );
            }
            const submission = yield this.repository.findSubmissionByLinkId(
                link.id,
            );
            if (!submission) {
                throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                    'Submission not found',
                    'SUBMISSION_NOT_FOUND',
                    404,
                );
            }
            return { link, submission };
        });
    }
    resolveLinkAndSubmissionInConn(token, conn) {
        return __awaiter(this, void 0, void 0, function* () {
            const tokenHash =
                PublicProfileSubmissionRepository_1.default.hashToken(token);
            const [rows] = yield conn.query(
                `SELECT Id, PersonId, TokenHash, ExpiresAt, RevokedAt
             FROM PublicProfileSubmissionLinks
             WHERE TokenHash = ?
             LIMIT 1`,
                [tokenHash],
            );
            const row = rows[0];
            if (!row || row.RevokedAt) {
                throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                    'Invalid public token',
                    PublicProfileSubmissionErrors_1
                        .PublicProfileSubmissionErrorCodes.PUBLIC_TOKEN_INVALID,
                    404,
                );
            }
            if (new Date(row.ExpiresAt).getTime() <= Date.now()) {
                throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                    'Public token expired',
                    PublicProfileSubmissionErrors_1
                        .PublicProfileSubmissionErrorCodes.PUBLIC_TOKEN_EXPIRED,
                    410,
                );
            }
            const submission = yield this.repository.ensureSubmissionForLink(
                row.Id,
                row.PersonId,
                conn,
            );
            return {
                link: {
                    id: row.Id,
                    personId: row.PersonId,
                    tokenHash: row.TokenHash,
                    expiresAt: row.ExpiresAt,
                },
                submission,
            };
        });
    }
    ensureVerifiedSession(submissionId, bearerToken) {
        return __awaiter(this, void 0, void 0, function* () {
            const token = (bearerToken || '').trim();
            if (!token) {
                throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                    'Public session token required',
                    PublicProfileSubmissionErrors_1
                        .PublicProfileSubmissionErrorCodes
                        .EMAIL_VERIFY_REQUIRED,
                    401,
                );
            }
            const tokenHash =
                PublicProfileSubmissionRepository_1.default.hashToken(token);
            const session = yield this.repository.findActiveSessionByHash(
                submissionId,
                tokenHash,
            );
            if (!session) {
                throw new PublicProfileSubmissionErrors_1.PublicProfileSubmissionError(
                    'Email verification required',
                    PublicProfileSubmissionErrors_1
                        .PublicProfileSubmissionErrorCodes
                        .EMAIL_VERIFY_REQUIRED,
                    401,
                );
            }
            return session;
        });
    }
    replacePendingItemsByType(submissionId, itemType, items, conn) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.repository.deletePendingItemsByType(
                submissionId,
                itemType,
                conn,
            );
            for (const item of items) {
                yield this.repository.insertSubmissionItem(
                    {
                        submissionId,
                        itemType,
                        payload: item,
                        itemStatus: 'PENDING',
                    },
                    conn,
                );
            }
        });
    }
    acceptItem(personId, item) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const payload = item.payload;
            if (!payload) return undefined;
            if (item.itemType === 'EXPERIENCE') {
                const result =
                    yield ExperienceController_1.default.importFromDto(
                        personId,
                        [payload],
                    );
                return (_a = result.added[0]) === null || _a === void 0
                    ? void 0
                    : _a.id;
            }
            if (item.itemType === 'EDUCATION') {
                const result =
                    yield EducationController_1.default.importFromDto(
                        personId,
                        [payload],
                    );
                return (_b = result.added[0]) === null || _b === void 0
                    ? void 0
                    : _b.id;
            }
            const result = yield ProfileSkillController_1.default.importFromDto(
                personId,
                [payload],
            );
            return (_c = result.added[0]) === null || _c === void 0
                ? void 0
                : _c.id;
        });
    }
    buildDraftPayload(status, items) {
        return {
            status,
            experiences: items
                .filter((item) => item.itemType === 'EXPERIENCE')
                .map((item) =>
                    Object.assign(
                        { id: item.id, status: item.itemStatus },
                        item.payload,
                    ),
                ),
            educations: items
                .filter((item) => item.itemType === 'EDUCATION')
                .map((item) =>
                    Object.assign(
                        { id: item.id, status: item.itemStatus },
                        item.payload,
                    ),
                ),
            skills: items
                .filter((item) => item.itemType === 'SKILL')
                .map((item) =>
                    Object.assign(
                        { id: item.id, status: item.itemStatus },
                        item.payload,
                    ),
                ),
        };
    }
    buildSubmissionView(linkId, submission, items) {
        return {
            id: submission.id,
            linkId,
            personId: submission.personId,
            email: submission.email,
            status: submission.status,
            lastLinkRecipientEmail: submission.lastLinkRecipientEmail,
            lastLinkEventAt: submission.lastLinkEventAt,
            lastLinkEventType: submission.lastLinkEventType,
            lastLinkEventByPersonId: submission.lastLinkEventByPersonId,
            submittedAt: submission.submittedAt,
            closedAt: submission.closedAt,
            createdAt: submission.createdAt,
            updatedAt: submission.updatedAt,
            items: items.map((item) => ({
                id: item.id,
                itemType: item.itemType,
                itemStatus: item.itemStatus,
                payload: item.payload,
                acceptedTargetId: item.acceptedTargetId,
                reviewedByPersonId: item.reviewedByPersonId,
                reviewedAt: item.reviewedAt,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
            })),
        };
    }
    sendSubmissionLinkMail(email, url, expiresAt) {
        return __awaiter(this, void 0, void 0, function* () {
            const expiresLabel = expiresAt.toISOString().slice(0, 10);
            yield ToolsMail_1.default.sendMail({
                to: email,
                subject: 'Link do uzupe�nienia profilu',
                text: `Otrzymujesz link do uzupe�nienia profilu: ${url}\n\nLink wygasa: ${expiresLabel}.`,
                footer: ToolsMail_1.default.makeENVIFooter(),
            });
        });
    }
}
exports.default = PublicProfileSubmissionController;
//# sourceMappingURL=PublicProfileSubmissionController.js.map
export default PublicProfileSubmissionController;
