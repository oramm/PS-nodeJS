import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import session from 'express-session';
import { MongoClient } from 'mongodb';
import MongoStore from 'connect-mongo';
import dotenv from 'dotenv';
dotenv.config();

import './types/sessionTypes';
import { keys } from './setup/Sessions/credentials';
import multer from 'multer';
import Tools from './tools/Tools';
import ToolsDb from './tools/ToolsDb';
import ToolsMail from './tools/ToolsMail';
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

const uri = process.env.MONGODB_URI || keys.mongoDb.uri;
const client = new MongoClient(uri);

export const app = express();

//https://github.com/expressjs/session/issues/374#issuecomment-405282149
const corsOptions = {
    origin: [
        'http://localhost',
        'https://erp-envi.herokuapp.com',
        'https://erp.envi.com.pl',
        'https://ps.envi.com.pl',
    ],
    optionsSuccessStatus: 200, // For legacy browser support
    credentials: true,
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use((req, res, next) => {
    if (req.is('multipart/form-data')) {
        upload.any()(req, res, next);
        console.log('Multipart form data - upload.any()');
    } else next();
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
            err
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
    ToolsMail.sendServerErrorReport(err);
    // Można tutaj również dodać kod do łagodnego zamykania aplikacji, jeśli to konieczne
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(
        'Nieobsłużone odrzucenie Promise:',
        promise,
        'powód:',
        reason
    );
    // Podobnie jak powyżej, możemy tutaj dodać kod do łagodnego zamykania aplikacji
});

app.use((req, res, next) => {
    if (['POST', 'PUT', 'DELETE'].includes(req.method))
        req.parsedBody = Tools.parseObjectsJSON(req.body);
    //paserdquery GET
    else if (['GET'].includes(req.method))
        req.parsedQuery = Tools.parseObjectsJSON(req.query);
    next();
});

app.enable('trust proxy');

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
    })
);

app.use((req, res, next) => {
    console.log(
        `Session  middleware:: ID: ${req.sessionID} path: ${req.path} userName: ${req.session.userData?.userName} / ${req.session.userData?.systemRoleName} / ${process.env.NODE_ENV} `
    );
    next();
});

require('./setup/Sessions/Gauth2Routers');
require('./persons/PersonsRouters');

require('./persons/projectRoles/RolesRouters');
require('./entities/EntitiesRouters');
require('./invoices/InvoicesRouters');
require('./invoices/InvoiceItemsRouters');

require('./projects/ProjectsRouters');

require('./contracts/ContractsRouters');
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
require('./offers/OffersRouters');
require('./offers/OfferBond/OfferBondsRouters');
require('./offers/OfferInvitationMails/OfferInvitationMailsRouters');

require('./Admin/Cities/CitiesRouters');
require('./Admin/ContractRanges/ContractRangesRouters');

app.use(
    async (err: unknown, req: Request, res: Response, next: NextFunction) => {
        console.error('Wystąpił błąd:', err);

        await ToolsMail.sendServerErrorReport(err, req);

        const message = err instanceof Error ? err.message : 'Nieznany błąd';
        res.status(500).send({ errorMessage: message });
    }
);

app.listen(port, async () => {
    console.log(`server is listenning on port: ${port}`);
    ToolsDb.initialize();
    console.log('Db time zone set to +00:00');
});
