// sessionTypes.ts
import exp from 'constants';
import e from 'express';
import 'express-session';
import { SystemRoleName } from '../setup/GAuth2/sessionTypes';

declare module 'express-session' {
    interface SessionData {
        userData: {
            enviId: number;
            googleId: string;
            systemEmail: string;
            userName: string;
            picture: string;
            systemRoleName: SystemRoleName;
            systemRoleId: number;
        };
    }
}

export interface RepositoryDataItem {
    id?: number;
}

export interface ProjectData extends RepositoryDataItem {
    ourId: string;
    name: string;
    alias: string;
    comment: string;
    status: string;
    lettersGdFolderId?: string;
    startDate?: string;
    endDate?: string;
    gdFolderId?: string;
    _gdFolderUrl?: string;
    _ourId_Alias: string;
    financialComment?: string;
    totalValue?: string | number;
    qualifiedValue?: string | number;
    dotationValue?: string | number;
    gdFolderId: string | undefined;
    _lastUpdated?: string;
    _engineers?: EntityData[];
    _employers?: EntityData[];
}

export interface ContractData extends RepositoryDataItem {
    name: string;
    number: string;
    alias: string;
    comment: string;
    startDate?: string;
    endDate?: string;
    guaranteeEndDate?: string;
    _project: Project;
    status: string;
    gdFolderId?: string;
    meetingProtocolsGdFolderId?: string;
    _type: ContractTypeData;
    value?: string | number;
    _remainingNotScheduledValue?: string | number;
    _remainingNotIssuedValue?: string | number;
    _folderName?: string;
    _gdFolderUrl?: string;
    _ourIdOrNumber_Alias?: string;
    _ourIdOrNumber_Name?: string;
    _lastUpdated?: string;
    _contractors?: Entity[];
    _engineers?: Entity[];
    _employers?: Entity[];
    _contractRanges?: ContractRangeData[];
    _contractRangesNames?: string[];
}

export interface OurContractData extends ContractData {
    _admin?: Person;
    _manager?: Person;
    ourId: string;
    _ourType: string;
    _admin?: Person;
    _city?: City;
}
export interface OtherContractData extends ContractData {
    _contractors?: Entity[];
    _ourContract?: OurContract;
    materialCardsGdFolderId?: string;
}

export interface ContractRangeData {
    id: number;
    name: string;
    description: string;
}

export interface ContractRangeContractData {
    contractRangeId?: number;
    contractId?: number;
    _contractRange: ContractRangeData;
    _contract?: ContractData;
    comment?: string | null;
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
    number?: number;
    description?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    gdFolderId?: string;
    _type: MilestoneType;
    _contract?: OurContractData | OtherContractData;
    _offer?: OurOfferData | ExternalOfferData;
    contractId?: number;
    offerId?: number;
    _FolderNumber_TypeName_Name?: string;
    _folderNumber?: string;
    _folderName?: string;
    _gdFolderUrl?: string;
}

export interface CaseData extends RepositoryDataItem {
    name?: string | null;
    number?: number;
    description?: string;
    gdFolderId?: string;
    _parent: MilestoneData;
    _type: CaseType;
    _folderName?: string;
    _displayNumber?: string;
    _gdFolderUrl?: string;
    _typeFolderNumber_TypeName_Number_Name?: string;
    _risk?: any;
    _processesInstances?: any[];
}

export interface TaskData extends RepositoryDataItem {
    name: string;
    description?: string;
    deadline?: string | Date | null;
    _parent: Case;
    _lastUpdated?: string;
    status: string;
    ownerId?: number | null;
    _owner?: PersonData;
}

export interface ContractTypeData extends RepositoryDataItem {
    name: string;
    description?: string;
    isOur: boolean;
    status?: string;
}

