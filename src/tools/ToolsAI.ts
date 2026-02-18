import mammoth from 'mammoth';
import OpenAI from 'openai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { execFile as execFileCb } from 'child_process';
const execFile = promisify(execFileCb);

export type AiAnalyzeResult = any;

export type AiExperience = {
    organizationName?: string;
    positionName?: string;
    description?: string;
    dateFrom?: string;
    dateTo?: string;
    isCurrent?: boolean;
};
export type AiEducation = {
    schoolName?: string;
    degreeName?: string;
    fieldOfStudy?: string;
    dateFrom?: string;
    dateTo?: string;
};
export type AiSkill = {
    skillName: string;
    levelCode?: string;
    yearsOfExperience?: number;
};
export type AiPersonProfileResult = {
    experiences: AiExperience[];
    educations: AiEducation[];
    skills: AiSkill[];
    text: string;
    _model?: string;
    _usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
};

export default class ToolsAI {
    /**
     * Extract plain text from file buffer (PDF or DOCX)
     */
    static async extractTextFromFile(file: Express.Multer.File): Promise<string> {
        if (!file || !file.buffer) throw new Error('No file provided');

        if (file.mimetype === 'application/pdf') {
            // Optionally limit to first N pages to reduce size and focus on header
            const pagesLimit = 2;
            let workingBuffer: Buffer = file.buffer;
            // Try to trim PDF to first pages using pdf-lib if available
            try {
                // Use indirect require to avoid static TS resolution of optional dependency
                const pdfLib: any = Function('return require')('pdf-lib');
                const PDFDocument: any = pdfLib.PDFDocument;
                const srcDoc = await PDFDocument.load(file.buffer);
                const total = srcDoc.getPageCount();
                const take = Math.min(pagesLimit, total);
                if (take < total) {
                    const outDoc: any = await PDFDocument.create();
                    const copied: any[] = await outDoc.copyPages(srcDoc, Array.from({ length: take }, (_, i) => i));
                    copied.forEach((p: any) => outDoc.addPage(p));
                    const newBuf = await outDoc.save();
                    workingBuffer = Buffer.from(newBuf);
                    console.log(`ToolsAI.extractTextFromFile - trimmed PDF to first ${take} pages`);
                }
            } catch (e: any) {
                // pdf-lib not available or failed -> continue with original buffer
                console.log('ToolsAI.extractTextFromFile - pdf-lib not available or trim failed, continuing with full PDF', e && e.message ? e.message : e);
            }

            const pdfModule: any = await import('pdf-parse');
            const PDFParseClass = pdfModule.PDFParse ?? pdfModule.default?.PDFParse;
            if (typeof PDFParseClass === 'function') {
                const parser = new PDFParseClass({ data: workingBuffer });
                const result = await parser.getText?.();
                const txt = result?.text ?? '';
                //console.log('ToolsAI.extractTextFromFile - pdf-parse.extract length:', txt.length);
                // if ((txt || '').trim().length < 400 && process.env.ENABLE_OCR_CLI === 'true') {
                //     console.log('ToolsAI.extractTextFromFile - extraction short, trying OCR CLI fallback');
                //     try {
                //             // OCR disabled: would run pdftoppm+tesseract here if enabled
                //             console.log('ToolsAI.extractTextFromFile - OCR is disabled in this build; skipping OCR fallback');
                //     } catch (ocrErr) {
                //         console.warn('ToolsAI.extractTextFromFile - OCR CLI failed:', ocrErr);
                //     }
                // }
                return txt;
            }
            // Fallback: try calling module as function (older API)
            const pdfFunc = pdfModule.default ?? pdfModule;
            if (typeof pdfFunc === 'function') {
                const res = await pdfFunc(file.buffer);
                const txt = res?.text ?? '';
                console.log('ToolsAI.extractTextFromFile - pdf-parse(function) length:', txt.length);
                if ((txt || '').trim().length < 400 && process.env.ENABLE_OCR_CLI === 'true') {
                    console.log('ToolsAI.extractTextFromFile - extraction short, trying OCR CLI fallback');
                    try {
                        const ocr = await this.ocrPdfWithTesseract(file.buffer);
                        console.log('ToolsAI.extractTextFromFile - OCR result length:', ocr.length);
                        if ((ocr || '').trim().length > (txt || '').trim().length) return ocr;
                    } catch (ocrErr) {
                        console.warn('ToolsAI.extractTextFromFile - OCR CLI failed:', ocrErr);
                    }
                }
                return txt;
            }
            throw new Error('Unsupported pdf-parse module shape');
        }

        if (
            file.mimetype ===
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ) {
            const { value } = await mammoth.extractRawText({ buffer: file.buffer });
            const txt = value || '';
            //console.log('ToolsAI.extractTextFromFile - mammoth.extract length:', txt.length);
            if ((txt || '').trim().length < 400 && process.env.ENABLE_OCR_CLI === 'true') {
                console.log('ToolsAI.extractTextFromFile - mammoth short, trying OCR CLI fallback');
                try {
                        // OCR disabled: would run pdftoppm+tesseract here if enabled
                        console.log('ToolsAI.extractTextFromFile - OCR is disabled in this build; skipping OCR fallback');
                } catch (ocrErr) {
                    console.warn('ToolsAI.extractTextFromFile - OCR CLI failed:', ocrErr);
                }
            }
            return txt;
        }

        throw new Error('Unsupported file type for text extraction');
    }

