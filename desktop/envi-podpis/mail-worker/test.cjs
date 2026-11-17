'use strict';
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const { run, attachments, addresses, bytes, LIMIT } = require('./worker.cjs');
const account = { email: 'author@example.invalid', password: 'synthetic-do-not-log', imapHost: 'imap.example.invalid', smtpHost: 'smtp.example.invalid', smtpPort: 465 };
const pdf = Buffer.from('%PDF-1.4\nsynthetic signed PDF\n%%EOF');
const structure = { childNodes: [{ part: '2', type: 'application/pdf', size: pdf.length, dispositionParameters: { filename: '../pismo.pdf' } }, { part: '3', type: 'application/octet-stream', size: pdf.length, dispositionParameters: { filename: 'inne.pdf' } }, { part: '4', type: 'image/png', size: 10 }, { part: '5', type: 'application/pdf', size: LIMIT + 1 }] };
let calls = [];
class FakeImap {
    constructor(config) { assert.equal(config.tls.rejectUnauthorized, true); assert.equal(config.port, 993); assert.equal(config.logger, false); this.mailbox = { exists: 2300, uidValidity: 987n }; calls.push('client'); }
    async connect() { calls.push('connect'); }
    async getMailboxLock(mailbox, options) { assert.equal(mailbox, 'INBOX'); assert.equal(options.readOnly, true); return { release() { calls.push('release'); } }; }
    async search(query, options) { assert.equal(options.uid, true); assert.equal(query.seq, '301:*'); assert.ok(query.since instanceof Date); assert.deepEqual(query.or, [{ subject: 'pismo' }, { from: 'pismo' }]); return Array.from({ length: 60 }, (_, n) => n + 1); }
    async *fetch(ids, fields, options) { assert.equal(ids.split(',').length, 40); assert.equal(ids.split(',')[0], '21'); assert.equal(options.uid, true); yield { uid: 60, bodyStructure: structure, envelope: { from: [{ address: 'sender@example.invalid' }], replyTo: [{ address: 'reply@example.invalid' }], subject: 'Pismo', messageId: '<source@example.invalid>', date: new Date('2026-10-22T10:00:00Z') } }; }
    async fetchOne(uid, fields, options) { assert.equal(uid, 60); assert.equal(options.uid, true); return { bodyStructure: structure }; }
    async download(uid, part, options) { assert.equal(uid, 60); assert.equal(part, '2'); assert.equal(options.uid, true); calls.push('download'); return { content: Readable.from([pdf]) }; }
    async logout() { calls.push('logout'); }
    close() { calls.push('close'); }
}
async function main() {
    assert.deepEqual(attachments(structure).map(a => a.part), ['2', '3']);
    assert.throws(() => addresses(['bad\r\nBcc: other@example.invalid']), /RECIPIENTS/);
    assert.throws(() => addresses(['a@example.invalid', 'b@example.invalid\n']), /RECIPIENTS/);
    const search = await run({ op: 'search', account, query: 'pismo' }, { ImapFlow: FakeImap });
    assert.equal(search.messages.length, 1); assert.deepEqual(search.messages[0].to, ['reply@example.invalid']); assert.equal(search.messages[0].validity, '987'); assert.equal(search.messages[0].attachments.length, 2);
    assert.deepEqual(calls, ['client', 'connect', 'release', 'logout']);
    calls = [];
    const downloaded = await run({ op: 'download', account, uid: 60, validity: '987', part: '2' }, { ImapFlow: FakeImap });
    assert.equal(downloaded.data, pdf.toString('base64')); assert.ok(calls.includes('download'));
    calls = [];
    await assert.rejects(run({ op: 'download', account, uid: 60, validity: 'stale', part: '2' }, { ImapFlow: FakeImap }), /MESSAGE_CHANGED/); assert.ok(!calls.includes('download')); assert.ok(calls.includes('release'));
    await assert.rejects(run({ op: 'download', account, uid: 60, validity: '987', part: '../2' }, { ImapFlow: FakeImap }), /MESSAGE_CHANGED/);
    await assert.rejects(bytes(Readable.from([Buffer.alloc(8), Buffer.alloc(8)]), 10), /TOO_LARGE/);
    const request = { op: 'draft', account, to: search.messages[0].to, cc: ['copy@example.invalid'], subject: 'Re: Pismo', body: 'Dzień dobry, podpisane w załączeniu.', inReplyTo: '<source@example.invalid>', attachments: [{ name: '../podpisane.pdf', data: downloaded.data }] };
    const draft = await run(request, { mailer: nodemailer });
    const parsed = await simpleParser(Buffer.from(draft.raw, 'base64'));
    assert.equal(parsed.from.value[0].address, account.email); assert.equal(parsed.to.value[0].address, 'reply@example.invalid'); assert.equal(parsed.cc.value[0].address, 'copy@example.invalid');
    assert.equal(parsed.inReplyTo, '<source@example.invalid>'); assert.equal(parsed.attachments.length, 1); assert.deepEqual(parsed.attachments[0].content, pdf); assert.ok(!parsed.attachments[0].filename.includes('/'));
    assert.deepEqual(draft.envelope, { from: account.email, to: ['reply@example.invalid', 'copy@example.invalid'] });
    await assert.rejects(run({ ...request, subject: 'Subject\r\nBcc: victim@example.invalid' }), /RECIPIENTS/);
    await assert.rejects(run({ ...request, attachments: [{ name: 'fake.pdf', data: Buffer.from('not a PDF').toString('base64') }] }), /ATTACHMENTS/);
    let deliveries = 0;
    const mailer = { createTransport(config) {
        assert.equal(config.tls.rejectUnauthorized, true); assert.equal(config.requireTLS, true); assert.equal(config.logger, false);
        return { async sendMail(message) { deliveries++; assert.deepEqual(message.raw, Buffer.from(draft.raw, 'base64')); assert.deepEqual(message.envelope, draft.envelope); return { rejected: [] }; }, close() {} };
    } };
    assert.deepEqual(await run({ op: 'send', account, raw: draft.raw, envelope: draft.envelope }, { mailer }), { sent: true }); assert.equal(deliveries, 1);
    const failed = { createTransport() { return { async sendMail() { throw new Error(account.password); }, close() {} }; } };
    await assert.rejects(run({ op: 'send', account, raw: draft.raw, envelope: draft.envelope }, { mailer: failed }), e => e.message === 'SEND_UNKNOWN' && !e.message.includes(account.password));
    const authFailed = { createTransport() { return { async sendMail() { throw Object.assign(new Error(account.password), { code: 'EAUTH', command: 'AUTH LOGIN' }); }, close() {} }; } };
    await assert.rejects(run({ op: 'send', account, raw: draft.raw, envelope: draft.envelope }, { mailer: authFailed }), e => e.message === 'SEND_NOT_STARTED' && !e.message.includes(account.password));
    assert.equal(deliveries, 1, 'failure never automatically retries');
    console.log('OK mail whole-flow: read-only search → selected UID attachment → durable MIME draft payload → reviewed recipients and exact signed bytes sent once; limits, stale UID, injection, transport error checked; mocks only.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
