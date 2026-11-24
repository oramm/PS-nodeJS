// sessionTypes.ts
import 'express-session';
import { Credentials } from 'google-auth-library';
import type { ContractScope } from '../persons/projectAssignments/projectMembership';

declare module 'express-session' {
    interface SessionData {
        userData: UserData;
        credentials: Credentials;
    }
}

export interface UserData {
    enviId: number;
    googleId?: string;
    microsoftId?: string;
    systemEmail: string;
    userName: string;
    picture: string;
    systemRoleName: SystemRoleName;
    systemRoleId: number;
    /** Sesję założył agent tej osoby jej kluczem (SBZ-1, src/sbAccess/sbAgentKeyAuth.ts). */
    isPersonAgent?: boolean;
    /** Poziom "baza PS" agenta osoby (Dostępy SB): 'ro' przechodzi tylko trasy odczytu (AGD-1). */
    personAgentPsDb?: 'ro' | 'rw';
}

export enum SystemRoleName {
    ADMIN = 'ADMIN',
    ENVI_MANAGER = 'ENVI_MANAGER',
    ENVI_EMPLOYEE = 'ENVI_EMPLOYEE',
    ENVI_COOPERATOR = 'ENVI_COOPERATOR',
    EXTERNAL_USER = 'EXTERNAL_USER',
    CONTRACT_WORKER = 'CONTRACT_WORKER',
    CLIENT = 'CLIENT',
}

/**
 * Projekty (Projects.OurId), do których zalogowany ma dostęp. Ustawiane przez
 * projectScopedPolicy dla ról ograniczonych zakresem (CONTRACT_WORKER, CLIENT, ENVI_COOPERATOR;
 * EXTERNAL_USER ma zakres po kontraktach, filtrowany w LetterRepository);
 * dla pozostałych ról jest undefined, co repozytoria interpretują jako brak ograniczeń.
 */
export type ProjectScope = {
    projectOurIds: string[];
};

declare global {
    namespace Express {
        interface Request {
            projectScope?: ProjectScope;
            salesInvoiceScope?: ContractScope;
        }
    }
}

export type SessionTask = {
    /** Wynik Pomocy jest prywatny dla osobistej sesji autora. */
    pomocOwnerId?: number;
    status: 'processing' | 'done' | 'error';
    result?: any;
    error?: string;
    progressMessage?: string;
    percent?: number;
    timeout?: NodeJS.Timeout;
};
