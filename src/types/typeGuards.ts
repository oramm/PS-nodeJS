import { OtherContractData, OurContractData } from './types';

export function isOurContract(
    x: OurContractData | OtherContractData | undefined | null
): x is OurContractData {
    return !!x?._type?.isOur;
}

export function isOtherContract(
    x: OurContractData | OtherContractData | undefined | null
): x is OtherContractData {
    return x?._type?.isOur === false;
}
