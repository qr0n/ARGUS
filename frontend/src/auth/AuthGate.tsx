import { useEffect, useState, type ReactNode } from 'react';
import { ShieldCheck, ScrollText, Lock, AlertTriangle } from 'lucide-react';
import logo from '../assets/argus_logo_light.png';
import { AuthContext, type CurrentUser } from './context';
import './AuthGate.css';

interface Provider { id: string; label: string }

// Messages for /?signin=<reason>, set by the backend when a sign-in attempt fails.
const SIGNIN_ERRORS: Record<string, string> = {
    failed: 'Sign-in did not complete. Please try again.',
    expired: 'That sign-in attempt expired. Please start again.',
    domain: 'That account is not part of an organisation allowed to use ARGUS.',
};

function loginUrl(providerId: string) {
    const returnTo = window.location.pathname === '/' ? '/' : window.location.pathname + window.location.search;
    return `/auth/login?provider=${encodeURIComponent(providerId)}&returnTo=${encodeURIComponent(returnTo)}`;
}

async function signOut() {
    await fetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.assign('/');
}

function GoogleMark() {
    return (
        <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
    );
}

function MicrosoftMark() {
    return (
        <svg viewBox="0 0 21 21" width="18" height="18" aria-hidden="true">
            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
        </svg>
    );
}

function ProviderButton({ provider }: { provider: Provider }) {
    if (provider.id === 'google') {
        return (
            <a className="signin-btn signin-btn-google" href={loginUrl(provider.id)}>
                <GoogleMark /> <span>Sign in with Google</span>
            </a>
        );
    }
    if (provider.id === 'entra') {
        return (
            <a className="signin-btn signin-btn-microsoft" href={loginUrl(provider.id)}>
                <MicrosoftMark /> <span>Sign in with Microsoft</span>
            </a>
        );
    }
    return null;
}

function Shell({ children }: { children: ReactNode }) {
    return (
        <div className="auth-screen">
            <aside className="auth-brand">
                <div className="auth-brand-top">
                    <img src={logo} alt="" className="auth-brand-logo" />
                    <span className="auth-brand-name">ARGUS</span>
                </div>
                <div className="auth-brand-body">
                    <h2 className="auth-brand-title">Safety operations console</h2>
                    <ul className="auth-facts">
                        <li><Lock size={16} /> Access is by invitation, with a role set by your administrator.</li>
                        <li><ScrollText size={16} /> Every sign-in, view and decision is recorded with who made it.</li>
                        <li><ShieldCheck size={16} /> Case photos are stored privately and shown only to signed-in staff.</li>
                    </ul>
                </div>
                <p className="auth-brand-foot">Authorised personnel only. Activity on this system is logged.</p>
            </aside>
            <main className="auth-main">{children}</main>
        </div>
    );
}

type State =
    | { kind: 'loading' }
    | { kind: 'signed-out'; providers: Provider[] }
    | { kind: 'signed-in'; user: CurrentUser }
    | { kind: 'error'; message: string };

export function AuthGate({ children }: { children: ReactNode }) {
    const [state, setState] = useState<State>({ kind: 'loading' });
    const [signinError] = useState(() => {
        const reason = new URLSearchParams(window.location.search).get('signin');
        return reason ? (SIGNIN_ERRORS[reason] ?? SIGNIN_ERRORS.failed) : null;
    });

    useEffect(() => {
        // Clean the reason out of the address bar so a refresh doesn't repeat it.
        if (signinError) window.history.replaceState(null, '', window.location.pathname);
    }, [signinError]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const me = await fetch('/auth/me');
                if (me.ok) {
                    const user = (await me.json()) as CurrentUser;
                    if (!cancelled) setState({ kind: 'signed-in', user });
                    return;
                }
                if (me.status !== 401) throw new Error(`Unexpected response ${me.status}`);
                const res = await fetch('/auth/providers');
                if (!res.ok) throw new Error(`Unexpected response ${res.status}`);
                const providers = (await res.json()) as Provider[];
                if (!cancelled) setState({ kind: 'signed-out', providers });
            } catch {
                if (!cancelled) setState({
                    kind: 'error',
                    message: 'Cannot reach the ARGUS server. Check that the backend is running, then refresh.',
                });
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (state.kind === 'loading') {
        return <div className="auth-loading"><span className="auth-spinner" aria-label="Loading" /></div>;
    }

    if (state.kind === 'error') {
        return (
            <Shell>
                <div className="auth-panel">
                    <h1 className="auth-title">Server unavailable</h1>
                    <p className="auth-alert" role="alert"><AlertTriangle size={16} /> {state.message}</p>
                </div>
            </Shell>
        );
    }

    if (state.kind === 'signed-out') {
        const work = state.providers.filter(p => p.id !== 'dev');
        const dev = state.providers.find(p => p.id === 'dev');
        return (
            <Shell>
                <div className="auth-panel">
                    <h1 className="auth-title">Sign in</h1>
                    <p className="auth-subtitle">Use the work account your organisation gave you access with.</p>

                    {signinError && <p className="auth-alert" role="alert"><AlertTriangle size={16} /> {signinError}</p>}

                    {work.length > 0 && (
                        <div className="signin-list">
                            {work.map(p => <ProviderButton key={p.id} provider={p} />)}
                        </div>
                    )}

                    {dev && (
                        <div className="signin-dev">
                            <div className="signin-dev-head">
                                <span className="signin-dev-tag">Development only</span>
                                <span className="signin-dev-note">Accepts any username. Never enabled in production.</span>
                            </div>
                            <a className="signin-btn signin-btn-dev" href={loginUrl(dev.id)}>Continue with local test account</a>
                        </div>
                    )}

                    {state.providers.length === 0 && (
                        <p className="auth-alert" role="alert"><AlertTriangle size={16} /> No sign-in method is configured on the server.</p>
                    )}

                    <p className="auth-help">No access yet? Ask your ARGUS administrator to add your account.</p>
                </div>
            </Shell>
        );
    }

    const { user } = state;
    if (!user.role) {
        return (
            <Shell>
                <div className="auth-panel">
                    <h1 className="auth-title">Access not granted</h1>
                    <p className="auth-subtitle">
                        You're signed in as <strong>{user.email || user.sub}</strong>, but this account hasn't been
                        given a role in ARGUS yet. Send your administrator these details:
                    </p>
                    <dl className="auth-details">
                        <dt>Provider</dt><dd>{user.provider}</dd>
                        <dt>Account ID</dt><dd>{user.sub}</dd>
                    </dl>
                    <button className="signin-btn signin-btn-dev" onClick={signOut}>Sign out</button>
                </div>
            </Shell>
        );
    }

    return <AuthContext.Provider value={{ user, signOut }}>{children}</AuthContext.Provider>;
}
