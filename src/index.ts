import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import session from 'express-session';
import { MongoClient } from 'mongodb';
import MongoStore from 'connect-mongo';
import { loadEnv } from './setup/loadEnv';
loadEnv();

import './types/sessionTypes';
import { keys } from './setup/Sessions/credentials';
import multer from 'multer';
import Tools from './tools/Tools';
import ToolsDb from './tools/ToolsDb';
import ToolsMail from './tools/ToolsMail';
import cron from 'node-cron';
import ScrumBackup from './ScrumSheet/ScrumBackup';
import ToolsGapi from './setup/Sessions/ToolsGapi';
import BugEventCaptureService from './bugEvents/BugEventCaptureService';
import BugEventRepository from './bugEvents/BugEventRepository';
import { resolveSeverity } from './bugEvents/BugPriority';
import { createHash, timingSafeEqual } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

declare global {
    namespace Express {
        interface Request {
            parsedBody: any;
            _fieldsToUpdate?: string[];
            parsedQuery: any;
        }
    }
}
const port = process.env.PORT || 3000;
const storage = multer.memoryStorage();
export const upload = multer({ storage: storage }); // Użyj multer.memoryStorage()

const uri = process.env.MONGO_URI || keys.mongoDb.uri;
const client = new MongoClient(uri);

export const app = express();
const bugEventCaptureService = BugEventCaptureService.getInstance();

const clientErrorPreAuthWindow = new Map<
    string,
    { windowStartMs: number; count: number }
>();
const clientErrorPostAuthWindow = new Map<
    string,
    { windowStartMs: number; count: number }
>();
const CLIENT_ERROR_WINDOW_MS = 60_000;
const CLIENT_ERROR_PREAUTH_MAX_REQUESTS_PER_WINDOW = 60;
const CLIENT_ERROR_MAX_REQUESTS_PER_WINDOW = 20;
const CLIENT_ERROR_RATE_LIMITER_MAX_KEYS = 10_000;

function resolveTrustProxySetting(): boolean | number | string {
    const raw = process.env.TRUST_PROXY;
    if (!raw || raw.trim().length === 0) {
        return process.env.NODE_ENV === 'production' ? 1 : false;
    }

    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;

    const asNumber = Number(raw);
    if (Number.isInteger(asNumber) && asNumber >= 0) {
        return asNumber;
    }

    return raw;
}

function pruneClientErrorRateLimitMap(
    windowMap: Map<string, { windowStartMs: number; count: number }>
): void {
    const now = Date.now();
    const staleThresholdMs = CLIENT_ERROR_WINDOW_MS * 2;

    for (const [key, state] of windowMap.entries()) {
        if (now - state.windowStartMs > staleThresholdMs) {
            windowMap.delete(key);
        }
    }

    if (windowMap.size <= CLIENT_ERROR_RATE_LIMITER_MAX_KEYS) {
        return;
    }

    const entriesByOldest = Array.from(windowMap.entries()).sort(
        (a, b) => a[1].windowStartMs - b[1].windowStartMs
    );
    const overflow = windowMap.size - CLIENT_ERROR_RATE_LIMITER_MAX_KEYS;

    for (let i = 0; i < overflow; i++) {
        windowMap.delete(entriesByOldest[i][0]);
    }
}

function sanitizeClientErrorPayload(raw: any): {
    message: string;
    stack?: string;
    path?: string;
    route?: string;
    userAgent?: string;
    userId?: string;
    statusCode?: number;
    tags?: string[];
} | null {
    if (!raw || typeof raw !== 'object') return null;

    if (typeof raw.message !== 'string') return null;
    const message = raw.message.trim().slice(0, 2000);
    if (!message) return null;

    const stack =
        typeof raw.stack === 'string' ? raw.stack.trim().slice(0, 12_000) : undefined;
    const path = typeof raw.path === 'string' ? raw.path.trim().slice(0, 500) : undefined;
    const route = typeof raw.route === 'string' ? raw.route.trim().slice(0, 500) : undefined;
    const userAgent =
        typeof raw.userAgent === 'string'
            ? raw.userAgent.trim().slice(0, 500)
            : undefined;
    const userId = typeof raw.userId === 'string' ? raw.userId.trim().slice(0, 120) : undefined;
    const statusCode =
        Number.isInteger(raw.statusCode) && raw.statusCode >= 0 && raw.statusCode <= 599
            ? Number(raw.statusCode)
            : undefined;

    const tags = Array.isArray(raw.tags)
        ? raw.tags
              .filter((tag: unknown) => typeof tag === 'string')
              .map((tag: string) => tag.trim().slice(0, 50))
              .filter((tag: string) => tag.length > 0)
              .slice(0, 10)
        : undefined;

    return {
        message,
        stack,
        path,
        route,
        userAgent,
        userId,
        statusCode,
        tags,
    };
}

