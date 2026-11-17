import MongoStore from 'connect-mongo';
import type { MongoClient } from 'mongodb';
import { setImmediate, setTimeout } from 'timers/promises';

async function connectWithRetry(client: MongoClient): Promise<MongoClient> {
    // Let synchronous route loading finish before starting socket timeouts.
    await setImmediate();
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            await client.connect();
            console.log('Connected to MongoDB.');
            return client;
        } catch (error) {
            if (attempt === 5) throw error;
            console.warn(`MongoDB connection attempt ${attempt}/5 failed. Retrying in 5 seconds.`);
            await setTimeout(5000);
        }
    }
    throw new Error('MongoDB connection attempts exhausted.');
}

export function createMongoSessionStore(client: MongoClient): MongoStore {
    return MongoStore.create({
        clientPromise: connectWithRetry(client),
        collectionName: 'sessions',
    });
}

export async function listenAfterMongoReady(
    store: MongoStore,
    listen: () => void,
): Promise<void> {
    // collectionP also waits for connect-mongo's existing TTL index initialization.
    await store.collectionP;
    listen();
}
