export const SB_ACCESS_STATUSES = [
    'INVITED',
    'ACTIVE',
    'BLOCKED',
    'REVOKED',
] as const;
export const SB_ACCESS_ACTIONS = [
    'SEED',
    'INVITE',
    'ACTIVATE',
    'BLOCK',
    'UNBLOCK',
    'REVOKE',
    'LINK_GITHUB',
] as const;
export const SB_ACCESS_RESULTS = ['OK', 'PARTIAL', 'FAILED'] as const;

export type SbAccessStatus = (typeof SB_ACCESS_STATUSES)[number];
export type SbAccessAction = (typeof SB_ACCESS_ACTIONS)[number];
export type SbAccessResult = (typeof SB_ACCESS_RESULTS)[number];

export interface SbAccessStateInput {
    statusCode: SbAccessStatus;
    githubLogin?: string | null;
    githubInvitationId?: number | null;
    drivePermissionId?: string | null;
    isGrantedManually?: boolean;
}

export interface SbAccessRecord {
    id: number;
    personId: number;
    statusCode: SbAccessStatus;
    githubLogin: string | null;
    githubInvitationId: number | null;
    drivePermissionId: string | null;
    isGrantedManually: boolean;
    createdAt: Date;
    updatedAt: Date;
    name?: string;
    surname?: string;
    systemEmail?: string | null;
}

export interface SbAccessEventInput {
    personId: number;
    actionCode: SbAccessAction;
    requestedByPersonId?: number | null;
    resultCode: SbAccessResult;
    /** Uwaga lub wynik operacji; wołający nie może przekazywać tokenów ani sekretów. */
    note?: string | null;
}

export interface SbAccessEventRecord extends SbAccessEventInput {
    id: number;
    requestedByPersonId: number | null;
    note: string | null;
    createdAt: Date;
    requestedByName: string | null;
    requestedBySurname: string | null;
    actionName: string;
}

export interface SbAccessTransitionInput extends SbAccessEventInput {
    state?: SbAccessStateInput;
}

/** Konto osoby w PS widziane przez moduł SB (adres logowania, rola systemowa). */
export interface SbPersonAccount {
    personId: number;
    name: string;
    surname: string;
    systemEmail: string | null;
    isActive: boolean;
    systemRoleName: string | null;
    /** Tylko na liście kandydatów: obecny stan w rejestrze (null albo REVOKED). */
    statusCode?: SbAccessStatus | null;
}

/** Wynik operacji zapisany w historii i oddany klientowi. */
export interface SbAccessOperationOutcome {
    result: SbAccessResult;
    note: string;
    state: SbAccessRecord | null;
}
