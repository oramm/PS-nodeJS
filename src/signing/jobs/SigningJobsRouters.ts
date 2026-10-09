import { app } from '../../index';
import GoogleSigningDrive from './GoogleSigningDrive';
import SigningJobRepository from './SigningJobRepository';
import SigningJobsController, {
    defaultScopeGuard,
    defaultTransaction,
} from './SigningJobsController';
import { registerSigningRoutes } from './SigningRoutes';

/**
 * Montaz tras zlecen podpisu (SIG-2) z produkcyjnymi zaleznosciami. Opis tras: SigningRoutes.ts.
 * Trasy programu (/signing/jobs/:token...) sa wyjete z bramki sesji w requireSession.
 */
registerSigningRoutes(
    app,
    new SigningJobsController({
        repository: new SigningJobRepository(),
        drive: new GoogleSigningDrive(),
        now: () => new Date(),
        runInTransaction: defaultTransaction,
        assertLetterInScope: defaultScopeGuard,
    })
);
