import { ExternalOfferData, OfferBondData, OfferData } from '../../types/types';
import BusinessObject from '../../BussinesObject';
import ToolsDate from '../../tools/ToolsDate';
import Setup from '../../setup/Setup';
import ToolsMail from '../../tools/ToolsMail';

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

    async editController(offer: ExternalOfferData) {
        try {
            console.group('Editing ApplicationCall');
            await this.editInDb();
            console.log('ApplicationCall edited in db');
            this.sendMailOnStatusChange(offer);
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

    sendMailOnStatusChange(offer: ExternalOfferData) {
        switch (this.status) {
            case Setup.OfferBondStatus.TO_PAY:
                this.sendMailOnToDo(offer);
                break;
            case Setup.OfferBondStatus.PAID:
                this.sendMailOnPaid(offer);
                break;
        }
    }

    protected sendMailOnToDo(offer: ExternalOfferData) {
        const header = `<h1>Zapłać wadium za ofertę: ${offer._type.name} ${offer._city.name} | ${offer.alias}</h1>`;
        const style = 'style="line-height: 1.2; margin-top: 40px;"';

        let paymentInstructions: string = '';
        if (this.form === Setup.OfferBondForm.CASH) {
            paymentInstructions += `<div><p>Do zapłaty: ${this.value} zł</p>`;
        } else {
            paymentInstructions += `
                    <p>Do zapłaty jest składka, której szczegóły zostaną wysłane w osobnym mailu. 
                    PZU przekaże dane do płatności.</p>
                `;
        }

        const paymentDataBlock = `
            <div ${style}>
                <h2>Dane do przelewu</h2> 
                <p>${this.paymentData}</p>
                ${paymentInstructions}
            </div>`;
        const offerBondDataBlock = `
            <div ${style}>
                <h2>Dane dodatkowe o wadium</h2>
                <p>Wartość wadium: ${this.value} zł</p>
                <p>Forma wadium: ${this.form}</p>
            </div>
        `;
        const offerDataBlock = this.makeOfferDataBlock(offer);

        const html = `${header} ${paymentDataBlock} ${offerBondDataBlock} ${offerDataBlock}`;

        ToolsMail.sendMail({
            to: ['faktury@envi.com.pl'], //, 'monika.tymczyszyn@envi.com.pl'],
            //cc: 'stecula@op.pl',
            subject: `Wadium za ofertę: ${offer._type.name} ${offer._city.name} | ${offer.alias}`,
            html,
        });
    }

    protected sendMailOnPaid(offer: ExternalOfferData) {
        let header =
            this.form === Setup.OfferBondForm.CASH
                ? `<h1>Zapłacono wadium za ofertę:`
                : `<h1>Zapłacono składkę za gwarancję wadialną: `;
        header += `${offer._type.name} ${offer._city.name} | ${offer.alias}</h1>`;

        const offerDataBlock = this.makeOfferDataBlock(offer);

        const html = `${header} ${offerDataBlock}`;
        let subject =
            this.form === Setup.OfferBondForm.CASH
                ? `Zapłacono wadium za ofertę: `
                : `Zapłacono składkę za gwarancję wadialną: `;
        subject += `${offer._type.name} ${offer._city.name} | ${offer.alias}`;
        ToolsMail.sendMail({
            to: ['faktury@envi.com.pl'], //, 'monika.tymczyszyn@envi.com.pl'],
            //cc: 'stecula@op.pl',
            subject: `Zapłacono wadium za ofertę: ${offer._type.name} ${offer._city.name} | ${offer.alias}`,
            html,
        });
    }

    private makeOfferDataBlock(offer: ExternalOfferData) {
        const style = 'style="line-height: 1.2; margin-top: 40px;"';
        const offerDataBlock = `
            <div ${style}>
                <h2>Dane oferty</h2>        
                <p>Termin składania ofert: <span style="font-size: 20px;">${offer.submissionDeadline}</span></p>
                <p>Zamawiający: ${offer.employerName}</p>
                <p>Opis oferty: ${offer.description} <BR> 
                    <small>${offer.comment}</small> 
                </p>
                <p>procedura: ${offer.bidProcedure}</p>
                <p>Wysyłka oferty: ${offer.form}</p>
                <p>Link do oferty: ${offer.tenderUrl}</p>
                <p>Link do specyfikacji: ${offer._gdFolderUrl}</p>
            </div>`;
        return offerDataBlock;
    }
}
