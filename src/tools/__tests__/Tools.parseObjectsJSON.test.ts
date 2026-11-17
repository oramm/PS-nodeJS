import Tools from '../Tools';

describe('parseObjectsJSON preserves native JSON bodies', () => {
    it.each([[], [123], [123, 456], [true], ['123'], [{ id: 123 }]].map(value => [value]))('preserves a parsed array %j', value => {
        expect(Tools.parseObjectsJSON({ ids: value }).ids).toBe(value);
    });
    it('keeps parsed object and primitive values without coercion', () => {
        const object = { id: 123 };
        expect(Tools.parseObjectsJSON({ object, enabled: true, optional: null, id: 123 })).toEqual({ object, enabled: true, optional: null, id: 123 });
    });
    it('still decodes legacy multipart and query string fields once', () => {
        expect(Tools.parseObjectsJSON({ ids: '[123]', object: '{"id":123}', enabled: 'true', optional: 'null', id: '123', name: 'Pismo' }))
            .toEqual({ ids: [123], object: { id: 123 }, enabled: true, optional: null, id: 123, name: 'Pismo' });
    });
});
