// Authentication and authorization for the ARGUS backend.
//
// - The server runs the OIDC login itself; the browser only ever holds an
//   httpOnly session cookie, never an access or ID token.
// - Roles are resolved from ARGUS's own roles file on every request.
// - State-changing requests and WebSocket upgrades must come from an allowed
//   Origin (protects cookie-based auth against cross-site requests).

import path from 'path';
import session from 'express-session';
import * as client from 'openid-client';
import { loadProviders } from './providers.js';
import { createRoleStore, roleAtLeast } from './roles.js';
import { createRateLimiter } from '../security/rateLimit.js';

const SESSION_COOKIE = 'argus.sid';
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // absolute lifetime: one working shift
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;        // signed out after 30 minutes without a request
const LOGIN_PENDING_MAX_AGE_MS = 10 * 60 * 1000;

function normalizeOrigin(value) {
    try {
        const u = new URL(value);
        return `${u.protocol}//${u.host}`;
    } catch {
        return null;
    }
}

// Only allow same-site relative paths as post-login destinations (no open redirect).
function safeReturnTo(value) {
    if (typeof value !== 'string') return '/';
    if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
    if (/[\r\n]/.test(value)) return '/';
    return value;
}

/**
 * @param onSecurityEvent  called with { type, identity?, role?, sessionId?, detail? } for
 *                         sign-in, sign-in failure, sign-out and idle expiry (for the audit
 *                         log and to drop live connections).
 */
