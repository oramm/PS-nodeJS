import express from 'express';
import cors from 'cors';
import session from 'express-session';

export var app = express();
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use(session({
    //name: 'nazwa test',
    secret: 'your-random-secret-19890913007',
    resave: true,
    saveUninitialized: true,
    rolling: true,
    cookie: { path: '/', httpOnly: true, secure: false, sameSite: 'lax' }
}));
app.enable('trust proxy');
const port = process.env.PORT || 3000;

//https://github.com/expressjs/session/issues/374#issuecomment-405282149
const corsOptions = {
    origin: ['https://erp-envi.herokuapp.com', 'http://localhost', 'https://erp.envi.com.pl', 'https://ps.envi.com.pl'],
    optionsSuccessStatus: 200, // For legacy browser support
    credentials: true,
}
app.use(cors(corsOptions));
//app.use(cors(corsOptionsDelegate));

const oAuthRouter = require('./setup/GAuth2/Gauth2Routers');
//app.use(oAuthRouter);

require('./persons/PersonsRouters');

require('./persons/projectRoles/RolesRouters');
require('./entities/EntitiesRouters');
require('./invoices/InvoicesRouters');
require('./invoices/InvoiceItemsRouters');

require('./contracts/ContractsRouters');
require('./contracts/contractTypes/ContractTypesRouters');
require('./contracts/milestones/MilestonesRouters');
require('./contracts/milestones/milestoneTypes/MilestoneTypesRouters');
require('./contracts/milestones/milestoneTemplates/MilestoneTemplatesRouters');
require('./contracts/milestones/cases/CasesRouters');
require('./contracts/milestones/cases/caseTypes/CaseTypesRouters');
require('./contracts/milestones/cases/caseTemplates/CaseTemplatesRouters');
require('./contracts/MilestoneTypeContractTypeAssociations/MilestoneTypeContractTypeAssociationsRouters');


const risksRouter = require('./contracts/milestones/cases/risks/RisksRouters');
app.use(risksRouter);

const risksReactionsRouter = require('./contracts/milestones/cases/risks/risksReactions/RisksReactionsRouters');
app.use(risksReactionsRouter);

require('./contracts/milestones/cases/tasks/TasksRouters');
require('./contracts/milestones/cases/tasks/taskTemplates/TaskTemplatesRouters');

require('./processes/ProcessesRouters');
require('./processes/ProcessStepsRouters');
require('./processes/processInstances/ProcessInstancesRouters'); require('./processes/processInstances/ProcessStepInstancesRouters');

require('./documentTemplates/DocumentTemplatesRouters');

require('./letters/LettersRouters');

const meetingsRouter = require('./meetings/MeetingsRouters');
app.use(meetingsRouter);

const meetingArrangementsRouter = require('./meetings/meetingArrangements/MeetingArrangementsRouters');
app.use(meetingArrangementsRouter);

const caseEventsRouter = require('./contracts/milestones/cases/caseEvents/CaseEventsRouters');
app.use(caseEventsRouter);

const materialCardsRouter = require('./contracts/materialCards/MaterialCardsRouters');
app.use(materialCardsRouter);

require('./projects/ProjectsRouters');

var server = app.listen(port, () => {
    console.log(`server is listenning on port: ${port}`);
});
