jest.mock('../../../index', () => ({ app: require('express')() }));
jest.mock('../ChatSpacesController', () => ({ __esModule: true, default: {
    inviteMembers: jest.fn(), createForContract: jest.fn(),
} }));
import express from 'express';
import { Server } from 'http';
import { app } from '../../../index';
import Tools from '../../../tools/Tools';
import ChatSpacesController from '../ChatSpacesController';

let server: Server;
let origin: string;
beforeAll(async () => {
    app.use(express.json());
    app.use((req: any, _res, next) => {
        req.parsedBody = Tools.parseObjectsJSON(req.body);
        req.session = { userData: { enviId: 3 } };
        next();
    });
    require('../ChatSpacesRouters');
    await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    origin = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
    jest.clearAllMocks();
    (ChatSpacesController.inviteMembers as jest.Mock).mockResolvedValue({members: []});
    (ChatSpacesController.createForContract as jest.Mock).mockResolvedValue({chatSpace: {id: 1}, members: []});
});

it.each([[7], [7, 8]])('HTTP zachowuje tablice zapraszanych osob %j mimo starego parsera', async (...personIds) => {
    const response = await fetch(origin+'/contract/100/chatSpace/members', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({personIds}),
    });
    expect(response.status).toBe(200);
    expect(ChatSpacesController.inviteMembers).toHaveBeenCalledWith(100,personIds,3);
});

it('HTTP tworzenia pokoju zachowuje wybor jednej osoby', async () => {
    expect(Tools.parseObjectsJSON({personIds:[7]}).personIds).toBe(7);
    const response = await fetch(origin+'/contract/100/chatSpace', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({scope:'contract',personIds:[7]}),
    });
    expect(response.status).toBe(200);
    expect(ChatSpacesController.createForContract).toHaveBeenCalledWith(100,expect.objectContaining({personIds:[7]}));
});
