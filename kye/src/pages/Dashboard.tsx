import { AlertTriangle, Clock, Activity, FileCheck, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

export function Dashboard() {
    const navigate = useNavigate();
    const now = new Date();
    const dateString = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="dashboard">
            <div className="dashboard-header">
                <div className="dashboard-datetime">
                    <span className="dashboard-date mono">{dateString}</span>
                    <span className="dashboard-time mono">{timeString}</span>
                </div>
            </div>

            <div className="dashboard-grid">
                {/* Left Column - Stats */}
                <div className="stats-column">
                    <div className="stat-card">
                        <div className="stat-icon"><AlertTriangle color="var(--status-amber)" size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">14</span>
                            <span className="stat-label">Alerts Today</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon"><Activity color="var(--status-red)" size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">3</span>
                            <span className="stat-label">Missing Persons</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon"><Clock color="var(--status-red)" size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">8</span>
                            <span className="stat-label">Wanted Persons</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon"><CheckCircle2 color="var(--status-green)" size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">42</span>
                            <span className="stat-label">Resolved / Month</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon"><FileCheck color="var(--accent)" size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">124</span>
                            <span className="stat-label">Open Cases</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon"><FileCheck color="var(--text-tertiary)" size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">892</span>
                            <span className="stat-label">Closed Cases</span>
                        </div>
                    </div>
                    <div className="stat-card latency-card">
                        <div className="stat-info">
                            <span className="stat-label">Recognition Latency</span>
                            <span className="stat-value mono latency-value">84ms</span>
                        </div>
                    </div>
                </div>

                {/* Right Column - Feeds */}
                <div className="feeds-column">
                    {/* Recent Alerts */}
                    <div className="card recent-alerts-card">
                        <div className="card-header">
                            <h4>Recent Alerts</h4>
                            <span className="badge badge-red">2 NEW</span>
                        </div>
                        <div className="alert-list">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="alert-row">
                                    <div className="alert-row-top">
                                        <div className="alert-avatar"></div>
                                        <div className="alert-details">
                                            <span className="alert-name">John Smith {i}</span>
                                            <span className="badge badge-blue mono">IMAGE UPLOAD</span>
                                        </div>
                                        <span className="badge badge-red alert-status-badge">Unreviewed</span>
                                    </div>
                                    <div className="alert-row-confidence">
                                        <span className="badge badge-amber mono alert-confidence-badge">78% CONFIDENT</span>
                                        <div className="progress-bar-container">
                                            <div className="progress-bar-fill" style={{ width: '78%' }}></div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button className="btn btn-full" onClick={() => navigate('/alerts')}>View All Alerts</button>
                    </div>

                    {/* Active Cases */}
                    <div className="card active-cases-card">
                        <div className="card-header">
                            <h4>Active Cases</h4>
                        </div>
                        <div className="cases-grid">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="mini-case-card">
                                    <div className="case-avatar"></div>
                                    <div className="case-info">
                                        <span className="case-name">Jane Doe {i}</span>
                                        <div className="case-tags">
                                            <span className="badge badge-amber">Missing</span>
                                            <span className="badge badge-red">High Priority</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button className="btn btn-full" onClick={() => navigate('/case-profiles')}>View All Cases</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
