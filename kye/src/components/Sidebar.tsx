import { NavLink } from 'react-router-dom';
import { Bell, LayoutDashboard, Search as SearchIcon, Camera, Activity, FileText, ChevronLeft, ChevronRight, UserCircle } from 'lucide-react';
import './Layout.css';
import argusLogo from '../assets/argus_logo_light.png';

export function Sidebar({ collapsed, setCollapsed }: { collapsed: boolean, setCollapsed: (val: boolean) => void }) {
  const navItems = [
    { label: 'Alerts', icon: <Bell size={24} />, path: '/alerts', badge: 2, desc: 'Alerts - Review and manage system alerts' },
    { label: 'Dashboard', icon: <LayoutDashboard size={24} />, path: '/', desc: 'Dashboard - System Overview and Metrics' },
    { label: 'Find Matches', icon: <SearchIcon size={24} />, path: '/find-matches', desc: 'Find Matches - Upload imagery for cross-reference' },
    { label: 'AI Aging', icon: <UserCircle size={24} />, path: '/ai-aging', desc: 'AI Aging - Simulate suspect aging progressions' },
    { label: 'Live Camera', icon: <Camera size={24} />, path: '/live-camera', desc: 'Live Camera - Real-time feed analysis' },
    { label: 'Activity Log', icon: <Activity size={24} />, path: '/activity-log', desc: 'Activity Log - Audit trail of recent events' },
    { label: 'Case Profiles', icon: <FileText size={24} />, path: '/case-profiles', desc: 'Case Profiles - Manage investigative profiles' },
  ];

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : 'expanded'}`}>
      <div className="sidebar-header">
        <div className="brand-container">
          <img src={argusLogo} alt="ARGUS Logo" className="brand-logo" />
          {!collapsed && <h1 className="brand-title">ARGUS</h1>}
        </div>
        {!collapsed && <span className="brand-subtitle">Automated Recognition & Geo-tracking Unified System</span>}
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <div className="nav-icon-container">
              {item.icon}
              {item.badge && <span className="nav-badge"></span>}
            </div>
            {!collapsed && <span className="nav-label">{item.label}</span>}
            {!collapsed && item.badge && <span className="nav-badge-count">{item.badge}</span>}
            <span className="nav-tooltip">{item.desc}</span>
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
