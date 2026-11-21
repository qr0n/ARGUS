// Security headers for every response.
//
// - HSTS: the server is HTTPS-only; browsers should never downgrade.
// - Content-Security-Policy: API responses may not be framed or run anything;
//   the two HTML pages the backend serves may only load scripts, styles and
//   models from this server (no third-party CDNs or fonts).
// - Permissions-Policy: only the phone streamer page may use the camera.

const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

// The backend's pages use inline <script>/<style>, so 'unsafe-inline' is still
// needed for them; everything else is locked to this origin.
const PAGE_CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self' wss:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
].join('; ');

export function securityHeaders(req, res, next) {
    res.set({
        'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Permissions-Policy': req.path === '/stream-video'
            ? 'camera=(self), microphone=(), geolocation=()'
            : 'camera=(), microphone=(), geolocation=()',
        'Content-Security-Policy': (req.path === '/stream-video' || req.path === '/view-stream') ? PAGE_CSP : API_CSP,
    });
    next();
}
