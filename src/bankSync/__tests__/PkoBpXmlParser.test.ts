import { PkoBpXmlParser } from '../parsers/PkoBpXmlParser';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<account-history>
  <search>
    <account>48102036680000550206787115</account>
    <date since="2026-04-22" to="2026-04-29"/>
  </search>
  <operations>
    <operation>
      <order-date>2026-04-29</order-date>
      <exec-date>2026-04-29</exec-date>
      <type>Przelew z rachunku</type>
      <description>Rachunek odbiorcy : 73116022020000000658944255 Nazwa odbiorcy :  JOANNA ŁĘŻAJ Tytuł :  FV 6/UR/4/2026</description>
      <amount curr="PLN">-984.00</amount>
      <ending-balance curr="PLN">+733877.66</ending-balance>
    </operation>
    <operation>
      <order-date></order-date>
      <exec-date>2026-04-28</exec-date>
      <type>Opłata</type>
      <description>Opłata za prowadzenie rachunku</description>
      <amount curr="PLN">-5.00</amount>
      <ending-balance curr="PLN">+734861.66</ending-balance>
    </operation>
    <operation>
      <order-date>2026-04-27</order-date>
      <exec-date>2026-04-27</exec-date>
      <type>Przelew na konto</type>
      <description>Rachunek nadawcy : 11222233334444555566667777 Nazwa nadawcy :  TEST SP Z OO Identyfikator nadawcy : 5261040828 Tytuł :  FV 18/2026</description>
      <amount curr="PLN">+2500.00</amount>
      <ending-balance curr="PLN">+734866.66</ending-balance>
    </operation>
  </operations>
</account-history>`;

describe('PkoBpXmlParser', () => {
    let statement: ReturnType<typeof PkoBpXmlParser.parse>;

    beforeAll(() => {
        statement = PkoBpXmlParser.parse(Buffer.from(SAMPLE_XML, 'utf8'));
    });

    test('parses ourAccount', () => {
        expect(statement.ourAccount).toBe('48102036680000550206787115');
    });

    test('parses periodFrom and periodTo', () => {
        expect(statement.periodFrom).toBe('2026-04-22');
        expect(statement.periodTo).toBe('2026-04-29');
    });

    test('parses 3 operations', () => {
        expect(statement.operations).toHaveLength(3);
    });

    describe('outgoing transfer (index 0)', () => {
        let op: typeof statement.operations[0];
        beforeAll(() => { op = statement.operations[0]; });

        test('direction OUT', () => expect(op.direction).toBe('OUT'));
        test('amount is absolute', () => expect(op.amount).toBe(984));
        test('currency PLN', () => expect(op.currency).toBe('PLN'));
        test('execDate', () => expect(op.execDate).toBe('2026-04-29'));
        test('counterpartyAccount extracted', () => expect(op.counterpartyAccount).toBe('73116022020000000658944255'));
        test('counterpartyName extracted', () => expect(op.counterpartyName).toBe('JOANNA ŁĘŻAJ'));
        test('invoice numbers extracted', () => expect(op.invoiceNumbers.length).toBeGreaterThan(0));
        test('operationHash is 64 char hex', () => expect(op.operationHash).toMatch(/^[a-f0-9]{64}$/));
    });

    describe('fee (index 1)', () => {
        let op: typeof statement.operations[0];
        beforeAll(() => { op = statement.operations[1]; });

        test('operationType Opłata', () => expect(op.operationType).toBe('Opłata'));
        test('orderDate null (empty in XML)', () => expect(op.orderDate).toBeNull());
        test('direction OUT', () => expect(op.direction).toBe('OUT'));
    });

    describe('incoming transfer (index 2)', () => {
        let op: typeof statement.operations[0];
        beforeAll(() => { op = statement.operations[2]; });

        test('direction IN', () => expect(op.direction).toBe('IN'));
        test('amount positive', () => expect(op.amount).toBe(2500));
        test('nip extracted', () => expect(op.counterpartyNip).toBe('5261040828'));
    });

    test('duplicate parse produces same hash for same operation', () => {
        const s2 = PkoBpXmlParser.parse(Buffer.from(SAMPLE_XML, 'utf8'));
        expect(s2.operations[0].operationHash).toBe(statement.operations[0].operationHash);
    });
});
