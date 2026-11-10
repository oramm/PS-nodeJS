import ToolsChat from '../ToolsChat';

describe('ToolsChat', () => {
    let chat: any;
    beforeEach(() => {
        chat = { spaces: { create: jest.fn().mockResolvedValue({ data: {name: 'spaces/test', displayName: 'Test', spaceUri: 'uri'} }),
            members: {create: jest.fn(), get: jest.fn()} } };
        jest.spyOn(ToolsChat as any, 'getChat').mockReturnValue(chat);
    });

    it('zachowuje zaproszenia, czesciowe bledy i kontynuuje po bledzie', async () => {
        chat.spaces.members.create.mockResolvedValueOnce({data:{state:'INVITED'}})
            .mockRejectedValueOnce(new Error('brak konta'))
            .mockResolvedValueOnce({data:{state:'JOINED'}});
        expect(await ToolsChat.inviteMembers('spaces/test', ['a@gmail.com','b@gmail.com','c@gmail.com'])).toEqual([
            {email:'a@gmail.com',state:'INVITED'}, {email:'b@gmail.com',state:'FAILED',error:'brak konta'}, {email:'c@gmail.com',state:'JOINED'},
        ]);
        expect(chat.spaces.members.create).toHaveBeenCalledWith({parent:'spaces/test',requestBody:{member:{name:'users/a@gmail.com',type:'HUMAN'}}});
    });

    it('utworzenie pokoju nadal dopuszcza Gmail i uzywa wspolnej sciezki zaproszen', async () => {
        chat.spaces.members.create.mockResolvedValue({data:{state:'INVITED'}});
        const result = await ToolsChat.createSpaceWithMembers('Test', ['a@gmail.com'], 'request-id');
        expect(chat.spaces.create).toHaveBeenCalledWith({requestId:'request-id',requestBody:{spaceType:'SPACE',displayName:'Test',externalUserAllowed:true}});
        expect(result.members).toEqual([{email:'a@gmail.com',state:'INVITED'}]);
    });

    it.each(['JOINED','INVITED','NOT_A_MEMBER'])('sprawdza faktyczne czlonkostwo: %s', async (state) => {
        chat.spaces.members.get.mockResolvedValue({data:{state}});
        expect(await ToolsChat.hasJoinedMember('spaces/test','a@gmail.com')).toBe(state === 'JOINED');
        expect(chat.spaces.members.get).toHaveBeenCalledWith({name:'spaces/test/members/a@gmail.com'});
    });

    it.each([403,404])('odmowa Google %i nie otwiera dostepu', async (status) => {
        chat.spaces.members.get.mockRejectedValue({response:{status}});
        expect(await ToolsChat.hasJoinedMember('spaces/test','a@gmail.com')).toBe(false);
    });

    it('awaria Google nie jest traktowana jak brak czlonkostwa', async () => {
        chat.spaces.members.get.mockRejectedValue(new Error('niedostepny'));
        await expect(ToolsChat.hasJoinedMember('spaces/test','a@gmail.com')).rejects.toThrow('niedostepny');
    });
});
