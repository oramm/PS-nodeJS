import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

export type DigitBlock = { digits: string; height: number };

export default class ToolsVision {
    /**
     * Zwraca bloki tekstu wykryte przez Vision OCR, ograniczone do samych cyfr
     * (spacje/kropki/przecinki odfiltrowane) wraz z wysokością ramki - użyteczne
     * do odróżnienia głównego licznika (największa czcionka) od trip metera.
     *
     * ponytail: jeśli licznik ma cyfry rozbite przez OCR na osobne bloki (np. przez
     * odstęp w bębenku), trzeba by scalać sąsiadujące poziomo boxy - dodać, jeśli
     * testy na realnych zdjęciach to pokażą.
     */
    static async detectDigitBlocks(
        auth: OAuth2Client,
        imageBuffer: Buffer
    ): Promise<DigitBlock[]> {
        const vision = google.vision({ version: 'v1', auth });
        const res = await vision.images.annotate({
            requestBody: {
                requests: [
                    {
                        image: { content: imageBuffer.toString('base64') },
                        features: [{ type: 'TEXT_DETECTION' }],
                    },
                ],
            },
        });
        const annotations = res.data.responses?.[0]?.textAnnotations ?? [];
        // index 0 to cały wykryty tekst (agregat) - interesują nas pojedyncze bloki
        return annotations
            .slice(1)
            .map((annotation) => {
                const digits = (annotation.description ?? '').replace(
                    /\D/g,
                    ''
                );
                const ys = (annotation.boundingPoly?.vertices ?? []).map(
                    (v) => v.y ?? 0
                );
                const height = ys.length
                    ? Math.max(...ys) - Math.min(...ys)
                    : 0;
                return { digits, height };
            })
            .filter((block) => block.digits.length > 0);
    }
}
