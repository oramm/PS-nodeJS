// sessionTypes.ts
import 'express-session';

declare module 'express-session' {
    interface SessionData {
        userData: {
            googleId: string;
            systemEmail: string;
            userName: string;
            picture: string;
            systemRoleName: string;
            systemRoleId: number;
        };
    }
}
