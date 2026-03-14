import { NavLink } from 'react-router-dom';
import { Bell, LayoutDashboard, Search as SearchIcon, Camera, Activity, FileText, ChevronLeft, ChevronRight, UserCircle } from 'lucide-react';
import './Layout.css';

export function Sidebar({ collapsed, setCollapsed }: { collapsed: boolean, setCollapsed: (val: boolean) => void }) {
  const navItems = [
    { label: 'Alerts', icon: <Bell size={20} />, path: '/alerts', badge: 2 },
    { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/' },
    { label: 'Find Matches', icon: <SearchIcon size={20} />, path: '/find-matches' },
    { label: 'Live Camera', icon: <Camera size={20} />, path: '/live-camera' },
    { label: 'Activity Log', icon: <Activity size={20} />, path: '/activity-log' },
    { label: 'Case Profiles', icon: <FileText size={20} />, path: '/case-profiles' },
    { label: 'AI Aging', icon: <UserCircle size={20} />, path: '/ai-aging' },
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
              {item.badge && <span className="nav-badge"></span>}
            </div>
            {!collapsed && <span className="nav-label">{item.label}</span>}
            {!collapsed && item.badge && <span className="nav-badge-count">{item.badge}</span>}
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
