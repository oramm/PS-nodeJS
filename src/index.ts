import express from 'express';
import cors from 'cors';

var app = express();
const port = process.env.PORT || 3000;

var corsOptions = {
  origin: ['http://localhost', 'https://erp-envi.herokuapp.com', 'http://erp.envi.com.pl', 'http://ps.envi.com.pl'],
  optionsSuccessStatus: 200 // For legacy browser support
}
app.use(cors(corsOptions));

const personsRouter = require('./persons/PersonsRouters');
app.use(personsRouter);

const RolesRouter = require('./persons/projectRoles/RolesRouters');
app.use(RolesRouter);

const entitiesRouter = require('./entities/EntitiesRouters');
app.use(entitiesRouter);

const invoicesRouter = require('./invoices/InvoicesRouters');
app.use(invoicesRouter);

const invoiceItemsRouter = require('./invoices/InvoiceItemsRouters');
app.use(invoiceItemsRouter);

const contratcsRouter = require('./contracts/ContractsRouters');
app.use(contratcsRouter);

const contractTypesRouter = require('./contracts/contractTypes/ContractTypesRouters');
app.use(contractTypesRouter);

const milestonesRouter = require('./contracts/milestones/MilestonesRouters');
app.use(milestonesRouter);

const milestoneTypesRouter = require('./contracts/milestones/milestoneTypes/MilestoneTypesRouters');
app.use(milestoneTypesRouter);

const casesRouter = require('./contracts/milestones/cases/CasesRouters');
app.use(casesRouter);

const caseTypesRouter = require('./contracts/milestones/cases/caseTypes/CaseTypesRouters');
app.use(caseTypesRouter);

const risksRouter = require('./contracts/milestones/cases/risks/RisksRouters');
app.use(risksRouter);

const risksReactionsRouter = require('./contracts/milestones/cases/risks/risksReactions/RisksReactionsRouters');
app.use(risksReactionsRouter);

const tasksRouter = require('./contracts/milestones/cases/tasks/TasksRouters');
app.use(tasksRouter);

const processesRouter = require('./processes/ProcessesRouters');
app.use(processesRouter);

const processStepsRouter = require('./processes/ProcessStepsRouters');
app.use(processStepsRouter);

const processInstancesRouter = require('./processes/processInstances/ProcessInstancesRouters');
app.use(processInstancesRouter);

const processStepsInstancesRouter = require('./processes/processInstances/ProcessStepInstancesRouters');
app.use(processStepsInstancesRouter);

const documentTemplatesRouter = require('./documentTemplates/DocumentTemplatesRouters');
app.use(documentTemplatesRouter);

const lettersRouter = require('./letters/LettersRouters');
app.use(lettersRouter);

const meetingsRouter = require('./meetings/MeetingsRouters');
app.use(meetingsRouter);

const meetingArrangementsRouter = require('./meetings/meetingArrangements/MeetingArrangementsRouters');
app.use(meetingArrangementsRouter);

const caseEventsRouter = require('./contracts/milestones/cases/caseEvents/CaseEventsRouters');
app.use(caseEventsRouter);

const materialCardsRouter = require('./contracts/materialCards/MaterialCardsRouters');
app.use(materialCardsRouter);

const projectsRouter = require('./projects/ProjectsRouters');
app.use(projectsRouter);


var server = app.listen(port, () => {
  console.log(`server is listenning on port: ${port}`)
});