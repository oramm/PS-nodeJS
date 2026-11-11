import './agent-server-types';
import { Pool, RowDataPacket } from 'mysql2/promise';
import type { UsageStore } from '@envi/agent-server';
import ToolsDb from '../tools/ToolsDb';

const sqlTime = (time: string) => new Date(time).toISOString().replace('T', ' ').slice(0, 23);

export function createUsageStore(db: Pick<Pool, 'execute'>): UsageStore {
    return {
        async append(entry) {
            await db.execute(
                'INSERT INTO PomocApiUsage (Time, Kind, UserEmail, Model, Bucket, Tokens, CostUsd) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [sqlTime(entry.time), entry.kind, entry.user, entry.model, entry.bucket, JSON.stringify(entry.tokens), entry.cost_usd],
            );
        },
        async list({ start, end }) {
            const [rows] = await db.execute<RowDataPacket[]>(
                `SELECT DATE_FORMAT(Time, '%Y-%m-%dT%H:%i:%s.%fZ') AS time,
                    Kind AS kind, UserEmail AS user, Model AS model, Bucket AS bucket,
                    Tokens AS tokens, CostUsd AS cost_usd
                 FROM PomocApiUsage WHERE Time >= ? AND Time < ? ORDER BY Time, Id`,
                [sqlTime(start), sqlTime(end)],
            );
            return rows.map((row) => ({
                ...row,
                tokens: typeof row.tokens === 'string' ? JSON.parse(row.tokens) : row.tokens,
                cost_usd: Number(row.cost_usd),
            })) as Awaited<ReturnType<UsageStore['list']>>;
        },
    };
}

export const pomocUsageStore = () => createUsageStore(ToolsDb.pool);
