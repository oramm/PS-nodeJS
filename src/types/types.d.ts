// sessionTypes.ts
import e from 'express';
import 'express-session';

declare module 'express-session' {
    interface SessionData {
        userData: {
            enviId: number;
            googleId: string;
            systemEmail: string;
            userName: string;
            picture: string;
            systemRoleName: string;
            systemRoleId: number;
        };
    }
}

export interface RepositoryDataItem {
    id?: number;
}

export interface SystemRoleData {
    id: number;
    systemName: SystemRoleName;
}

export interface UserData {
    googleId: string;
    picture: string;
    systemEmail: string;
    systemRoleId: number;
    systemRoleName: SystemRoleName;
    userName: string;
}

export interface ProjectData extends RepositoryDataItem {
    name: string;
    alias: string;
    comment: string;
    ourId: string;
    status: string;
    dotationValue: number;
    lettersGdFolderId: string;
    startDate: string;
    endDate: string;
    gdFolderId: string;
    _gdFolderUrl: string;
    _ourId_Alias: string;
}

export interface ContractData extends RepositoryDataItem {
    name: string;
    number: string;
    alias: string;
    comment: string;
    startDate: string;
    endDate: string;
    guaranteeEndDate: string;
    _project: Project;
    status: string;
    gdFolderId: string;
    meetingProtocolsGdFolderId: string;
    _type: ContractType;
    value: number;
    _remainingNotScheduledValue?: number;
    _remainingNotIssuedValue?: number;
    _folderName: string;
    _gdFolderUrl: string;
    _ourIdOrNumber_Alias: string;
    _ourIdOrNumber_Name: string;
    _lastUpdated: string;
    _contractors?: Entity[];
    _engineers?: Entity[];
    _employers?: Entity[];
}

export interface OurContractData extends Contract {
    _admin: Person;
    _manager: Person;
    ourId: string;
}

export interface OtherContractData extends Contract {
    _contractors: Entity[];
    _ourContract: OurContract;
}

export interface ContractsSettlementDataData {
    id: number;
    ourId: string;
    value: number;
    totalIssuedValue: number;
    remainingValue: number;
}

export interface MilestoneData extends RepositoryDataItem {
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    gdFolderId: string;
    _type: MilestoneType;
    _parent: OurContract | OtherContract;
    _FolderNumber_TypeName_Name: string;
    _folderName: string;
    _gdFolderUrl: string;
}

export interface CaseData extends RepositoryDataItem {
    name: string;
    number: number;
    description: string;
    gdFolderId: string;
    _parent: Milestone;
    _type: CaseType;
    _folderName: string;
    _displayNumber: string;
    _gdFolderUrl: string;
    _typeFolderNumber_TypeName_Number_Name: string;
}

export interface TaskData extends RepositoryDataItem {
    name: string;
    description: string;
    deadline: string;
    _parent: Case;
    _editor: Person;
    _lastUpdated: string;
}

export interface ContractTypeData extends RepositoryDataItem {
    name: string;
    description: string;
    isOur: boolean;
    status: string;
}

export interface MilestoneTypeData extends RepositoryDataItem {
    name: string;
    description: string;
    isInScrumByDefault: boolean;
    isUniquePerContract: boolean;
    _isDefault: boolean;
    _contractType: ContractType;
    _folderNumber_MilestoneTypeName: string;
    _folderNumber: string;
}

export interface CaseTypeData extends RepositoryDataItem {
    name: string;
    folderNumber: string;
    _folderName: string;
    isDefault: boolean;
    isUniquePerMilestone: boolean;
    _milestoneType: MilestoneType;
    isDefault: boolean;
}

export interface LetterData extends RepositoryDataItem {
    number: string;
    description: string;
    creationDate: string;
    registrationDate: string;
    _project: Project;
    _entitiesMain: Entity[];
    _entitiesCc: Entity[];
    _editor: Person;
    _lastUpdated: string;
    _cases: Case[];
    _gdFolderUrl?: string;
    letterFilesCount: number;
}

export interface OurLetterData extends Letter {
    isOur: true;
    _documentOpenUrl?: string;
}

export interface IncomingLetterData extends Letter {
    isOur: false;
}

export interface EntityData extends RepositoryDataItem {
    name?: string;
    address?: string;
    taxNumber?: string;
    www?: string;
    email?: string;
    phone?: string;
}

export interface PersonData extends RepositoryDataItem {
    name: string;
    surname: string;
    email: string;
    cellPhone?: string;
    _alias?: string;
    position?: string;
    _entity?: Entity;
}

export interface DocumentTemplateData extends RepositoryDataItem {
    name: string;
    description?: string;
    gdId: string;
    _contents?: {
        id?: number;
        gdId?: string;
        alias: string;
        caseTypeId: number | null;
    };
    _nameContentsAlias?: string;
}

export interface InvoiceData extends RepositoryDataItem {
    number: string;
    description: string;
    issueDate: string;
    sentDate: string;
    paymentDeadline: string;
    daysToPay: number;
    status: string;
    gdId: string;
    _contract: OurContract;
    _editor: Person;
    _owner: Person;
    _entity: Entity;
    _lastUpdated: string;
    _documentOpenUrl?: string;
    _totalGrossValue: number;
    _totalNetValue?: number;
}

export interface InvoiceItemData extends RepositoryDataItem {
    description: string;
    quantity: number;
    unitPrice: number;
    vatTax: number;
    _parent: Invoice;
    _editor: Person;
    _lastUpdated: string;
    _grossValue: number;
    _netValue: number;
    _vatValue: number;
}

export interface SecurityData extends RepositoryDataItem {
    description: string;
    value: number;
    returnedValue: number;
    _remainingValue: number;
    deductionValue: number;
    firstPartRate: number;
    secondPartRate: number;
    firstPartExpiryDate: string;
    secondPartExpiryDate: string;
    isCash: boolean;
    gdFolderId: string;
    _contract: OurContract;
    _lastUpdated: string;
    _editor: Person;
}

export interface CityData extends RepositoryDataItem {
    name: string;
    code: string;
}

export interface OfferData extends RepositoryDataItem {
    creationDate: string;
    alias: string;
    description: string;
    submissionDeadline: string;
    _type: ContractTypeData;
    _city: CityData;
    typeId?: number;
    form: string;
    isOur: boolean;
    bidProcedure: string;
    editorId?: number;
    _lastUpdated: string;
    employerName?: string;
    _employer?: EntityData;
    _editor: PersonData;
    status: string;
    gdFolderId: string;
}

export interface OurOfferData extends OfferData {
    gdDocumentId?: string;
}

export interface ExternalOfferData extends OfferData {}
