import axios, { AxiosInstance } from 'axios';
import ToolsDb from '../../tools/ToolsDb';

export default class KsefService {
    private client: AxiosInstance;

    constructor() {
        const baseURL = process.env.KSEF_BASE_URL || '';
        this.client = axios.create({ baseURL, timeout: 30000 });
    }

    async submitInvoice(xml: string): Promise<any> {
        // POST XML to KSeF endpoint. Caller handles mapping and validation.
        const url = process.env.KSEF_SUBMIT_PATH || '/invoices';
        const headers: any = {
            'Content-Type': 'application/xml',
        };
        // If API key or token is provided via ENV, add it
        if (process.env.KSEF_API_KEY) headers['X-API-KEY'] = process.env.KSEF_API_KEY;

        const resp = await this.client.post(url, xml, { headers });
        return resp.data;
    }

    async getStatus(ksefId: string): Promise<any> {
        const url = process.env.KSEF_STATUS_PATH || `/invoices/${ksefId}/status`;
        const resp = await this.client.get(url);
        return resp.data;
    }

    async downloadUpo(ksefId: string): Promise<Buffer> {
        const url = process.env.KSEF_UPO_PATH || `/invoices/${ksefId}/upo`;
        const resp = await this.client.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(resp.data);
    }
}