    /**
     * OCR fallback using pdftoppm (poppler) and tesseract CLI.
     * Requires `pdftoppm` and `tesseract` installed on the system.
     */
    static async ocrPdfWithTesseract(buffer: Buffer): Promise<string> {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-'));
        const pdfPath = path.join(tmpDir, 'input.pdf');
        fs.writeFileSync(pdfPath, buffer);
    console.log(`ToolsAI.ocrPdfWithTesseract - created temp dir: ${tmpDir}, pdfPath: ${pdfPath}`);

        try {
            // Convert PDF pages to PNG files using pdftoppm
            // -png outputs page-1.png, page-2.png ... with prefix 'page'
            const prefix = path.join(tmpDir, 'page');
            console.log('ToolsAI.ocrPdfWithTesseract - running pdftoppm', { cmd: 'pdftoppm', args: ['-png', pdfPath, prefix] });
            await execFile('pdftoppm', ['-png', pdfPath, prefix]);

            // Collect generated images
            let files = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.png'));
            files.sort();
            console.log(`ToolsAI.ocrPdfWithTesseract - pdftoppm produced ${files.length} png files`, files.slice(0, 20));

            let fullText = '';
            for (const f of files) {
                const imgPath = path.join(tmpDir, f);
                const outBase = path.join(tmpDir, f);
                console.log('ToolsAI.ocrPdfWithTesseract - running tesseract', { cmd: 'tesseract', args: [imgPath, outBase, '-l', 'pol+eng'] });
                await execFile('tesseract', [imgPath, outBase, '-l', 'pol+eng']);
                const outTxt = outBase + '.txt';
                if (fs.existsSync(outTxt)) {
                    const pageText = fs.readFileSync(outTxt, 'utf8');
                    fullText += '\n' + pageText;
                } else {
                    console.warn('ToolsAI.ocrPdfWithTesseract - expected tesseract output missing for', imgPath);
                }
            }

            return fullText.trim();
        } finally {
            // cleanup
            try {
                fs.readdirSync(tmpDir).forEach((f) => {
                    try {
                        fs.unlinkSync(path.join(tmpDir, f));
                    } catch (e) {}
                });
                fs.rmdirSync(tmpDir);
            } catch (e) {
                console.warn('OCR cleanup failed', e);
            }
        }
    }

