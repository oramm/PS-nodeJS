namespace EnviErrors {
    export class NoGdIdError extends Error {
        readonly code: string;
        constructor(message?: string, code: string = 'GD_ERROR') {
            super('Gd Error: ' + (message || ''));
            this.name = 'GdError';
            this.code = code;
            Object.setPrototypeOf(this, NoGdIdError.prototype);
        }
    }

    export class DbError extends Error {
        readonly code: string;
        /**
         * Opcjonalny status HTTP. Ustawiany tam, gdzie błąd jest pomyłką
         * użytkownika (np. konflikt unikalności = 409), a nie awarią serwera.
         * Bez tego middleware w index.ts klasyfikuje błąd jako 500, czyli
         * z mailem-raportem do zespołu i bez szans na fail-fast po stronie klienta.
         */
        readonly status?: number;
        constructor(message: string, code: string, status?: number) {
            super(message);
            this.name = 'DbError';
            this.code = code;
            this.status = status;
            Object.setPrototypeOf(this, DbError.prototype);
        }
    }
}

export default EnviErrors;
