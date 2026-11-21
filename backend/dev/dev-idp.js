// Local development login server (OpenID Connect provider).
//
// DEVELOPMENT ONLY. It accepts ANY username and password: whatever you type as
// the username becomes the signed-in identity (e.g. "admin@argus.test").
// It listens on localhost only and refuses to start with NODE_ENV=production.
//
// It speaks the same OIDC protocol as Microsoft Entra ID and Google, so the
// backend's login code is exercised exactly as it will be in production.
//
// Run:  npm run dev:idp

import Provider from 'oidc-provider';

if (process.env.NODE_ENV === 'production') {
    console.error('❌ The dev login server must never run in production.');
    process.exit(1);
}

const HOST = '127.0.0.1';
const PORT = Number(process.env.ARGUS_DEV_IDP_PORT || 4000);
const ISSUER = process.env.ARGUS_DEV_IDP_ISSUER || `http://localhost:${PORT}`;
const CLIENT_ID = process.env.ARGUS_DEV_IDP_CLIENT_ID || 'argus-local';
const CLIENT_SECRET = process.env.ARGUS_DEV_IDP_CLIENT_SECRET || 'argus-local-dev-secret';
const PUBLIC_URL = process.env.ARGUS_PUBLIC_URL || 'http://localhost:5173';

const redirectUris = [...new Set([
    new URL('/auth/callback', PUBLIC_URL).toString(),
    'https://localhost:3000/auth/callback',
])];

function toEmail(login) {
    const id = String(login).trim().toLowerCase();
    return id.includes('@') ? id : `${id}@argus.test`;
}

const provider = new Provider(ISSUER, {
    clients: [{
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uris: redirectUris,
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_post',
    }],
    claims: {
        openid: ['sub'],
        email: ['email', 'email_verified'],
        profile: ['name'],
    },
    // Put the requested claims straight into the ID token (the backend never
    // calls the userinfo endpoint).
    conformIdTokenClaims: false,
    async findAccount(ctx, id) {
        const email = toEmail(id);
        return {
            accountId: email,
            async claims() {
                return { sub: email, email, email_verified: true, name: email.split('@')[0] };
            },
        };
    },
    features: {
        devInteractions: { enabled: true },
    },
    pkce: { required: () => true },
});

provider.on('server_error', (ctx, err) => console.error('dev IdP server_error:', err));

provider.listen(PORT, HOST, () => {
    console.log(`
      🧪 ARGUS dev login server (DEVELOPMENT ONLY — accepts any username/password)
      Issuer        : ${ISSUER}
      Listening on  : http://${HOST}:${PORT}
      Redirect URIs : ${redirectUris.join(', ')}

      Sign in with any username, e.g. admin@argus.test, operator@argus.test, viewer@argus.test.
      Access is granted only to identities listed in backend/config/roles.json.
    `);
});
