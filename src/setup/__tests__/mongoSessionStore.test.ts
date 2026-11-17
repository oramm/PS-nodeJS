import type { MongoClient } from 'mongodb';
import { setImmediate, setTimeout } from 'timers/promises';
import { createMongoSessionStore, listenAfterMongoReady } from '../mongoSessionStore';

jest.mock('timers/promises', () => ({
    ...jest.requireActual('timers/promises'),
    setTimeout: jest.fn().mockResolvedValue(undefined),
}));

function fakeMongo() {
    const collection = { createIndex: jest.fn().mockResolvedValue('expires_1') };
    const client = {
        connect: jest.fn(),
        db: jest.fn(() => ({ collection: jest.fn(() => collection) })),
    };
    client.connect.mockResolvedValue(client);
    return { client, collection, mongoClient: client as unknown as MongoClient };
}

describe('MongoDB session startup', () => {
    beforeEach(() => {
        jest.mocked(setTimeout).mockClear();
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('defers connecting until synchronous startup has finished', async () => {
        const { client, mongoClient, collection } = fakeMongo();
        const store = createMongoSessionStore(mongoClient);
        expect(client.connect).not.toHaveBeenCalled();
        expect(await store.collectionP).toBe(collection);
        expect(client.connect).toHaveBeenCalledTimes(1);
        expect(collection.createIndex).toHaveBeenCalledTimes(1);
    });

    it('keeps session initialization pending across a failed connection attempt', async () => {
        const { client, mongoClient, collection } = fakeMongo();
        client.connect.mockRejectedValueOnce(new Error('connection timed out'));
        const store = createMongoSessionStore(mongoClient);
        const listen = jest.fn();
        await listenAfterMongoReady(store, listen);
        expect(client.connect).toHaveBeenCalledTimes(2);
        expect(setTimeout).toHaveBeenCalledWith(5000);
        expect(collection.createIndex).toHaveBeenCalledTimes(1);
        expect(listen).toHaveBeenCalledTimes(1);
    });

    it('waits for the session TTL index before accepting HTTP requests', async () => {
        const { mongoClient, collection } = fakeMongo();
        let finishIndex!: (value: string) => void;
        collection.createIndex.mockImplementation(() => new Promise<string>(resolve => { finishIndex = resolve; }));
        const listen = jest.fn();
        const ready = listenAfterMongoReady(createMongoSessionStore(mongoClient), listen);
        await setImmediate();
        expect(collection.createIndex).toHaveBeenCalledTimes(1);
        expect(listen).not.toHaveBeenCalled();
        finishIndex('expires_1');
        await ready;
        expect(listen).toHaveBeenCalledTimes(1);
    });

    it('rejects startup after five failed attempts without opening HTTP', async () => {
        const { client, mongoClient, collection } = fakeMongo();
        const error = new Error('MongoDB unavailable');
        client.connect.mockRejectedValue(error);
        const listen = jest.fn();
        await expect(listenAfterMongoReady(createMongoSessionStore(mongoClient), listen)).rejects.toBe(error);
        expect(client.connect).toHaveBeenCalledTimes(5);
        expect(setTimeout).toHaveBeenCalledTimes(4);
        expect(collection.createIndex).not.toHaveBeenCalled();
        expect(listen).not.toHaveBeenCalled();
    });

    it('propagates session index failure without opening HTTP', async () => {
        const { mongoClient, collection } = fakeMongo();
        const error = new Error('Index initialization failed');
        collection.createIndex.mockRejectedValue(error);
        const listen = jest.fn();
        await expect(listenAfterMongoReady(createMongoSessionStore(mongoClient), listen)).rejects.toBe(error);
        expect(listen).not.toHaveBeenCalled();
    });
});
