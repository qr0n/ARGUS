import { Bell, Search, Info, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/context';

const ROLE_LABELS: Record<string, string> = { admin: 'Administrator', operator: 'Operator', viewer: 'Viewer' };

export function TopBar({ title, subtitle, onShowOnboarding }: { title: string, subtitle: string, onShowOnboarding: () => void }) {
    const navigate = useNavigate();
    const { user, signOut } = useAuth();
    const displayName = user.name || user.email || 'Signed in';
    const initials = displayName.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join('') || '?';
    const roleLabel = (user.role && ROLE_LABELS[user.role]) || '';

    return (
        <header className="topbar">
            <div className="topbar-left">
                <h2 className="page-title">{title}</h2>
                <p className="page-subtitle">{subtitle}</p>
            </div>

            <div className="topbar-center">
                <button className="topbar-info-btn" onClick={onShowOnboarding}>
                    <Info size={16} /> How To Use
                </button>
                <button className="topbar-alert-btn" onClick={() => navigate('/alerts')} title="View Alerts">
                    <Bell size={20} />
                    <span className="alert-red-dot"></span>
                </button>
                <div className="search-container">
                    <Search size={18} className="search-icon" />
                    <input type="text" placeholder="Search cases, alerts…" className="search-input" />
                </div>
            </div>

            <div className="topbar-right">
                <div className="profile-chip">
                    <div className="avatar-initials">{initials}</div>
                    <div className="profile-info">
                        <span className="profile-name">{displayName}</span>
                        <span className="profile-access">{roleLabel}</span>
                    </div>
                </div>
                <button className="topbar-info-btn" onClick={signOut} title="Sign out" style={{ whiteSpace: 'nowrap' }}>
                    <LogOut size={16} /> Sign out
                </button>
            </div>
        </header>
    );
}
