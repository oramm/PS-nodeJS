import dotenv from 'dotenv';
import path from 'path';

export function loadEnv(): void {
    dotenv.config();
    const nodeEnv = process.env.NODE_ENV || 'production';
    const envFile = path.resolve(process.cwd(), `.env.${nodeEnv}`);
    dotenv.config({ path: envFile, override: true });
    console.log(`[ENV] Environment: ${nodeEnv}`);
    console.log(`[ENV] DB target: ${process.env.DB_HOST}/${process.env.DB_NAME}`);
}
