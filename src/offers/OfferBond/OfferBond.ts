import {
    ExternalOfferData,
    OfferBondData,
    OfferData,
    OurOfferData,
} from '../../types/types';
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

    /**
     * Wysyła email gdy wadium ma status TO_PAY
     *
     * PUBLIC: Wywoływana przez OfferBondsController
     *
     * @param offer - Dane oferty
     */
    public sendMailOnToDo(offer: ExternalOfferData) {
        const header = `<h2>Zapłać wadium za ofertę: ${offer._type.name} ${offer._city.name} | ${offer.alias}</h2>`;
        const style = 'style="line-height: 1.2; margin: 20px; padding: 20px;"';
        const mainDivStyle =
            'style="line-height: 1.2; margin: 20px; background-color: #f5f5f5; padding: 20px; margin:20px; border-radius: 10px;"';
        let paymentInstructions: string = '<div>';
        if (this.form === Setup.OfferBondForm.CASH) {
            paymentInstructions += `<p>Do zapłaty przelewem: ${this.value} zł</p>
            <p>Dodatkowy komentarz: ${offer.comment}</p>
            `;
        } else {
            paymentInstructions += `
            <strong>Uwaga:</strong>    
            <ul>
                <li>Jeśli nie ma w opise numeru gwarancji zignoruj go i czekaj na kolejnego maila z kompletnymi danymi</li>    
                <li>Wpłać składkę na konto PZU <strong>niezwłocznie</strong> jeśli w tym mailu masz podane kompletne dane do przelewu z numerem gwarancji</li>    
                <li>W tytule przelewu wpisz: "Składka za gwarancję wadialną: ${offer._city.name}, ${offer.alias} <i>[dane wymagane przez PZU w tym nr GW]<i>"</li>
                <li>Ustaw automatyczne potwierdzenie przelewu na maila: biuro@envi.com.pl</li>
                <li>W kolenym malu otrzymasz gwarancję z PZU - do wydruku razem z fakturami dla księgowej. Do gwarancji dołącz wydruk potwierdzenia przelewu składki</li>
            </ul>`;
            paymentInstructions += '</div>';
        }

        const paymentDataBlock = `
            <div ${mainDivStyle}>
                <h3>Dane do przelewu</h3> 
                <p>${this.paymentData}</p>
                ${paymentInstructions}
            </div>`;
        const offerBondDataBlock = `
            <div ${style}>
                <h3>Dane dodatkowe o wadium</h3>
                <p>Wartość wadium: ${this.value} zł</p>
                <p>Forma wadium: ${this.form}</p>
            </div>
        `;
        const offerDataBlock = this.makeOfferDataBlock(offer);

        const html = `${header} ${paymentDataBlock} ${offerBondDataBlock} ${offerDataBlock}`;

        ToolsMail.sendMail({
            to: ['faktury@envi.com.pl', 'monika.tymczyszyn@envi.com.pl'],
            cc: 'stecula@op.pl',
            subject: `Wadium za ofertę: ${offer._type.name} ${offer._city.name} | ${offer.alias}`,
            html,
        });
    }

    /**
     * Wysyła email gdy wadium zostało opłacone (status PAID)
     *
     * PUBLIC: Wywoływana przez OfferBondsController
     *
     * @param offer - Dane oferty
     */
    public sendMailOnPaid(offer: ExternalOfferData) {
        let header =
            this.form === Setup.OfferBondForm.CASH
                ? `<h2>Zapłacono wadium za ofertę:`
                : `<h2>Zapłacono składkę za gwarancję wadialną: `;
        header += `${offer._type.name} ${offer._city.name} | ${offer.alias}</h2>`;

        let instructions: string = '';
        if (this.form === Setup.OfferBondForm.GUARANTEE) {
            const offersLink = `<a href="https://ps.envi.com.pl/React/#/offers/list" target="_blank">ERP</a>`;
            instructions += `
            <div>
                <strong>Uwaga:</strong>    
                <ul>
                    <li>W kolenym mailu z banku otrzymasz potwierdzenie wpłaty składki</li>
                    <li>Wyślij plik z potwierdzeniem <strong>niezwłocznie</strong do PZU</li>
                    <li>Po złożeniu oferty pamiętaj o ustawieniu statusu w ${offersLink}</li>
                </ul>
            </div>`;
        }
        const offerDataBlock = this.makeOfferDataBlock(offer);

        const html = `${header} ${offerDataBlock}`;
        let subject =
            this.form === Setup.OfferBondForm.CASH
                ? `Zapłacono wadium za ofertę: `
                : `Zapłacono składkę za gwarancję wadialną: `;
        subject += `${offer._type.name} ${offer._city.name} | ${offer.alias}`;
        ToolsMail.sendMail({
            to: ['monika.tymczyszyn@envi.com.pl'],
            cc: ['marek@envi.com.pl', 'stecula@op.pl'],
            subject: `Zapłacono wadium za ofertę: ${offer._type.name} ${offer._city.name} | ${offer.alias}`,
            html,
        });
    }

    private makeOfferDataBlock(offer: ExternalOfferData) {
        const style = 'style="line-height: 1.2; margin: 20px; padding: 20px;"';
        const offerDataBlock = `
            <div ${style}>
                <h3>Dane oferty</h3>        
                <p>Termin składania ofert: <span style="font-size: 20px;">${offer.submissionDeadline}</span></p>
                <p>Zamawiający: ${offer.employerName}</p>
                <p>Opis oferty: ${offer.description} <BR> 
                    <small>${offer.comment}</small> 
                </p>
                <p>procedura: ${offer.bidProcedure}</p>
                <p>Wysyłka oferty: ${offer.form}</p>
                <p><a href=${offer.tenderUrl} target="_blank">Strona z przetargiem</a></p>
                <p><a href=${offer._gdFolderUrl} target="_blank">Folder z ofertą</a></p>
            </div>`;
        return offerDataBlock;
    }
}
