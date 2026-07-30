import { SystemRoleName } from '../../../types/sessionTypes';

jest.mock('../SystemRoleService');

const AGENT_SYSTEM_EMAIL = 'agent@ps.envi.com.pl';
const VALID_TOKEN = 'a'.repeat(64);

type AgentTokenAuth = (req: any, res: any, next: any) => Promise<void>;

/**
 * Loads a fresh copy of the layer together with the SystemRoleService mock it will actually
 * call. Both must come from the same module registry — the layer caches the resolved identity
 * for 5 minutes, so without isolation the first test would decide the outcome of the rest.
 */
function loadLayer(roleResult?: {
    id: number;
    name: SystemRoleName;
    personId: number;
}): { layer: AgentTokenAuth; getSystemRole: jest.Mock } {
    let layer: AgentTokenAuth = <any>undefined;
    let getSystemRole: jest.Mock = <any>undefined;

    jest.isolateModules(() => {
        const service = require('../SystemRoleService').default;
        getSystemRole = service.getSystemRole as jest.Mock;
        getSystemRole.mockResolvedValue(roleResult);
        layer = require('../agentTokenAuth').default;
    });

    return { layer, getSystemRole };
}

function makeRequest(params: { token?: string; userData?: any }): {
    req: any;
    next: jest.Mock;
} {
    const req = {
        headers: params.token ? { 'x-envi-agent-token': params.token } : {},
        session: {
            userData: params.userData,
            cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 },
        },
        sessionID: 'test-session',
        path: '/letterReact',
        ip: '::1',
    };

    return { req, next: jest.fn() };
}

const AGENT_SESSION = {
    enviId: 613,
    systemEmail: AGENT_SYSTEM_EMAIL,
    userName: 'Agent automatyczny',
    picture: '',
    systemRoleName: SystemRoleName.ENVI_EMPLOYEE,
    systemRoleId: 3,
};

/** A normal logged-in person — same role as the agent, so only the email tells them apart. */
const HUMAN_SESSION = {
    enviId: 125,
    systemEmail: 'oramwp@gmail.com',
    userName: 'Marek Gazda',
    picture: '',
    systemRoleName: SystemRoleName.ENVI_EMPLOYEE,
    systemRoleId: 3,
};

