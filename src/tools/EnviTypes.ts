import {
    ContractTypeData,
    EntityData,
    RepositoryDataItem,
} from '../types/types';

export namespace Envi {
    export interface _blobEnviObject {
        blobBase64String: string; //base64data,
        name: string; //blob.name,
        mimeType: string; //blob.mimeType
        parent?: string;
    }

    export interface DocumentTemplateData extends RepositoryDataItem {
        gdId: string;
        _contents: Envi.DocumentContentsData;
        name: string;
        description?: string;
        _nameConentsAlias?: string;
    }

    export interface DocumentContentsData {
        id?: number;
        gdId: string;
        caseTypeId: number;
        alias: string;
        documentTemplateId?: number;
    }
    export interface GenericDocumentData {
        id?: any;
        description?: string;
        creationDate?: string;
        _documentOpenUrl?: string;
        gdDocumentId?: string | null;
        _gdFolderUrl?: string;
        gdFolderId?: string | null;
        _lastUpdated?: string;
        _entitiesMain?: any[];
        _entitiesCc?: any[];
        letterFilesCount?: number;
        _editor?: any;
        _fileOrFolderChanged?: boolean;
        editorId?: number;
        _canUserChangeFileOrFolder?: boolean;
        _documentEditUrl?: string;
    }

    export interface LetterDocumentData extends GenericDocumentData {
        number?: string | number;
        registrationDate?: string;
        _contract?: any;
        _project?: any;
        projectId?: any;
        _cases?: any[];
    }

    export interface OfferDocumentData extends GenericDocumentData {
        alias?: string;
        _type?: ContractTypeData;
        typeId?: number;
        _city?: any;
        cityId?: number;
        form?: string;
        isOur?: boolean;
        bidProcedure?: string;
        employerName?: string;
        _employer?: EntityData;
        status?: string;
    }
}
