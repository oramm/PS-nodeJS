import type { Message } from '@envi/agent-server/pomoc';

export const POMOC_MARKERS: Record<string, string> = {
    'contract-add': 'Rejestruj umowę ENVI',
    'case-add': 'Dodaj sprawę',
    'letter-add': 'Rejestruj pismo wychodzące',
};

export interface PomocInput {
    question: string;
    history: Message[];
    screen: { name: string; path: string };
    markers: { id: string; label: string }[];
}

function object(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown, limit: number): value is string {
    return typeof value === 'string' && !!value.trim() && value.length <= limit;
}
function only(value: Record<string, unknown>, keys: string[]) {
    return Object.keys(value).every((key) => keys.includes(key));
}

export function parsePomocInput(body: unknown): PomocInput {
    const fail = () => { throw new Error('Nieprawidłowe pytanie lub kontekst Pomocy.'); };
    if (!object(body) || !only(body, ['question', 'history', 'screen', 'markers']) || !text(body.question, 8000)) return fail();
    const screen = body.screen;
    if (!object(screen) || !only(screen, ['name', 'path']) || !text(screen.name, 1000) || typeof screen.path !== 'string' || screen.path.length > 1000) return fail();
    const history = body.history ?? [];
    if (!Array.isArray(history) || history.some((item) => !object(item) || !only(item, ['role', 'content']) || !['user', 'assistant'].includes(item.role as string) || typeof item.content !== 'string' || !item.content.trim())) return fail();
    const trimmed: Message[] = [];
    let remaining = 40000;
    for (const item of history.slice(-40).reverse()) {
        const content = item.content.slice(0, Math.min(8000, remaining));
        if (content.trim()) trimmed.unshift({ role: item.role, content });
        remaining -= content.length;
        if (!remaining) break;
    }
    const markers = body.markers ?? [];
    if (!Array.isArray(markers) || markers.length > 200 || markers.some((item) => !object(item) || !only(item, ['id', 'label']) || !text(item.id, 160) || !text(item.label, 1000) || !Object.prototype.hasOwnProperty.call(POMOC_MARKERS, item.id)) || new Set(markers.map((item) => item.id)).size !== markers.length) return fail();
    return { question: body.question, screen: { name: screen.name, path: screen.path }, history: trimmed,
        markers: markers.map(({ id }) => ({ id, label: POMOC_MARKERS[id] })) };
}