function isClientErrorRateLimited(
    windowMap: Map<string, { windowStartMs: number; count: number }>,
    rateKey: string,
    maxRequestsPerWindow: number
): boolean {
    pruneClientErrorRateLimitMap(windowMap);

    const now = Date.now();
    const state = windowMap.get(rateKey);

    if (!state || now - state.windowStartMs > CLIENT_ERROR_WINDOW_MS) {
        windowMap.set(rateKey, { windowStartMs: now, count: 1 });
        return false;
    }

    if (state.count >= maxRequestsPerWindow) {
        return true;
    }

    state.count += 1;
    windowMap.set(rateKey, state);
    return false;
}

function makeClientErrorRateKey(remoteAddress: string): string {
    return createHash('sha256')
        .update(`${remoteAddress}|/client-error`)
        .digest('hex');
}

function isMatchingClientErrorSecret(
    expectedSecret: string,
    providedSecret: string
): boolean {
    const expectedBuffer = createHash('sha256')
        .update(expectedSecret, 'utf8')
        .digest();
    const providedBuffer = createHash('sha256')
        .update(providedSecret, 'utf8')
        .digest();

    return timingSafeEqual(expectedBuffer, providedBuffer);
}

function precheckClientErrorRequest(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const clientIp = req.ip || 'unknown';

    const preAuthRateKey = makeClientErrorRateKey(clientIp);
    if (
        isClientErrorRateLimited(
            clientErrorPreAuthWindow,
            preAuthRateKey,
            CLIENT_ERROR_PREAUTH_MAX_REQUESTS_PER_WINDOW
        )
    ) {
        res.status(429).send({ errorMessage: 'Too many requests' });
        return;
    }

    if (process.env.BUG_CLIENT_ERROR_ENABLED !== 'true') {
        res.status(404).send({ errorMessage: 'Not enabled' });
        return;
    }

    const allowSessionAuth = process.env.BUG_CLIENT_ERROR_ALLOW_SESSION !== 'false';
    const hasSessionAuth =
        allowSessionAuth &&
        Boolean(req.session?.userData?.userName || req.session?.userData?.systemRoleName);

    const expectedSecret = process.env.BUG_CLIENT_ERROR_SECRET;
    const providedSecret = String(req.headers['x-client-error-secret'] || '');
    const hasSecretAuth =
        Boolean(expectedSecret) &&
        Boolean(providedSecret) &&
        isMatchingClientErrorSecret(expectedSecret as string, providedSecret);

    if (!hasSessionAuth && !hasSecretAuth) {
        if (!expectedSecret && !allowSessionAuth) {
            console.warn(
                '[BugEvent] BUG_CLIENT_ERROR_ENABLED=true but both secret auth and session auth are unavailable.'
            );
            res.status(503).send({ errorMessage: 'Client error ingest misconfigured' });
            return;
        }

        res.status(403).send({ errorMessage: 'Forbidden' });
        return;
    }

    const postAuthRateKey = makeClientErrorRateKey(clientIp);
    if (
        isClientErrorRateLimited(
            clientErrorPostAuthWindow,
            postAuthRateKey,
            CLIENT_ERROR_MAX_REQUESTS_PER_WINDOW
        )
    ) {
        res.status(429).send({ errorMessage: 'Too many requests' });
        return;
    }

    res.locals.clientErrorIp = clientIp;
    next();
}

function parseCsvQuery(raw: unknown): string[] {
    if (typeof raw !== 'string') return [];
    return raw
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
}

