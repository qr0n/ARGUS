// Activity / alert log, stored privately (never served as a file).
//
// Only known fields are stored, values are validated, and the server — not the
// client — sets the id, time and acting user. Writes are serialized and atomic
// (write to a temp file, then rename) so concurrent requests can't corrupt it.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const MAX_ENTRIES = 1000;
const SEVERITIES = new Set(['info', 'warning', 'high']);
const STATUSES = new Set(['unreviewed', 'reviewing', 'verified', 'dismissed']);

export class LogValidationError extends Error {
    constructor(message) { super(message); this.status = 400; }
}

function validateNew(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new LogValidationError('Invalid log entry');
    const activity = typeof body.activity === 'string' ? body.activity.trim() : '';
    if (!activity || activity.length > 500) throw new LogValidationError('activity must be 1–500 characters');
    const type = body.type === undefined ? 'system' : body.type;
    if (typeof type !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(type)) throw new LogValidationError('Invalid type');
    const severity = body.severity === undefined ? 'info' : body.severity;
    if (!SEVERITIES.has(severity)) throw new LogValidationError('Invalid severity');
    const status = body.status === undefined ? 'unreviewed' : body.status;
    if (!STATUSES.has(status)) throw new LogValidationError('Invalid status');
    return { activity, type, severity, status };
}

export function createLogStore(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, '[]', { mode: 0o600 });

    let queue = Promise.resolve();
    const serialize = fn => (queue = queue.then(fn, fn));

    async function read() {
        try {
            const data = JSON.parse(await fs.promises.readFile(file, 'utf-8'));
            return Array.isArray(data) ? data : [];
        } catch (e) {
            if (e instanceof SyntaxError) {
                console.error(`❌ ${file} is not valid JSON; refusing to overwrite it.`);
            }
            throw e;
        }
    }

    async function write(entries) {
        const tmp = `${file}.${process.pid}.tmp`;
        await fs.promises.writeFile(tmp, JSON.stringify(entries, null, 2), { mode: 0o600 });
        await fs.promises.rename(tmp, file);
    }

    function list() {
        return read();
    }

    /** Append an entry. `body` comes from a client or the server; `actor` is always server-derived. */
    function append(body, actor) {
        const fields = validateNew(body);
        return serialize(async () => {
            const now = new Date();
            const entry = {
                id: crypto.randomUUID(),
                ...fields,
                time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                timestamp: now.toISOString(),
                actor,
            };
            const entries = await read();
            entries.unshift(entry);
            entries.length = Math.min(entries.length, MAX_ENTRIES);
            await write(entries);
            return entry;
        });
    }

    function setStatus(id, status, actor) {
        if (!STATUSES.has(status)) return Promise.reject(new LogValidationError('Invalid status'));
        return serialize(async () => {
            const entries = await read();
            const entry = entries.find(e => e.id === id);
            if (!entry) return null;
            entry.status = status;
            entry.reviewedBy = actor;
            entry.reviewedAt = new Date().toISOString();
            await write(entries);
            return entry;
        });
    }

    return { list, append, setStatus };
}
