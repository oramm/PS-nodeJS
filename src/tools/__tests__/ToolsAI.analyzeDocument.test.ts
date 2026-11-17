import OpenAI from 'openai';
import ToolsAI from '../ToolsAI';

jest.mock('openai');

describe('ToolsAI.analyzeDocument model migration', () => {
    const originalModel = process.env.OPENAI_MODEL;
    const originalApiKey = process.env.OPENAI_API_KEY;
    const file = { buffer: Buffer.from('synthetic document') } as Express.Multer.File;
    const text = 'Pismo TEST/2026 z dnia 2026-11-04. Nadawca: Firma Testowa.';
    const aiResult = {
        number: 'TEST/2026',
        creationDate: '2026-11-04',
        description: 'Pismo testowe',
        responseDueDate: null,
        senderNames: ['Firma Testowa'],
    };
    const create = jest.fn();

    beforeEach(() => {
        delete process.env.OPENAI_MODEL;
        process.env.OPENAI_API_KEY = 'synthetic-test-key';
        jest.spyOn(ToolsAI, 'extractTextFromFile').mockResolvedValue(text);
        create.mockReset().mockResolvedValue({
            model: 'gpt-6-luna',
            choices: [{ message: { content: JSON.stringify(aiResult) } }],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        });
        (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(
            () => ({ chat: { completions: { create } } }) as unknown as OpenAI,
        );
    });

    afterEach(() => {
        if (originalModel === undefined) delete process.env.OPENAI_MODEL;
        else process.env.OPENAI_MODEL = originalModel;
        if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = originalApiKey;
    });

    it('uses Luna without reasoning and preserves parsed fields, text and usage', async () => {
        const result = await ToolsAI.analyzeDocument(file);

        expect(create).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            model: 'gpt-6-luna',
            reasoning_effort: 'none',
            temperature: 1,
            response_format: { type: 'json_object' },
        }));
        expect(create.mock.calls[0][0].messages.at(-1).content).toContain(text);
        expect(result).toEqual({
            aiResult,
            text,
            _model: 'gpt-6-luna',
            _usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        });
    });

    it('preserves the configured model without adding Luna-only parameters', async () => {
        process.env.OPENAI_MODEL = 'gpt-4o-mini';
        await ToolsAI.analyzeDocument(file);

        expect(create.mock.calls[0][0].model).toBe('gpt-4o-mini');
        expect(create.mock.calls[0][0]).not.toHaveProperty('reasoning_effort');
    });

    it('also disables reasoning when Luna is explicitly configured', async () => {
        process.env.OPENAI_MODEL = 'gpt-6-luna';
        await ToolsAI.analyzeDocument(file);

        expect(create.mock.calls[0][0].reasoning_effort).toBe('none');
    });

    it('preserves temperature 1 for CV analysis', async () => {
        await ToolsAI.analyzePersonProfile(file);

        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            model: 'gpt-4o-mini',
            temperature: 1,
        }));
    });

    it('rejects an empty extraction before contacting OpenAI', async () => {
        jest.spyOn(ToolsAI, 'extractTextFromFile').mockResolvedValue('   ');

        await expect(ToolsAI.analyzeDocument(file)).rejects.toThrow('Empty document after extraction');
        expect(create).not.toHaveBeenCalled();
    });

    it('propagates model availability errors without a silent model fallback', async () => {
        const error = Object.assign(new Error('Model unavailable'), { status: 404 });
        create.mockRejectedValue(error);

        await expect(ToolsAI.analyzeDocument(file)).rejects.toBe(error);
        expect(create).toHaveBeenCalledTimes(1);
    });
});
