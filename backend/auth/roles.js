// Role assignments for signed-in users.
//
// Identity comes from the OIDC provider; *authorization* lives here, in ARGUS,
// so every provider behaves the same (Google ID tokens carry no roles at all).
//
// The file is re-read whenever it changes on disk, and roles are resolved on
// every request, so removing someone from the file revokes access immediately.

import fs from 'fs';

export const ROLE_RANK = { viewer: 1, operator: 2, admin: 3 };

export function isValidRole(role) {
    return Object.prototype.hasOwnProperty.call(ROLE_RANK, role);
}

export function roleAtLeast(role, required) {
    return isValidRole(role) && ROLE_RANK[role] >= ROLE_RANK[required];
}

export function createRoleStore(filePath) {
    let cache = { mtimeMs: -1, entries: [] };

    function load() {
        let stat;
        try {
            stat = fs.statSync(filePath);
        } catch {
            if (cache.mtimeMs !== 0) {
                console.warn(`⚠️  Roles file not found at ${filePath} — every signed-in user will be denied.`);
            }
            cache = { mtimeMs: 0, entries: [] };
            return cache.entries;
        }
        if (stat.mtimeMs === cache.mtimeMs) return cache.entries;

        try {
            const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const users = Array.isArray(parsed?.users) ? parsed.users : [];
            const entries = [];
            for (const u of users) {
                if (!u || typeof u.provider !== 'string' || !isValidRole(u.role)) {
                    console.warn('⚠️  Ignoring invalid roles entry:', JSON.stringify(u));
                    continue;
                }
                if (typeof u.sub !== 'string' && typeof u.email !== 'string') {
                    console.warn('⚠️  Roles entry needs "sub" or "email":', JSON.stringify(u));
                    continue;
                }
                entries.push({
                    provider: u.provider,
                    sub: typeof u.sub === 'string' ? u.sub : null,
                    email: typeof u.email === 'string' ? u.email.trim().toLowerCase() : null,
                    role: u.role,
                });
            }
            cache = { mtimeMs: stat.mtimeMs, entries };
        } catch (e) {
            // Fail closed: a broken file grants nobody access.
            console.error(`❌ Could not parse roles file ${filePath}: ${e.message} — denying all users until fixed.`);
            cache = { mtimeMs: stat.mtimeMs, entries: [] };
        }
        return cache.entries;
    }

    /**
     * Resolve the role for a session identity, or null if the user has none.
     * Matching by subject ID is preferred. Matching by email is only allowed
     * when the provider asserted the email is verified, because some providers
     * (e.g. Microsoft Entra) let users set unverified email values.
     */
    function roleFor(identity) {
        if (!identity) return null;
        const entries = load();
        const bySub = entries.find(e => e.provider === identity.provider && e.sub && e.sub === identity.sub);
        if (bySub) return bySub.role;
        if (identity.email && identity.emailVerified === true) {
            const email = identity.email.toLowerCase();
            const byEmail = entries.find(e => e.provider === identity.provider && e.email && e.email === email);
            if (byEmail) return byEmail.role;
        }
        return null;
    }

    return { roleFor };
}
