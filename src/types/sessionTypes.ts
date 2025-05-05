// sessionTypes.ts
import 'express-session';
import { Credentials } from 'google-auth-library';

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
}

export enum SystemRoleName {
    ADMIN = 'ADMIN',
    ENVI_MANAGER = 'ENVI_MANAGER',
    ENVI_EMPLOYEE = 'ENVI_EMPLOYEE',
    ENVI_COOPERATOR = 'ENVI_COOPERATOR',
    EXTERNAL_USER = 'EXTERNAL_USER',
}

export type SessionTask = {
    status: 'processing' | 'done' | 'error';
    result?: any;
    error?: string;
    progressMesage?: string;
    percent?: number;
    timeout?: NodeJS.Timeout;
};
