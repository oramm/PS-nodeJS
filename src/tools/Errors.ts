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
        constructor(message: string, code: string) {
            super(message);
            this.name = 'DbError';
            this.code = code;
            Object.setPrototypeOf(this, DbError.prototype);
        }
    }
}

export default EnviErrors;
