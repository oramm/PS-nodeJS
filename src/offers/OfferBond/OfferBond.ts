import { OfferBondData, OfferData } from '../../types/types';
import BusinessObject from '../../BussinesObject';
import ToolsDate from '../../tools/ToolsDate';

export default class OfferBond extends BusinessObject implements OfferBondData {
    id?: number;
    offerId: number;
    value: string | number;
    form: string;
    paymentData: string;
    comment?: string | null;
    status: string;
    expiryDate?: string | null;

    constructor(initParamObject: OfferBondData & { offerId?: number }) {
        super({ ...initParamObject, _dbTableName: 'OfferBonds' });
        if (!initParamObject.offerId)
            throw new Error('Offer id is not defined');
        this.offerId = initParamObject.offerId;
        //this.value = initParamObject.value;

        if (typeof initParamObject.value === 'string') {
            initParamObject.value = initParamObject.value
                .replace(/\s/g, '')
                .replace(/,/g, '.')
                .replace(/[^0-9.-]/g, '');
            this.value = parseFloat(initParamObject.value);
        } else {
            this.value = initParamObject.value;
        }

        this.form = initParamObject.form;
        this.paymentData = initParamObject.paymentData;
        this.comment = initParamObject.comment;
        this.status = initParamObject.status;
        this.expiryDate = initParamObject.expiryDate
            ? ToolsDate.dateJsToSql(initParamObject.expiryDate)
            : null;
    }
    async addNewController() {
        try {
            console.group('Creating new ApplicationCall');
            await this.addInDb();
            console.log('ApplicationCall added to db');
            console.groupEnd();
        } catch (err) {
            this.deleteController();
            throw err;
        }
    }

    async editController() {
        try {
            console.group('Editing ApplicationCall');
            await this.editInDb();
            console.log('ApplicationCall edited in db');
            console.groupEnd();
        } catch (err) {
            console.log('ApplicationCall edit error');
            throw err;
        }
    }

    async deleteController() {
        if (!this.id) throw new Error('No offerBond id');
        await this.deleteFromDb();
    }
}
