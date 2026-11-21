// OIDC identity providers, configured from environment variables.
//
// Every provider uses the same standard OpenID Connect flow (authorization
// code + PKCE), so adding one is a config entry, not new code.
//
//   ARGUS_AUTH_PROVIDERS=dev            local development login server only
//   ARGUS_AUTH_PROVIDERS=google,entra   real providers
//
// See backend/.env.example for each provider's variables.

import * as client from 'openid-client';

function required(name) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing required environment variable ${name}`);
    return v;
}

const DEFINITIONS = {
    dev: () => {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('The "dev" auth provider accepts any username and must never run in production.');
        }
        return {
            id: 'dev',
            label: 'Local dev login',
            issuer: process.env.ARGUS_DEV_IDP_ISSUER || 'http://localhost:4000',
            clientId: process.env.ARGUS_DEV_IDP_CLIENT_ID || 'argus-local',
            clientSecret: process.env.ARGUS_DEV_IDP_CLIENT_SECRET || 'argus-local-dev-secret',
            // The dev IdP runs over plain HTTP on localhost only.
            allowInsecure: true,
        };
    },
    google: () => ({
        id: 'google',
        label: 'Sign in with Google',
        issuer: 'https://accounts.google.com',
        clientId: required('GOOGLE_CLIENT_ID'),
        clientSecret: required('GOOGLE_CLIENT_SECRET'),
        // Optional: only accept accounts from this Google Workspace domain.
        allowedHostedDomain: process.env.GOOGLE_ALLOWED_HD || null,
    }),
    entra: () => ({
        id: 'entra',
        label: 'Sign in with Microsoft',
        // Single-tenant: the issuer pins sign-ins to one Entra directory.
        issuer: `https://login.microsoftonline.com/${required('ENTRA_TENANT_ID')}/v2.0`,
        clientId: required('ENTRA_CLIENT_ID'),
        clientSecret: required('ENTRA_CLIENT_SECRET'),
    }),
};

export async function loadProviders() {
    const ids = (process.env.ARGUS_AUTH_PROVIDERS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    if (ids.length === 0) {
        throw new Error('ARGUS_AUTH_PROVIDERS is empty — configure at least one sign-in provider (e.g. "dev").');
    }

    const providers = new Map();
    for (const id of ids) {
        const def = DEFINITIONS[id];
        if (!def) throw new Error(`Unknown auth provider "${id}". Known: ${Object.keys(DEFINITIONS).join(', ')}`);
        const p = def();
        const options = p.allowInsecure ? { execute: [client.allowInsecureRequests] } : undefined;
        try {
            p.config = await client.discovery(
                new URL(p.issuer),
                p.clientId,
                undefined,
                client.ClientSecretPost(p.clientSecret),
                options,
            );
        } catch (e) {
            const hint = id === 'dev' ? ' Is the dev login server running? (npm run dev:idp)' : '';
            throw new Error(`Could not reach the "${id}" provider at ${p.issuer}: ${e.message}.${hint}`);
        }
        delete p.clientSecret;
        providers.set(id, p);
    }
    return providers;
}
