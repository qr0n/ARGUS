import { NavLink } from 'react-router-dom';
import { Bell, LayoutDashboard, Search as SearchIcon, Camera, Activity, FileText, ChevronLeft, ChevronRight, UserCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import './Layout.css';

export function Sidebar({ collapsed, setCollapsed }: { collapsed: boolean, setCollapsed: (val: boolean) => void }) {
  const [alertCount, setAlertCount] = useState(0);

  // Live alert badge — polls unreviewed warning/high logs
  useEffect(() => {
    const fetchCount = () => {
      fetch('/api/logs')
        .then(r => r.json())
        .then((data: { severity?: string; status?: string }[]) => {
          const count = data.filter(
            l => (l.severity === 'warning' || l.severity === 'high') &&
                 (!l.status || l.status === 'unreviewed')
          ).length;
          setAlertCount(count);
        })
        .catch(() => {});
    };
    fetchCount();
    const interval = setInterval(fetchCount, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, []);

  const navItems: { label: string; icon: React.ReactNode; path: string; badge: number }[] = [
    { label: 'Alerts', icon: <Bell size={20} />, path: '/alerts', badge: alertCount },
    { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/', badge: 0 },
    { label: 'Find Matches', icon: <SearchIcon size={20} />, path: '/find-matches', badge: 0 },
    { label: 'Live Camera', icon: <Camera size={20} />, path: '/live-camera', badge: 0 },
    { label: 'Activity Log', icon: <Activity size={20} />, path: '/activity-log', badge: 0 },
    { label: 'Case Profiles', icon: <FileText size={20} />, path: '/case-profiles', badge: 0 },
    { label: 'AI Aging', icon: <UserCircle size={20} />, path: '/ai-aging', badge: 0 },
  ];

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : 'expanded'}`}>
      <div className="sidebar-header">
        <h1 className="brand-title">{collapsed ? 'A' : 'ARGUS'}</h1>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            title={collapsed ? item.label : undefined}
          >
            <div className="nav-icon-container">
              {item.icon}
              {item.badge > 0 && <span className="nav-badge"></span>}
            </div>
            {!collapsed && <span className="nav-label">{item.label}</span>}
            {!collapsed && item.badge > 0 && <span className="nav-badge-count">{item.badge}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>
    </aside>
  );
}
