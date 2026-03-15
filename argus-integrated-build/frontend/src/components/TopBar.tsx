import { Bell, Search, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function TopBar({ title, subtitle, onShowOnboarding }: { title: string, subtitle: string, onShowOnboarding: () => void }) {
    const navigate = useNavigate();

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
                    <div className="avatar-initials">KR</div>
                    <div className="profile-info">
                        <span className="profile-name">K. Reid</span>
                        <span className="profile-access">Level 3 Access</span>
                    </div>
                </div>
            </div>
        </header>
    );
}