async function generateDailyBugfixInbox(): Promise<void> {
    const enabled = process.env.BUGFIX_DAILY_INBOX_CRON_ENABLED === 'true';
    if (!enabled) return;

    const top = Math.max(1, Number(process.env.BUGFIX_DAILY_INBOX_TOP || '10') || 10);
    const out =
        process.env.BUGFIX_DAILY_INBOX_OUT ||
        path.resolve(process.cwd(), 'tmp', 'bugfix-daily-inbox.json');

    const repository = new BugEventRepository();
    const bugs = await repository.getInboxCandidates(top);
    const payload = {
        generatedAt: new Date().toISOString(),
        count: bugs.length,
        top,
        bugs,
    };

    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`[BugFixCron] Daily inbox generated: ${out} (${bugs.length} bugs)`);
}

async function runBugRetention(): Promise<void> {
    if (process.env.BUGFIX_RETENTION_CRON_ENABLED !== 'true') return;

    const months = Math.max(1, Number(process.env.BUGFIX_RETENTION_MONTHS || '6') || 6);
    const repository = new BugEventRepository();
    const result = await repository.archiveResolvedOlderThan(months);
    console.log(
        `[BugFixCron] Retention complete: archived=${result.archivedCount}, deleted=${result.deletedCount}, months=${months}`
    );
}

const corsOptions = {
    origin: [
        'http://localhost', // Port 80 (domyślny)
        'http://localhost:9000', // Apache - MUSISZ dodać jawnie
        'https://erp-envi.herokuapp.com',
        'https://erp.envi.com.pl',
        'https://ps.envi.com.pl',
    ],
    optionsSuccessStatus: 200, // For legacy browser support
    credentials: true,
};
app.use(cors(corsOptions));

app.set('trust proxy', resolveTrustProxySetting());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
// Do NOT automatically parse multipart/form-data here — let route-level
// multer middleware handle parsing to avoid consuming the request stream
// prematurely (which causes busboy 'Unexpected end of form' errors).
app.use((req: any, res: any, next: any) => {
    if (req.is && req.is('multipart/form-data')) {
        console.log(
            'Multipart form data detected - defer parsing to route-level multer',
        );
    }
    next();
});

// Przechowuje liczbę prób połączenia
let connectAttempts = 0;

async function connectWithRetry() {
    try {
        await client.connect();
        console.log('Connected to MongoDB.');
    } catch (err) {
        connectAttempts++;

        console.error(
            `Failed to connect to MongoDB on attempt ${connectAttempts}. Retrying...`,
            err,
        );

        // Oczekuje 5 sekund przed kolejną próbą
        setTimeout(connectWithRetry, 5000);
    }
}

connectWithRetry();

process.on('SIGTERM', async () => {
    try {
        console.log('SIGTERM signal received. Closing MongoDB connection...');
        await client.close();
        console.log('MongoDB connection closed.');

        console.info('Closing MySQL connection pool.');
        await ToolsDb.pool.end();
        console.info('Successfully closed MySQL connection pool');
    } catch (err) {
        console.error('Error occurred while closing the databases:', err);
    } finally {
        process.exit(0);
    }
});

process.on('uncaughtException', (err) => {
    console.error('Wystąpił nieobsłużony wyjątek:', err);
    bugEventCaptureService.capture({
        error: err,
        source: 'process_uncaught_exception',
        env: process.env.NODE_ENV || 'production',
    });
    void ToolsMail.sendServerErrorReport(err);
    // Można tutaj również dodać kod do łagodnego zamykania aplikacji, jeśli to konieczne
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(
        'Nieobsłużone odrzucenie Promise:',
        promise,
        'powód:',
        reason,
    );
    bugEventCaptureService.capture({
        error: reason,
        source: 'process_unhandled_rejection',
        env: process.env.NODE_ENV || 'production',
    });
    // Podobnie jak powyżej, możemy tutaj dodać kod do łagodnego zamykania aplikacji
});

setInterval(() => {
    void bugEventCaptureService.flushPendingWindows();
}, 30_000);

app.use((req, res, next) => {
    if (['POST', 'PUT', 'DELETE'].includes(req.method))
        req.parsedBody = Tools.parseObjectsJSON(req.body);
    //paserdquery GET
    else if (['GET'].includes(req.method))
        req.parsedQuery = Tools.parseObjectsJSON(req.query);
    next();
});