export interface MilestoneTypeData extends RepositoryDataItem {
    name: string;
    description: string;
    isInScrumByDefault: boolean;
    isUniquePerContract: boolean;
    _isDefault: boolean;
    _contractType: ContractTypeData;
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

export interface GenericDocumentData extends RepositoryDataItem {
    description?: string;
    creationDate?: string;
    _documentOpenUrl?: string;
    gdDocumentId?: string | null;
    _gdFolderUrl?: string;
    gdFolderId?: string | null;
    _lastUpdated?: string;
    _entitiesMain?: EntityData[];
    _entitiesCc?: EntityData[];
    letterFilesCount?: number;
    _editor?: PersonData;
    _fileOrFolderChanged?: boolean;
    editorId?: number;
    _canUserChangeFileOrFolder?: boolean;
    _documentEditUrl?: string;
}

export interface LetterData extends GenericDocumentData {
    number?: string | number;
    registrationDate?: string;
    _editor: Person;
    _cases: CaseData[];
    _lastEvent?: OfferEventData | null;
    status: string;
}

export interface OurLetterData extends LetterData {
    _template?: DocumentTemplateData;
    isOur: true;
}

export interface IncomingLetterData extends LetterData {
    isOur: false;
}

export interface OurLetterContractData extends OurLetterData {
    _project: ProjectData;
    projectId?: number;
}

export interface IncomingLetterContractData extends IncomingLetterData {
    _project: ProjectData;
    projectId?: number;
}

export interface OurLetterOfferData extends OurLetterData {
    _offer: OurOfferData;
}

export interface IncomingLetterOfferData extends IncomingLetterData {
    _offer: ExternalOfferData;
}

export interface LetterEventData extends RepositoryDataItem {
    letterId?: number;
    editorId?: number;
    _editor: PersonData;
    eventType: string;
    _lastUpdated?: string;
    comment?: string | null;
    additionalMessage?: string | null;
    versionNumber?: number | null;
    _recipients?: PersonData[] | null;
    recipientsJSON?: string | null;
    _gdFilesBasicData?: drive_v3.Schema$File[];
    gdFilesJSON?: string | null;
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
    phone?: string;
    cellPhone?: string;
    comment?: string;
    _alias?: string;
    position?: string;
    _entity?: EntityData;
    _nameSurnameEmail?: string;
    systemEmail?: string;
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
    number?: string | null;
    description?: string;
    issueDate: string;
    sentDate?: string | null;
    paymentDeadline?: string | null;
    daysToPay: number;
    status: string;
    gdId?: string | null;
    _contract: OurContractData;
    _editor?: PersonData;
    _owner?: PersonData;
    _entity: EntityData;
    _lastUpdated?: string;
    _documentOpenUrl?: string;
    _totalGrossValue?: number;
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
    status: string;
    gdFolderId: string;
    gdFolderUrl?: string;
    _contract: OurContract;
    _lastUpdated: string;
    _editor: Person;
}

export interface CityData extends RepositoryDataItem {
    name: string;
    code?: string;
}

export interface OfferData extends RepositoryDataItem {
    creationDate?: string;
    alias: string;
    description?: string;
    comment?: string;
    submissionDeadline?: string;
    _type: ContractTypeData;
    _city: CityData;
    typeId?: number;
    cityId?: number;
    form?: string;
    isOur: boolean;
    bidProcedure?: string;
    employerName?: string;
    _employer?: EntityData;
    status?: string;
    gdFolderId?: string;
    _gdFolderUrl?: string;
    _lastEvent?: OfferEventData | null;
}

export interface OurOfferData extends OfferData {
    gdDocumentId?: string;
    resourcesGdFolderId?: string;
    invitationMailId?: number | null;
    _invitationMail?: OurOfferInvitationMailToProcessData;
}

export interface ExternalOfferData extends OfferData {
    tenderUrl?: string | null;
    _offerBond?: OfferBondData | null;
}

export interface OfferBondData extends RepositoryDataItem {
    offerId?: number;
    value: string | number;
    form: string;
    paymentData: string;
    comment?: string | null;
    status: string;
    expiryDate?: string | null;
}

export interface MailData extends RepositoryDataItem {
    uid: number;
    subject: string;
    body?: string;
    from: string;
    to: string;
    date: string;
    flags?: Set<string>;
    _lastUpdated?: string;
    editorId?: number | null;
    _editor?: PersonData;
}

export interface OfferInvitationMailToProcessData extends MailData {
    status: string;
    _ourOfferId?: number;
    _ourOffer?: OurOfferData;
}

export interface OfferEventData extends RepositoryDataItem {
    offerId?: number;
    editorId?: number;
    _editor: PersonData;
    eventType: string;
    _lastUpdated?: string;
    comment?: string | null;
    additionalMessage?: string | null;
    versionNumber?: number | null;
    _recipients?: PersonData[] | null;
    recipientsJSON?: string | null;
    _gdFilesBasicData?: drive_v3.Schema$File[];
    gdFilesJSON?: string | null;
}

export interface FinancialAidProgrammeData extends RepositoryDataItem {
    name: string;
    alias: string;
    description: string;
    url: string;
    gdFolderId: string;
    _gdFolderUrl?: string;
}

export interface FocusAreaData extends RepositoryDataItem {
    financialAidProgrammeId?: number;
    _financialAidProgramme: FinancialAidProgrammeData;
    name: string;
    alias: string;
    description: string;
    gdFolderId: string;
    _gdFolderUrl?: string;
}

export interface ApplicationCallData extends RepositoryDataItem {
    focusAreaId?: number;
    _focusArea: FocusAreaData;
    description: string;
    url: string;
    startDate: string | null;
    endDate: string | null;
    status: string;
    gdFolderId: string;
    _gdFolderUrl?: string;
}

export interface NeedData extends RepositoryDataItem {
    clientId?: number;
    _client: EntityData;
    name: string;
    description: string;
    status: string;
    applicationCallId?: number | null;
    _applicationCall?: ApplicationCallData | null;
    _focusAreas?: FocusAreaData[];
    _focusAreasNames?: string[] | undefined;
}

export interface NeedsFocusAreasData {
    needId?: number;
    focusAreaId?: number;
    _need: NeedData;
    _focusArea: FocusAreaData;
    comment?: string;
}

export interface RoleData extends RepositoryDataItem {
    id: number;
    personId: number | null;
    _person?: PersonData;
    name: string;
    description: string;
    groupName: string;
}

export interface ContractRoleData extends RoleData {
    contractId?: number | null;
    _contract?: OurContract | OtherContract;
}

export interface ProjectRoleData extends RoleData {
    projectId?: number | null;
    _project?: ProjectData;
}
