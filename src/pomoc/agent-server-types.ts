declare module '@envi/agent-server' {
    export interface UsageEntry {
        time: string;
        kind: string;
        user: string;
        model: string;
        bucket: 'pomoc' | 'analiza';
        tokens: Record<string, number>;
        cost_usd: number;
    }
    export interface UsageStore {
        append(entry: UsageEntry): Promise<void>;
        list(range: { start: string; end: string }): Promise<UsageEntry[]>;
    }
    export interface ApiConfig {
        enabled: boolean;
        reason?: string;
        billing_day?: number;
        monthly_budget_usd?: number;
        kinds?: string[];
        users?: string[];
        pomoc?: { enabled: boolean; monthly_budget_usd: number; users: string[]; daily_questions_per_user: number };
        prices_usd_per_mtok?: Record<
            string,
            { input: number; output: number; cache_write: number; cache_read: number }
        >;
    }
    export function readApiPolicy(source: unknown): ApiConfig;
    export function readCanonFile(input: { token: string; path: string; fetch?: typeof fetch }): Promise<string>;
    export function createMemoryStore(): UsageStore;
}

declare module '@envi/agent-server/pomoc' {
    import type { ApiConfig, UsageStore } from '@envi/agent-server';
    export interface Message {
        role: 'user' | 'assistant';
        content: string;
    }
    export interface DataTool {
        name: string;
        description: string;
        input_schema: Record<string, unknown>;
        run(input: unknown): Promise<unknown>;
    }
    export interface ModelClient {
        messages: { create(input: Record<string, unknown>): Promise<unknown> };
    }
    export interface PomocResult {
        decision: 'allowed' | 'denied' | 'subscription';
        reason?: string;
        stop_reason?: string;
        text: string;
        based_on?: string;
        markers: string[];
        ticket_draft: { title: string; description: string } | null;
        cost_usd: number;
        conversation: Message[];
    }
    export function runPomoc(input: {
        client: ModelClient;
        config: ApiConfig;
        store: UsageStore;
        user: string;
        model: string;
        effort: string;
        system_name: string;
        system_version: string;
        history: Message[];
        question: string;
        screen: { name: string; path: string };
        markers: { id: string; label: string }[];
        code_dir: string;
        data_tools: DataTool[];
        max_turns: number;
        max_tokens: number;
        estimated_cost_per_call_usd: number;
    }): Promise<PomocResult>;
}
