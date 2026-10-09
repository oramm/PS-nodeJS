/** Rectangle in PDF user space: points, origin at the bottom-left corner of the page. */
export interface PdfRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Where the visible signature goes.
 *  - 'letterClosing'  : directly below a standalone "Z poważaniem" and the signer's block under it
 *                       (rules of D-SIG-5); when the last page has no such closing, bottom right of
 *                       the last page; when the closing is found but the place under it is taken,
 *                       the nearest free area of the standard size on the last page.
 *  - 'lastPageCorner' : bottom right of the last page, moved up until it overlaps nothing.
 *  - 'none'           : no graphic. The PDF still carries a (PAdES) signature, but its signature
 *                       field is an invisible widget without an appearance.
 *  - { page, rect }   : explicit position (1-based page), no automatic checks.
 */
export type SignaturePlacement =
    | 'letterClosing'
    | 'lastPageCorner'
    | 'none'
    | { page: number; rect: PdfRect };

export interface PrepareOptions {
    /** Signing date shown in the appearance and written as /M. Injectable for determinism. */
    now?: Date;
    /** IANA zone used to print the date in the appearance. */
    timeZone?: string;
}

export type PlacementSource =
    | 'letter_closing'
    | 'last_page_corner'
    | 'fallback_free_area'
    | 'explicit'
    | 'none';

export interface PlacementReport {
    source: PlacementSource;
    /** 1-based page of the widget; undefined when there is no graphic. */
    page?: number;
    rect?: PdfRect;
    /**
     * Why 'letterClosing' did not use the position under the closing: no closing on the last page
     * (source 'last_page_corner') or a closing that could not take the graphic ('fallback_free_area').
     */
    fallbackReason?: string;
}

export interface PrepareResult {
    /** The PDF with the reserved signature placeholder; its bytes are final except the placeholder. */
    preparedPdf: Buffer;
    /** DER of the signed attributes with the universal SET tag (0x31) - exactly what is hashed. */
    signedAttrsDer: Buffer;
    /** SHA-256 of signedAttrsDer: the only thing the card signs. */
    hashToSign: Buffer;
    /** First 8 hex characters of hashToSign, upper case, as `XXXX-XXXX`. */
    checkCode: string;
    pages: number;
    /** Additive to the contract: where the graphic went and why. */
    placement: PlacementReport;
    /** Additive to the contract: the name that was printed (certificate CN). */
    signerName: string;
}

export interface ValidationResult {
    valid: boolean;
    signerName: string;
    /** Certificate serial number as upper-case hex. */
    certSerial: string;
    issuer: string;
    byteRangeCoversFile: boolean;
    reasons: string[];
    /** Additive to the contract: the CMS certificate set, signer certificate first when found. */
    chainDer: Buffer[];
}
