import {
    CityData,
    ContractTypeData,
    EntityData,
    OtherContractData,
    OurContractData,
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
}