app.use(
    session({
        store: MongoStore.create({
            //clientPromise: client.connect(),
            client: client,
            collectionName: 'sessions',
        }),
        name: 'connect.sid',
        secret: 'your-random-secret-19890913007',
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production' ? true : false,
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 24 * 60 * 60 * 1000,
        },
    }) as any,
);

app.use((req, res, next) => {
    console.log(
        `Session  middleware:: ID: ${req.sessionID} path: ${req.path} userName: ${req.session.userData?.userName} / ${req.session.userData?.systemRoleName} / ${process.env.NODE_ENV} `,
    );
    next();
});

app.post('/client-error', precheckClientErrorRequest, express.json({ limit: '32kb' }), (req, res) => {
    const clientIp = String(res.locals.clientErrorIp || req.ip || 'unknown');

    const payload = sanitizeClientErrorPayload(req.body);
    if (!payload) {
        return res.status(400).send({ errorMessage: 'Invalid payload' });
    }

    const error = new Error(payload.message);
    if (payload.stack) {
        error.stack = payload.stack;
    }

    bugEventCaptureService.capture({
        error,
        source: 'frontend',
        env: process.env.NODE_ENV || 'production',
        requestContext: {
            path: payload.path || req.path,
            method: 'CLIENT',
            userAgent: payload.userAgent || req.headers['user-agent'],
            statusCode: payload.statusCode || 0,
            route: payload.route,
            ip: clientIp,
        },
        userContext: {
            userId: payload.userId,
        },
        tags: payload.tags,
    });

    return res.status(202).send({ ok: true });
});

app.get('/admin/bug-events', async (req, res) => {
    if (process.env.BUG_ADMIN_READ_MODEL_ENABLED !== 'true') {
        return res.status(404).send({ errorMessage: 'Not enabled' });
    }

    const roleRaw = String(req.session?.userData?.systemRoleName || '').toLowerCase();
    const roleTokens = roleRaw
        .split(/[\s,;|]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 0);
    const isAdmin = roleTokens.includes('admin') || roleTokens.includes('superadmin');
    if (!isAdmin) {
        return res.status(403).send({ errorMessage: 'Forbidden' });
    }

    const expectedSecret = process.env.BUG_ADMIN_READ_MODEL_SECRET;
    if (!expectedSecret) {
        return res.status(503).send({ errorMessage: 'Admin read model misconfigured' });
    }

    const providedSecret = String(req.headers['x-bug-admin-secret'] || '');
    if (!providedSecret || !isMatchingClientErrorSecret(expectedSecret, providedSecret)) {
        return res.status(403).send({ errorMessage: 'Forbidden' });
    }

    const statuses = parseCsvQuery(req.query.statuses) as any[];
    const severities = parseCsvQuery(req.query.severities) as any[];
    const sources = parseCsvQuery(req.query.sources) as any[];
    const fingerprint =
        typeof req.query.fingerprint === 'string' && req.query.fingerprint.trim().length > 0
            ? req.query.fingerprint.trim()
            : undefined;
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50) || 50));

    const repository = new BugEventRepository();
    const bugs = await repository.find({
        statuses: statuses.length > 0 ? (statuses as any) : undefined,
        severities: severities.length > 0 ? (severities as any) : undefined,
        sources: sources.length > 0 ? (sources as any) : undefined,
        fingerprint,
        limit,
    });

    return res.status(200).send({
        count: bugs.length,
        filters: {
            statuses,
            severities,
            sources,
            fingerprint,
            limit,
        },
        bugs,
    });
});

require('./setup/Sessions/Gauth2Routers');
require('./persons/PersonsRouters');
require('./persons/experiences/ExperienceRouters');

require('./persons/projectRoles/RolesRouters');
require('./persons/educations/EducationRouters');
require('./persons/skills/SkillsDictionaryRouters');
require('./persons/profileSkills/ProfileSkillRouters');
require('./persons/profileImport/PersonProfileImportRouters');
require('./persons/publicProfileSubmission/PublicProfileSubmissionRouters');
require('./entities/EntitiesRouters');
require('./invoices/InvoicesRouters');
require('./invoices/InvoiceItemsRouters');

require('./costInvoices/CostInvoicesRouter');

require('./projects/ProjectsRouters');

