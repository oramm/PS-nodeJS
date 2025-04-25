import { SessionTask } from '../../types/sessionTypes';

export default class TaskStore {
    static items: Record<string, SessionTask> = {};
    static data: Record<string, SessionTask> = {};
    static TTL = 5 * 60 * 1000; // 5 minut

    private static scheduleCleanup(taskId: string) {
        const timeout = setTimeout(() => {
            delete this.items[taskId];
        }, this.TTL);

        this.items[taskId].timeout = timeout;
    }

    static create(taskId: string) {
        this.items[taskId] = { status: 'processing' };
        this.scheduleCleanup(taskId);
    }

    static update(
        taskId: string | undefined,
        message: string,
        percent: number
    ) {
        if (!taskId) return;
        const task = this.items[taskId];
        if (task) {
            task.status = 'processing';
            task.progressMesage = '⏳ ' + message;
            task.percent = percent;
        }
    }

    static getPercent(taskId: string | undefined) {
        if (!taskId) return;
        const task = this.items[taskId];
        if (task) {
            return task.percent;
        }
        return 0;
    }

    /**
     *
     * @param taskId
     * @param result obiekt po przetworzeniu
     * @param message komunikat o zakończeniu
     */
    static complete(
        taskId: string,
        result: any,
        message: string = 'Zadanie zakończone'
    ) {
        const task = this.items[taskId];
        if (task) {
            task.status = 'done';
            task.result = result;
            task.progressMesage = message;
            task.percent = 100;
            // nie resetuj timeouta — nadal auto cleanup po TTL
        }
    }

    static fail(taskId: string, error: string) {
        const task = this.items[taskId];
        if (task) {
            task.status = 'error';
            task.error = error;
        }
    }

    static get(taskId: string): SessionTask | undefined {
        return this.items[taskId];
    }

    static remove(taskId: string) {
        const task = this.items[taskId];
        if (task?.timeout) clearTimeout(task.timeout);
        delete this.items[taskId];
    }
}
