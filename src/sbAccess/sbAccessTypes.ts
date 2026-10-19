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
    'SET_LEVELS',
] as const;
export const SB_ACCESS_RESULTS = ['OK', 'PARTIAL', 'FAILED'] as const;

export const SB_REPO_LEVELS = ['none', 'read', 'write'] as const;
export const SB_PS_DB_LEVELS = ['none', 'ro', 'rw'] as const;
export const SB_DRIVE_LEVELS = ['none', 'connector'] as const;
export const SB_MAILBOX_PATTERN = /^[a-z0-9-]{1,40}$/;
export const SB_MAX_MAILBOXES = 20;

export interface SbAccessLevels {
    repos: (typeof SB_REPO_LEVELS)[number];
    psDb: (typeof SB_PS_DB_LEVELS)[number];
    drive: (typeof SB_DRIVE_LEVELS)[number];
    /** Kody skrzynek poczty (np. faktury, marek); bez haseł. */
    mail: string[];
}

export type SbAccessStatus = (typeof SB_ACCESS_STATUSES)[number];
export type SbAccessAction = (typeof SB_ACCESS_ACTIONS)[number];
export type SbAccessResult = (typeof SB_ACCESS_RESULTS)[number];

export interface SbOwnAccessView {
    status: 'INVITED' | 'ACTIVE';
    githubState: 'PENDING' | 'LINKED' | 'UNLINKED';
    githubLogin: string | null;
    driveState: 'READY' | 'MISSING';
    isGrantedManually: boolean;
}

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
    /** Poziomy dostępu; brak wpisu w bazie = wszystko 'none' / []. */
    levels: SbAccessLevels;
    createdAt: Date;
    updatedAt: Date;
    name?: string;
    surname?: string;
    systemEmail?: string | null;
    /** Tylko w liście rejestru: znacznik StaffMembers.CanManageSbAccess (administrator SB). */
    canManageSb?: boolean;
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