require('./contracts/ContractsRouters');
require('./meetings/MeetingsRouters');
require('./meetings/meetingArrangements/MeetingArrangementsRouters');
require('./contractMeetingNotes/ContractMeetingNotesRouters');
require('./contracts/contractTypes/ContractTypesRouters');
require('./contracts/milestones/MilestonesRouters');
require('./contracts/milestones/milestoneTypes/MilestoneTypesRouters');
require('./contracts/milestones/milestoneTemplates/MilestoneTemplatesRouters');
require('./contracts/milestones/cases/CasesRouters');
require('./contracts/milestones/cases/caseTypes/CaseTypesRouters');
require('./contracts/milestones/cases/caseTemplates/CaseTemplatesRouters');
require('./contracts/MilestoneTypeContractTypeAssociations/MilestoneTypeContractTypeAssociationsRouters');

require('./contracts/milestones/cases/tasks/TasksRouters');
require('./contracts/milestones/cases/tasks/taskTemplates/TaskTemplatesRouters');
require('./contracts/securities/SecuritiesRouters');

require('./financialAidProgrammes/FinancialAidProgrammesRouters');
require('./financialAidProgrammes/FocusAreas/FocusAreasRouters');
require('./financialAidProgrammes/FocusAreas/ApplicationCalls/ApplicationCallsRouters');
require('./financialAidProgrammes/Needs/NeedsRouters');

require('./documentTemplates/DocumentTemplatesRouters');

require('./letters/LettersRouters');

// ScrumSheet maintenance routes
require('./ScrumSheet/ScrumSheetRouters');
require('./offers/OffersRouters');
require('./offers/OfferBond/OfferBondsRouters');
require('./offers/OfferInvitationMails/OfferInvitationMailsRouters');

require('./Admin/Cities/CitiesRouters');
require('./Admin/ContractRanges/ContractRangesRouters');

app.use(
    async (err: unknown, req: Request, res: Response, next: NextFunction) => {
        console.error('Wystąpił błąd:', err);

        const message = err instanceof Error ? err.message : 'Nieznany błąd';
        const severity = resolveSeverity({
            source: 'express_error_middleware',
            env: process.env.NODE_ENV || 'production',
            message,
        });

        bugEventCaptureService.capture({
            error: err,
            source: 'express_error_middleware',
            env: process.env.NODE_ENV || 'production',
            requestContext: {
                path: req.path,
                method: req.method,
                statusCode: 500,
                requestId: req.headers['x-request-id'],
            },
            userContext: {
                userName: req.session?.userData?.userName,
                systemRoleName: req.session?.userData?.systemRoleName,
            },
        });

        const shouldSendEmail =
            process.env.BUG_ERROR_MAIL_CRITICAL_ONLY === 'true'
                ? severity === 'critical'
                : true;
        if (shouldSendEmail) {
            void ToolsMail.sendServerErrorReport(err, req);
        }

        res.status(500).send({ errorMessage: message });
    },
);

app.listen(port, async () => {
    console.log(`server is listenning on port: ${port}`);
    ToolsDb.initialize();
    console.log('Db time zone set to +00:00');
});

cron.schedule('0 5 * * 1', async () => {
    console.log('Uruchamianie zaplanowanego zadania kopii zapasowej...');
    try {
        await ToolsGapi.gapiReguestHandler(
            null,
            null as any,
            ScrumBackup.backupScrumSheet,
            [],
            ScrumBackup,
        );
    } catch (error) {
        console.error('Błąd podczas wykonywania zaplanowanego zadania:', error);
    }
});

if (process.env.BUGFIX_DAILY_INBOX_CRON_ENABLED === 'true') {
    const expr = process.env.BUGFIX_DAILY_INBOX_CRON_EXPRESSION || '30 6 * * *';
    cron.schedule(expr, async () => {
        try {
            await generateDailyBugfixInbox();
        } catch (error) {
            console.error('[BugFixCron] Daily inbox failed:', error);
        }
    });
}

if (process.env.BUGFIX_RETENTION_CRON_ENABLED === 'true') {
    const expr = process.env.BUGFIX_RETENTION_CRON_EXPRESSION || '30 3 * * *';
    cron.schedule(expr, async () => {
        try {
            await runBugRetention();
        } catch (error) {
            console.error('[BugFixCron] Retention failed:', error);
        }
    });
}