describe('agentTokenAuth', () => {
    const originalToken = process.env.AGENT_API_TOKEN;

    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterAll(() => {
        process.env.AGENT_API_TOKEN = originalToken;
    });

    it('is inactive when AGENT_API_TOKEN is not set: a valid-looking header authenticates nobody', async () => {
        delete process.env.AGENT_API_TOKEN;
        const { layer, getSystemRole } = loadLayer({
            id: 3,
            name: SystemRoleName.ENVI_EMPLOYEE,
            personId: 613,
        });

        const { req, next } = makeRequest({ token: VALID_TOKEN });
        await layer(req, {}, next);

        expect(req.session.userData).toBeUndefined();
        expect(getSystemRole).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });

    it('refuses an agent account whose role is not ENVI_EMPLOYEE', async () => {
        process.env.AGENT_API_TOKEN = VALID_TOKEN;
        const { layer, getSystemRole } = loadLayer({
            id: 1,
            name: SystemRoleName.ADMIN,
            personId: 613,
        });

        const { req, next } = makeRequest({ token: VALID_TOKEN });
        await layer(req, {}, next);

        // The account was looked up, and the elevated role was the reason for the refusal.
        expect(getSystemRole).toHaveBeenCalledWith({
            systemEmail: AGENT_SYSTEM_EMAIL,
        });
        expect(req.session.userData).toBeUndefined();
        expect(next).toHaveBeenCalled();
    });

    it('drops the agent identity when the cookie arrives without a valid token, so a rotated token revokes access immediately', async () => {
        process.env.AGENT_API_TOKEN = 'rotated-' + 'b'.repeat(40);
        const { layer } = loadLayer({
            id: 3,
            name: SystemRoleName.ENVI_EMPLOYEE,
            personId: 613,
        });

        // Cookie minted earlier, while the previous token was still valid.
        const { req, next } = makeRequest({ userData: { ...AGENT_SESSION } });
        await layer(req, {}, next);

        expect(req.session.userData).toBeUndefined();
        expect(next).toHaveBeenCalled();
    });

    it('treats the literal string "undefined" as no token at all', async () => {
        process.env.AGENT_API_TOKEN = 'undefined';
        const { layer, getSystemRole } = loadLayer({
            id: 3,
            name: SystemRoleName.ENVI_EMPLOYEE,
            personId: 613,
        });

        const { req, next } = makeRequest({ token: 'undefined' });
        await layer(req, {}, next);

        expect(req.session.userData).toBeUndefined();
        expect(getSystemRole).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });

    it('authenticates the agent with a valid token and keeps the session cookie short-lived', async () => {
        process.env.AGENT_API_TOKEN = VALID_TOKEN;
        const { layer } = loadLayer({
            id: 3,
            name: SystemRoleName.ENVI_EMPLOYEE,
            personId: 613,
        });

        const { req, next } = makeRequest({ token: VALID_TOKEN });
        await layer(req, {}, next);

        expect(req.session.userData).toMatchObject({
            enviId: 613,
            systemEmail: AGENT_SYSTEM_EMAIL,
            systemRoleName: SystemRoleName.ENVI_EMPLOYEE,
        });
        expect(req.session.cookie.maxAge).toBe(60 * 1000);
        expect(next).toHaveBeenCalled();
    });

    // The three cases below guard the identity-drop branch. Without them the suite stays green
    // even if the branch fires for every logged-in human (people never send the agent header),
    // or if removing AGENT_API_TOKEN stops revoking the sessions it handed out.
    it('leaves a logged-in human alone when no agent token header is sent', async () => {
        process.env.AGENT_API_TOKEN = VALID_TOKEN;
        const { layer } = loadLayer({
            id: 3,
            name: SystemRoleName.ENVI_EMPLOYEE,
            personId: 613,
        });

        const human = { ...HUMAN_SESSION };
        const { req, next } = makeRequest({ userData: human });
        await layer(req, {}, next);

        expect(req.session.userData).toEqual(HUMAN_SESSION);
        expect(next).toHaveBeenCalled();
    });

    it('leaves a logged-in human alone when an invalid agent token is sent', async () => {
        process.env.AGENT_API_TOKEN = VALID_TOKEN;
        const { layer } = loadLayer({
            id: 3,
            name: SystemRoleName.ENVI_EMPLOYEE,
            personId: 613,
        });

        const human = { ...HUMAN_SESSION };
        const { req, next } = makeRequest({
            token: 'c'.repeat(64),
            userData: human,
        });
        await layer(req, {}, next);

        expect(req.session.userData).toEqual(HUMAN_SESSION);
        expect(next).toHaveBeenCalled();
    });

    it('revokes an existing agent session once AGENT_API_TOKEN is removed entirely', async () => {
        delete process.env.AGENT_API_TOKEN;
        const { layer } = loadLayer({
            id: 3,
            name: SystemRoleName.ENVI_EMPLOYEE,
            personId: 613,
        });

        const { req, next } = makeRequest({ userData: { ...AGENT_SESSION } });
        await layer(req, {}, next);

        expect(req.session.userData).toBeUndefined();
        expect(next).toHaveBeenCalled();
    });

    it('does not overwrite a logged-in human session', async () => {
        process.env.AGENT_API_TOKEN = VALID_TOKEN;
        const { layer } = loadLayer({
            id: 3,
            name: SystemRoleName.ENVI_EMPLOYEE,
            personId: 613,
        });

        const human = {
            enviId: 125,
            systemEmail: 'oramwp@gmail.com',
            userName: 'Marek Gazda',
            picture: '',
            systemRoleName: SystemRoleName.ENVI_MANAGER,
            systemRoleId: 2,
        };
        const { req, next } = makeRequest({ token: VALID_TOKEN, userData: human });
        await layer(req, {}, next);

        expect(req.session.userData).toEqual(human);
        expect(next).toHaveBeenCalled();
    });
});
