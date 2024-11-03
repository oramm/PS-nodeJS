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
    googleId: string;
    systemEmail: string;
    userName: string;
    picture: string;
    systemRoleName: string;
    systemRoleId: number;
}
