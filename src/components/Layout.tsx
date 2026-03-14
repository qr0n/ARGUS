import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const pageInfo: Record<string, { title: string, subtitle: string }> = {
    '/': { title: 'Dashboard', subtitle: 'System Overview and Metrics' },
    '/alerts': { title: 'Detection Alerts', subtitle: 'Review and manage system alerts' },
    '/find-matches': { title: 'Find Matches', subtitle: 'Upload imagery for cross-reference' },
    '/live-camera': { title: 'Live Camera', subtitle: 'Real-time feed analysis' },
    '/activity-log': { title: 'System Activity Log', subtitle: 'Audit trail of recent events' },
    '/case-profiles': { title: 'Case Profiles', subtitle: 'Manage investigative profiles' },
};

export function Layout() {
    const [collapsed, setCollapsed] = useState(false);
    const location = useLocation();
    const currentInfo = pageInfo[location.pathname] || { title: 'ARGUS', subtitle: '' };

    return (
        <div className="app-layout">
            <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
            <div className="main-area">
                <TopBar title={currentInfo.title} subtitle={currentInfo.subtitle} />
                <main className="page-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