    /**
     * Call OpenAI chat completion with retry on rate limits
     */
    static async callOpenAiWithRetry(
        client: OpenAI,
        payload: any,
        maxAttempts = 3
    ): Promise<any> {
        let delay = 1000;
        for (let i = 0; i < maxAttempts; i++) {
            try {
                return await client.chat.completions.create(payload);
            } catch (err: any) {
                const isRate =
                    err?.status === 429 ||
                    err?.code === 'insufficient_quota' ||
                    err?.name === 'RateLimitError';
                if (!isRate || i === maxAttempts - 1) throw err;
                await new Promise((r) => setTimeout(r, delay));
                delay *= 2;
            }
        }
    }

    /**
     * High-level: extract text and analyze via OpenAI, returning parsed JSON
     */
    static async analyzeDocument(
        file: Express.Multer.File
    ): Promise<{ aiResult: AiAnalyzeResult; text: string }> {
        const text = await this.extractTextFromFile(file);
        //console.log('Zawartość przesłanego pliku :', text);
        if (text.trim().length < 1)
            throw new Error('Empty document after extraction');

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `
            Jesteś asystentem biurowym w polskiej firmie. Twoim zadaniem jest precyzyjna analiza treści pisma urzędowego lub firmowego i zwrócenie danych w formacie JSON.
            Jeśli nie możesz znaleźć wartości w podanym tekście, ustaw tę wartość na null i NIE WYMYŚLAJ żadnych danych.
            Dla każdego pola oceń swoją pewność w skali: 3 (wysoka pewność), 2 (średnia), 1 (niska/nie znaleziono).

            Pola do znalezienia:
            - "number": Numer pisma nadawcy (np. "ABC/123/2025"). Jeśli nie ma, null.
            - "creationDate": Data sporządzenia pisma (YYYY-MM-DD). Jeśli nie ma, null.
            - "description": Krótki, jednozdaniowy temat pisma. Jeśli nie ma, null.
            - "responseDueDate": Data terminu odpowiedzi (YYYY-MM-DD) lub null.
            - "senderName": Pełna nazwa nadawcy (np. "Urząd Miasta Krakowa") lub null.

            Przykład (gdy brak danych):
            {
              "number": null,
              "creationDate": null,
              "description": null,
              "responseDueDate": null,
              "senderName": null
            }

            Tekst do analizy (wcześniej wybierz pierwsze strony):
            ---
            ${text.substring(0, 2000)}
            ---
        `;

        // few-shot examples to reduce hallucination
        const examples = [
            {
                input: 'W dniu 2025-09-18 Urząd Miasta Krakowa przesłał pismo nr ABC/123/2025 dotyczące decyzji.',
                output: {
                    number: 'ABC/123/2025',
                    creationDate: '2025-09-18',
                    description: 'Decyzja urzędowa',
                    responseDueDate: null,
                    senderName: 'Urząd Miasta Krakowa',
                },
            },
            {
                input: 'Brak numeru pisma. Pismo sporządzono 2025-06-30. Nadawca: Polska Firma Sp. z o.o.',
                output: {
                    number: null,
                    creationDate: '2025-06-30',
                    description: null,
                    responseDueDate: null,
                    senderName: 'Polska Firma Sp. z o.o.',
                },
            },
        ];

        const messages: any[] = [
            { role: 'system', content: 'Zwracaj tylko i wyłącznie poprawny obiekt JSON, bez dodatkowego tekstu.' },
        ];
        // include examples as assistant/user pairs
        for (const ex of examples) {
            messages.push({ role: 'user', content: `Przykładowy tekst: ${ex.input}` });
            messages.push({ role: 'assistant', content: JSON.stringify(ex.output) });
        }
        messages.push({ role: 'user', content: prompt });

        const payload = {
            model: process.env.OPENAI_MODEL ?? 'gpt-3.5-turbo-16k',
            messages,
            temperature: 0,
            response_format: { type: 'json_object' },
        };

        const completion = await this.callOpenAiWithRetry(openai, payload, 3);
        const responseContent = completion.choices?.[0]?.message?.content;
        if (!responseContent) throw new Error('OpenAI returned empty response');

        const aiResult = JSON.parse(responseContent);
        return { aiResult, text };
    }