export async function createAuth({ port, extraOrigins = [], onSecurityEvent = () => {} }) {
    const emit = event => {
        try { onSecurityEvent(event); } catch (e) { console.error('Security event handler failed:', e.message); }
    };
    const sessionSecret = process.env.SESSION_SECRET || '';
    if (sessionSecret.length < 32) {
        throw new Error('SESSION_SECRET must be set to a random string of at least 32 characters (see backend/.env.example).');
    }

    const publicUrl = process.env.ARGUS_PUBLIC_URL;
    if (!publicUrl || !normalizeOrigin(publicUrl)) {
        throw new Error('ARGUS_PUBLIC_URL must be set to the URL users open the dashboard at, e.g. http://localhost:5173');
    }
    const redirectUri = new URL('/auth/callback', publicUrl).toString();

    const allowedOrigins = new Set(
        [publicUrl, `https://localhost:${port}`, ...extraOrigins, ...(process.env.ARGUS_ALLOWED_ORIGINS || '').split(',')]
            .map(s => s && normalizeOrigin(s.trim()))
            .filter(Boolean)
    );

    const providers = await loadProviders();
    const roles = createRoleStore(
        path.resolve(process.env.ARGUS_ROLES_FILE || path.join(process.cwd(), 'config', 'roles.json'))
    );

    // NOTE: MemoryStore is fine for local development (sessions end on restart).
    // A shared store (e.g. Redis or the database) is required before production.
    const store = new session.MemoryStore();
    const sessionMiddleware = session({
        name: SESSION_COOKIE,
        secret: sessionSecret,
        store,
        resave: false,
        saveUninitialized: false,
        rolling: false,
        cookie: {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            maxAge: SESSION_MAX_AGE_MS,
            path: '/',
        },
    });

    function currentIdentity(req) {
        const user = req.session?.user;
        if (!user) return null;
        if (!providers.has(user.provider)) return null; // provider since disabled
        return user;
    }

    function isAllowedOrigin(origin) {
        const o = origin && normalizeOrigin(origin);
        return !!o && allowedOrigins.has(o);
    }

    // Reject state-changing requests that don't come from an allowed origin.
    function originCheck(req, res, next) {
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
        if (!isAllowedOrigin(req.headers.origin)) {
            return res.status(403).json({ success: false, error: 'Request origin not allowed' });
        }
        next();
    }

    function requireRole(minRole) {
        return (req, res, next) => {
            const identity = currentIdentity(req);
            if (!identity) {
                return res.status(401).json({ success: false, error: 'Sign-in required' });
            }
            const role = roles.roleFor(identity);
            if (!roleAtLeast(role, minRole)) {
                return res.status(403).json({ success: false, error: 'Insufficient permissions' });
            }
            req.user = { ...identity, role };
            next();
        };
    }

    const isIdle = sess => !!sess?.lastSeenAt && Date.now() - sess.lastSeenAt > IDLE_TIMEOUT_MS;

    // End sessions that have been idle too long; otherwise record activity
    // (at most once a minute, to avoid a store write on every request).
    function idleTimeout(req, res, next) {
        const sess = req.session;
        if (!sess?.user) return next();
        if (isIdle(sess)) {
            const identity = sess.user, sessionId = req.sessionID;
            return sess.destroy(() => {
                emit({ type: 'session-expired', identity, sessionId });
                next();
            });
        }
        if (!sess.lastSeenAt || Date.now() - sess.lastSeenAt > 60_000) sess.lastSeenAt = Date.now();
        next();
    }

    const loginLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 20, name: 'sign-in' });

    function install(app) {
        app.use(sessionMiddleware);
        app.use(idleTimeout);
        app.use(originCheck);

        app.get('/auth/providers', (req, res) => {
            res.json([...providers.values()].map(p => ({ id: p.id, label: p.label })));
        });

        app.use(['/auth/login', '/auth/callback'], loginLimiter.middleware);

        app.get('/auth/login', async (req, res, next) => {
            try {
                const providerId = String(req.query.provider || (providers.size === 1 ? [...providers.keys()][0] : ''));
                const provider = providers.get(providerId);
                if (!provider) return res.status(400).send('Unknown sign-in provider');

                const codeVerifier = client.randomPKCECodeVerifier();
                const state = client.randomState();
                const nonce = client.randomNonce();
                req.session.loginPending = {
                    provider: provider.id,
                    codeVerifier,
                    state,
                    nonce,
                    returnTo: safeReturnTo(req.query.returnTo),
                    createdAt: Date.now(),
                };

                const params = {
                    redirect_uri: redirectUri,
                    scope: 'openid email profile',
                    code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
                    code_challenge_method: 'S256',
                    state,
                    nonce,
                };
                if (provider.id === 'google') params.prompt = 'select_account';
                if (provider.allowedHostedDomain) params.hd = provider.allowedHostedDomain;

                const url = client.buildAuthorizationUrl(provider.config, params);
                req.session.save(err => (err ? next(err) : res.redirect(url.href)));
            } catch (e) {
                next(e);
            }
        });

        app.get('/auth/callback', async (req, res) => {
            const pending = req.session?.loginPending;
            if (req.session) delete req.session.loginPending;

            if (!pending || Date.now() - pending.createdAt > LOGIN_PENDING_MAX_AGE_MS) {
                return res.redirect('/?signin=expired');
            }
            const provider = providers.get(pending.provider);
            if (!provider) return res.redirect('/?signin=failed');

            let claims;
            try {
                // Rebuild the URL the provider redirected to, on our configured public origin.
                const currentUrl = new URL(req.originalUrl, publicUrl);
                const tokens = await client.authorizationCodeGrant(provider.config, currentUrl, {
                    pkceCodeVerifier: pending.codeVerifier,
                    expectedState: pending.state,
                    expectedNonce: pending.nonce,
                    idTokenExpected: true,
                });
                claims = tokens.claims();
            } catch (e) {
                console.warn(`🔐 Sign-in failed (${pending.provider}): ${e.message}`);
                emit({ type: 'login-failed', detail: `${pending.provider}: token validation failed` });
                return res.redirect('/?signin=failed');
            }

            if (!claims?.sub) return res.redirect('/?signin=failed');
            if (provider.allowedHostedDomain && claims.hd !== provider.allowedHostedDomain) {
                emit({ type: 'login-failed', detail: `${provider.id}: account outside allowed domain` });
                return res.redirect('/?signin=domain');
            }

            const identity = {
                provider: provider.id,
                sub: String(claims.sub),
                email: typeof claims.email === 'string' ? claims.email : null,
                emailVerified: claims.email_verified === true,
                name: typeof claims.name === 'string' ? claims.name : null,
            };

            // New session ID on login prevents session fixation.
            req.session.regenerate(err => {
                if (err) return res.status(500).send('Could not start session');
                req.session.user = identity;
                req.session.lastSeenAt = Date.now();
                req.session.save(err2 => {
                    if (err2) return res.status(500).send('Could not start session');
                    const role = roles.roleFor(identity);
                    console.log(`🔐 Signed in: ${identity.provider} sub=${identity.sub} email=${identity.email || '-'} role=${role || 'NONE'}`);
                    emit({ type: role ? 'login' : 'login-no-access', identity, role, sessionId: req.sessionID });
                    res.redirect(pending.returnTo);
                });
            });
        });

        app.post('/auth/logout', (req, res) => {
            const identity = currentIdentity(req), sessionId = req.sessionID;
            const done = () => {
                if (identity) emit({ type: 'logout', identity, sessionId });
                res.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, secure: true, sameSite: 'lax' });
                res.json({ success: true });
            };
            if (!req.session) return done();
            req.session.destroy(() => done());
        });

        // Who am I? 401 = not signed in. role: null = signed in but not granted access.
        app.get('/auth/me', (req, res) => {
            const identity = currentIdentity(req);
            if (!identity) return res.status(401).json({ success: false, error: 'Sign-in required' });
            res.json({
                provider: identity.provider,
                sub: identity.sub,
                email: identity.email,
                name: identity.name,
                role: roles.roleFor(identity),
            });
        });
    }

    /**
     * Authenticate a WebSocket upgrade request before the handshake completes.
     * Resolves to { identity, role, sessionId } or null.
     */
    function authenticateUpgrade(req) {
        return new Promise(resolve => {
            if (!isAllowedOrigin(req.headers.origin)) return resolve(null);
            // express-session only needs the request (cookies) here; the stub
            // response object is never written to.
            sessionMiddleware(req, {}, () => {
                const identity = currentIdentity(req);
                if (!identity || isIdle(req.session)) return resolve(null);
                resolve({ identity, role: roles.roleFor(identity), sessionId: req.sessionID });
            });
        });
    }

    /**
     * Re-check an open connection: is its session still live (not signed out,
     * not expired, not idle) and does the person still hold at least `minRole`?
     */
    function stillAuthorized(sessionId, identity, minRole) {
        return new Promise(resolve => {
            store.get(sessionId, (err, sess) => {
                if (err || !sess?.user || isIdle(sess)) return resolve(false);
                resolve(roleAtLeast(roles.roleFor(identity), minRole));
            });
        });
    }

    return { install, requireRole, authenticateUpgrade, stillAuthorized, isAllowedOrigin, roleAtLeast, providers };
}
