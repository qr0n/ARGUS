import { useEffect, useState, type ReactNode } from 'react';
import logo from '../assets/argus_logo_light.png';
import { AuthContext, type CurrentUser } from './context';
import './AuthGate.css';

interface Provider { id: string; label: string }

function loginUrl(providerId: string) {
    const returnTo = window.location.pathname + window.location.search;
    return `/auth/login?provider=${encodeURIComponent(providerId)}&returnTo=${encodeURIComponent(returnTo)}`;
}

async function signOut() {
    await fetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.assign('/');
}

type State =
    | { kind: 'loading' }
    | { kind: 'signed-out'; providers: Provider[] }
    | { kind: 'signed-in'; user: CurrentUser }
    | { kind: 'error'; message: string };

export function AuthGate({ children }: { children: ReactNode }) {
    const [state, setState] = useState<State>({ kind: 'loading' });

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
                    message: 'Cannot reach the ARGUS server. Make sure the backend is running, then refresh.',
                });
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (state.kind === 'loading') {
        return <div className="auth-screen"><p className="auth-muted">Checking sign-in…</p></div>;
    }

    if (state.kind === 'error') {
        return (
            <div className="auth-screen">
                <div className="auth-card">
                    <img src={logo} alt="ARGUS" className="auth-logo" />
                    <p className="auth-error">{state.message}</p>
                </div>
            </div>
        );
    }

    if (state.kind === 'signed-out') {
        return (
            <div className="auth-screen">
                <div className="auth-card">
                    <img src={logo} alt="ARGUS" className="auth-logo" />
                    <h1 className="auth-title">Sign in to ARGUS</h1>
                    {state.providers.length === 0 && <p className="auth-error">No sign-in providers are configured.</p>}
                    {state.providers.map(p => (
                        <a key={p.id} className="auth-btn" href={loginUrl(p.id)}>{p.label}</a>
                    ))}
                </div>
            </div>
        );
    }

    const { user } = state;
    if (!user.role) {
        return (
            <div className="auth-screen">
                <div className="auth-card">
                    <img src={logo} alt="ARGUS" className="auth-logo" />
                    <h1 className="auth-title">Access not granted</h1>
                    <p className="auth-muted">
                        You are signed in as <strong>{user.email || user.sub}</strong>, but this account has not been
                        given access to ARGUS. Ask an administrator to add you, quoting:
                    </p>
                    <code className="auth-code">provider: {user.provider} · sub: {user.sub}</code>
                    <button className="auth-btn auth-btn-secondary" onClick={signOut}>Sign out</button>
                </div>
            </div>
        );
    }

    return <AuthContext.Provider value={{ user, signOut }}>{children}</AuthContext.Provider>;
}