    /**
     * Analyze a CV file (PDF/DOCX) and return structured profile data
     */
    static async analyzePersonProfile(
        file: Express.Multer.File,
        hint?: string,
    ): Promise<AiPersonProfileResult> {
        const text = await this.extractTextFromFile(file);
        if (text.trim().length < 1) throw new Error('Empty document after extraction');

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const prompt = `
Analizujesz CV i zwracasz JSON z trzema kluczami: experiences, educations, skills.
Daty w formacie YYYY-MM. Jeśli nie znaleziono danych — zwróć puste tablice.
Nie wymyślaj danych.${hint ? `\nWskazówka od użytkownika: ${hint}` : ''}

Struktura:
- experiences: tablica obiektów { organizationName, positionName, description, dateFrom (YYYY-MM), dateTo (YYYY-MM lub null), isCurrent (bool) }
- educations: tablica obiektów { schoolName, degreeName, fieldOfStudy, dateFrom (YYYY-MM), dateTo (YYYY-MM lub null) }
- skills: tablica obiektów { skillName, levelCode (np. "basic"/"intermediate"/"advanced" lub null), yearsOfExperience (liczba lub null) }

Tekst CV:
---
${text.substring(0, 6000)}
---
        `.trim();

        const payload = {
            model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
            messages: [
                {
                    role: 'system' as const,
                    content:
                        'Zwracaj tylko i wyłącznie poprawny obiekt JSON, bez dodatkowego tekstu.',
                },
                { role: 'user' as const, content: prompt },
            ],
            temperature: 0,
            response_format: { type: 'json_object' as const },
        };

        const completion = await this.callOpenAiWithRetry(openai, payload, 3);
        const responseContent = completion.choices?.[0]?.message?.content;
        if (!responseContent) throw new Error('OpenAI returned empty response');

        const parsed = JSON.parse(responseContent);

        const normalizeDate = (d: unknown): string | undefined => {
            if (!d || typeof d !== 'string') return undefined;
            if (/^\d{4}-\d{2}$/.test(d)) return `${d}-01`;
            return d;
        };

        const experiences: AiExperience[] = Array.isArray(parsed.experiences)
            ? parsed.experiences.map((e: any) => ({
                  organizationName: e.organizationName ?? undefined,
                  positionName: e.positionName ?? undefined,
                  description: e.description ?? undefined,
                  dateFrom: normalizeDate(e.dateFrom),
                  dateTo: normalizeDate(e.dateTo),
                  isCurrent: typeof e.isCurrent === 'boolean' ? e.isCurrent : undefined,
              }))
            : [];

        const educations: AiEducation[] = Array.isArray(parsed.educations)
            ? parsed.educations.map((e: any) => ({
                  schoolName: e.schoolName ?? undefined,
                  degreeName: e.degreeName ?? undefined,
                  fieldOfStudy: e.fieldOfStudy ?? undefined,
                  dateFrom: normalizeDate(e.dateFrom),
                  dateTo: normalizeDate(e.dateTo),
              }))
            : [];

        const skills: AiSkill[] = Array.isArray(parsed.skills)
            ? parsed.skills
                  .filter((s: any) => s?.skillName)
                  .map((s: any) => ({
                      skillName: s.skillName,
                      levelCode: s.levelCode ?? undefined,
                      yearsOfExperience:
                          s.yearsOfExperience != null
                              ? Number(s.yearsOfExperience)
                              : undefined,
                  }))
            : [];

        const usage = completion.usage;

        return {
            experiences,
            educations,
            skills,
            text,
            _model: completion.model,
            _usage: usage
                ? {
                      promptTokens: usage.prompt_tokens,
                      completionTokens: usage.completion_tokens,
                      totalTokens: usage.total_tokens,
                  }
                : undefined,
        };
    }
}
