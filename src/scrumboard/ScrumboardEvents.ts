import { Request, Response } from 'express';

/**
 * Rejestr klientów SSE (Server-Sent Events) dla scrumboarda.
 * Prosty broadcast do wszystkich zalogowanych klientów (pojedynczy proces).
 * Bez historii zdarzeń — po reconnect klient przeładowuje dane.
 */

export type ScrumboardEventType =
    | 'contract-discussed-changed'
    | 'discussed-reset'
    | 'task-hours-changed'
    | 'hours-reset'
    | 'task-status-changed'
    | 'planning-changed'
    | 'absence-changed';

type Client = {
    id: number;
    res: Response;
    personId?: number;
};

export default class ScrumboardEvents {
    private static clients = new Map<number, Client>();
    private static nextId = 1;
    private static heartbeat: NodeJS.Timeout | null = null;

    /** Podłącza klienta do strumienia SSE. Zakłada aktywną sesję (sprawdzaną w routerze). */
    static subscribe(req: Request, res: Response): void {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        // Zasugeruj klientowi interwał reconnect
        res.write('retry: 5000\n\n');

        const id = this.nextId++;
        this.clients.set(id, {
            id,
            res,
            personId: req.session.userData?.enviId,
        });

        this.ensureHeartbeat();

        req.on('close', () => {
            this.clients.delete(id);
            if (this.clients.size === 0) this.stopHeartbeat();
        });
    }

    /** Rozsyła zdarzenie do wszystkich podłączonych klientów. */
    static broadcast(type: ScrumboardEventType, payload: object = {}): void {
        const message = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
        for (const client of this.clients.values()) {
            try {
                client.res.write(message);
            } catch (err) {
                console.error('ScrumboardEvents.broadcast write error:', err);
                this.clients.delete(client.id);
            }
        }
    }

    private static ensureHeartbeat(): void {
        if (this.heartbeat) return;
        this.heartbeat = setInterval(() => {
            for (const client of this.clients.values()) {
                try {
                    client.res.write(': ping\n\n');
                } catch (err) {
                    this.clients.delete(client.id);
                }
            }
        }, 25000);
        if (typeof this.heartbeat.unref === 'function') this.heartbeat.unref();
    }

    private static stopHeartbeat(): void {
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
            this.heartbeat = null;
        }
    }
}
