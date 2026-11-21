import { createContext, useContext } from 'react';

export type Role = 'viewer' | 'operator' | 'admin';

export interface CurrentUser {
    provider: string;
    sub: string;
    email: string | null;
    name: string | null;
    role: Role | null;
}

export const AuthContext = createContext<{ user: CurrentUser; signOut: () => Promise<void> } | null>(null);

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthGate>');
    return ctx;
}
