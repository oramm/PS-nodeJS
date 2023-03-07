namespace EnviErrors {
    export class NoGdIdError extends Error {
        readonly code: string;
        constructor(message?: string) {
            super('no GdId found: ' + message || '');
            this.name = "CustomError";
            this.code = 'NO_GD_ID'
            Object.setPrototypeOf(this, NoGdIdError.prototype);
        }
    }
}

export default EnviErrors;
