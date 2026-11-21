// Small in-memory, fixed-window rate limiter keyed by client address.
//
// The server talks to clients directly (no reverse proxy), so the socket
// address is used and X-Forwarded-For is deliberately ignored: it can be forged.
// Behind a proxy in production, configure the proxy to limit as well.

export function clientAddress(req) {
    return req.socket?.remoteAddress || 'unknown';
}

export function createRateLimiter({ windowMs, max, name }) {
    const hits = new Map(); // key -> { count, resetAt }

    // Drop expired entries now and then so the map cannot grow without bound.
    const sweep = setInterval(() => {
        const now = Date.now();
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }, Math.max(windowMs, 60_000));
    sweep.unref();

    /** Returns true if this key may proceed, false if it is over the limit. */
    function allow(key) {
        const now = Date.now();
        const h = hits.get(key);
        if (!h || h.resetAt <= now) {
            hits.set(key, { count: 1, resetAt: now + windowMs });
            return true;
        }
        h.count += 1;
        return h.count <= max;
    }

    function retryAfterSeconds(key) {
        const h = hits.get(key);
        return h ? Math.max(1, Math.ceil((h.resetAt - Date.now()) / 1000)) : 1;
    }

    function middleware(req, res, next) {
        const key = clientAddress(req);
        if (allow(key)) return next();
        console.warn(`🚦 Rate limit "${name}" hit by ${key}`);
        res.set('Retry-After', String(retryAfterSeconds(key)));
        res.status(429).json({ success: false, error: 'Too many attempts. Wait a few minutes and try again.' });
    }

    return { allow, middleware };
}
