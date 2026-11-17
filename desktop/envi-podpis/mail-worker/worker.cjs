'use strict';
const LIMIT = 32 * 1024 * 1024;
const validAddress = value => typeof value === 'string' && value.length <= 254 && /^[^\s<>@,;\r\n]+@[^\s<>@,;\r\n]+\.[^\s<>@,;\r\n]+$/.test(value);
function addresses(values) {
    if (!Array.isArray(values) || values.length > 30 || values.some(v => !validAddress(v))) throw new Error('RECIPIENTS');
    return [...new Set(values)];
}
function account(c) {
    if (!c || !validAddress(c.email) || typeof c.password !== 'string' || !c.password || c.password.length > 4096) throw new Error('ACCOUNT');
    for (const key of ['imapHost', 'smtpHost']) if (typeof c[key] !== 'string' || !/^[a-z0-9][a-z0-9.-]{0,252}$/i.test(c[key])) throw new Error('ACCOUNT');
    if (![465, 587].includes(c.smtpPort)) throw new Error('ACCOUNT');
    return c;
}
function attachments(node, result = []) {
    if (!node) return result;
    const name = node.dispositionParameters?.filename || node.parameters?.name || '';
    if (node.part && (node.type === 'application/pdf' || /\.pdf$/i.test(name)) && result.length < 30 && node.size <= LIMIT) result.push({ part: node.part, name: name || 'dokument.pdf', size: node.size });
    for (const child of node.childNodes || []) attachments(child, result);
    return result;
}
async function bytes(stream, limit) {
    const chunks = []; let size = 0;
    for await (const chunk of stream) { size += chunk.length; if (size > limit) { stream.destroy(); throw new Error('TOO_LARGE'); } chunks.push(chunk); }
    return Buffer.concat(chunks);
}
async function run(request, deps = {}) {
    const c = account(request.account);
    if (request.op === 'draft') {
        const mailer = deps.mailer || require('nodemailer');
        const to = addresses(request.to), cc = addresses(request.cc || []);
        if (!to.length || typeof request.body !== 'string' || request.body.length > 20000 || typeof request.subject !== 'string' || /[\r\n]/.test(request.subject) || request.subject.length > 1000) throw new Error('RECIPIENTS');
        if (!Array.isArray(request.attachments) || !request.attachments.length || request.attachments.length > 30) throw new Error('ATTACHMENTS');
        let total = 0;
        const files = request.attachments.map(a => {
            if (typeof a.data !== 'string' || a.data.length > LIMIT * 1.34) throw new Error('TOO_LARGE');
            const content = Buffer.from(a.data, 'base64'); total += content.length;
            if (content.length > LIMIT || total > LIMIT || content.subarray(0, 5).toString() !== '%PDF-') throw new Error('ATTACHMENTS');
            const filename = String(a.name || 'podpisany.pdf').replace(/[\\/\x00-\x1f\x7f]/g, '_').slice(0, 180);
            return { filename, content, contentType: 'application/pdf' };
        });
        const id = typeof request.inReplyTo === 'string' && /^<[^<>\s]{1,500}>$/.test(request.inReplyTo) ? request.inReplyTo : undefined;
        const transport = mailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' });
        const result = await transport.sendMail({ from: c.email, to, cc, subject: request.subject, text: request.body, inReplyTo: id, references: id, attachments: files, headers: { 'X-Unsent': '1' }, disableFileAccess: true, disableUrlAccess: true });
        return { raw: result.message.toString('base64'), envelope: { from: c.email, to: [...new Set([...to, ...cc])] } };
    }
    if (request.op === 'send') {
        const envelope = request.envelope;
        if (!envelope || envelope.from !== c.email || !addresses(envelope.to).length || typeof request.raw !== 'string' || request.raw.length > LIMIT * 2) throw new Error('RECIPIENTS');
        const mailer = deps.mailer || require('nodemailer');
        const transport = mailer.createTransport({ host: c.smtpHost, port: c.smtpPort, secure: c.smtpPort === 465, requireTLS: true, tls: { rejectUnauthorized: true }, auth: { user: c.email, pass: c.password }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 45000, logger: false, debug: false });
        try {
            const result = await transport.sendMail({ envelope, raw: Buffer.from(request.raw, 'base64'), disableFileAccess: true, disableUrlAccess: true });
            if ((result.rejected || []).length) throw new Error('SEND_UNKNOWN');
            return { sent: true };
        } catch (error) {
            // These protocol stages precede MAIL/RCPT/DATA; retry cannot duplicate delivery.
            if (error.code === 'EAUTH' || /^(CONN|EHLO|HELO|STARTTLS|AUTH(?: |$))/.test(error.command || '')) throw new Error('SEND_NOT_STARTED');
            throw new Error('SEND_UNKNOWN');
        }
        finally { transport.close(); }
    }
    const Client = deps.ImapFlow || require('imapflow').ImapFlow;
    const client = new Client({ host: c.imapHost, port: 993, secure: true, tls: { rejectUnauthorized: true }, auth: { user: c.email, pass: c.password }, logger: false, disableAutoIdle: true, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 45000 });
    let lock;
    try {
        await client.connect();
        lock = await client.getMailboxLock('INBOX', { readOnly: true });
        if (request.op === 'search') {
            const query = String(request.query || '').trim(); if (query.length > 200) throw new Error('QUERY');
            const since = new Date(Date.now() - 180 * 86400000);
            const bounded = { since, seq: `${Math.max(1, client.mailbox.exists - 1999)}:*` };
            const ids = client.mailbox.exists ? await client.search(query ? { ...bounded, or: [{ subject: query }, { from: query }] } : bounded, { uid: true }) : [];
            const messages = [];
            if (ids.length) for await (const item of client.fetch(ids.slice(-40).join(','), { uid: true, envelope: true, bodyStructure: true }, { uid: true })) {
                const files = attachments(item.bodyStructure); if (!files.length) continue;
                const e = item.envelope || {};
                const reply = (e.replyTo?.length ? e.replyTo : e.from || []).map(a => a.address).filter(validAddress);
                messages.push({ uid: item.uid, validity: String(client.mailbox.uidValidity), subject: e.subject || '(bez tematu)', from: (e.from || []).map(a => a.address).join(', '), to: reply, cc: [], messageId: e.messageId || '', date: e.date ? String(e.date) : '', attachments: files });
            }
            return { messages: messages.reverse() };
        }
        if (request.op !== 'download' || !Number.isSafeInteger(request.uid) || request.uid < 1 || request.validity !== String(client.mailbox.uidValidity) || typeof request.part !== 'string') throw new Error('MESSAGE_CHANGED');
        const item = await client.fetchOne(request.uid, { bodyStructure: true }, { uid: true });
        if (!item || !attachments(item.bodyStructure).some(a => a.part === request.part)) throw new Error('MESSAGE_CHANGED');
        const result = await client.download(request.uid, request.part, { uid: true, maxBytes: LIMIT + 1 });
        const data = await bytes(result.content, LIMIT);
        if (data.subarray(0, 5).toString() !== '%PDF-') throw new Error('ATTACHMENTS');
        return { data: data.toString('base64') };
    } finally { if (lock) lock.release(); try { await client.logout(); } catch (_) { client.close(); } }
}
module.exports = { run, attachments, addresses, account, bytes, LIMIT };
if (require.main === module) {
    let input = '', over = false;
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { input += chunk; if (input.length > LIMIT * 2 + 65536) { over = true; input = ''; process.stdin.destroy(); } });
    process.stdin.on('end', async () => {
        try { if (over) throw new Error('TOO_LARGE'); const result = await run(JSON.parse(input)); process.stdout.write(JSON.stringify({ ok: true, result })); }
        catch (e) { process.stdout.write(JSON.stringify({ ok: false, code: ['SEND_UNKNOWN','SEND_NOT_STARTED','TOO_LARGE','RECIPIENTS','ACCOUNT','ATTACHMENTS','MESSAGE_CHANGED'].includes(e.message) ? e.message : 'CONNECTION' })); }
    });
}
