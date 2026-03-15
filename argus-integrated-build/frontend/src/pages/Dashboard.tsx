import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Search, Camera, Users, Clock } from 'lucide-react';
import './Dashboard.css';

export function Dashboard() {
    const [recentLogs, setRecentLogs] = useState<{time: string, activity: string, type?: string, severity?: string}[]>([]);
    const [alertsCount, setAlertsCount] = useState(0);
    const [datasetLength, setDatasetLength] = useState(0);
    const [activeCases, setActiveCases] = useState<{name: string, status: string, severity: string}[]>([]);
    
    useEffect(() => {
        fetch('/api/logs')
            .then(res => res.json())
            .then(data => {
                const alertsOnly = data.filter((l: any) => (l.severity === 'warning' || l.severity === 'high') && (!l.status || l.status === 'unreviewed'));
                setAlertsCount(alertsOnly.length);
                setRecentLogs(alertsOnly.slice(0, 3));
            })
            .catch(err => console.error("Failed to fetch logs", err));

        fetch('/dataset')
            .then(res => res.json())
            .then(data => {
                setDatasetLength(data.length);
                const cases = data.slice(0, 4).map((filename: string, i: number) => {
                    const name = filename.replace(/\.[^.]+$/, '').replace(/_[0-9]+$/, '').replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    return {
                        name,
                        status: i % 2 === 0 ? 'Surveillance Active' : 'Missing',
                        severity: i === 0 ? 'High Priority' : 'Standard'
                    };
                });
                setActiveCases(cases);
            })
            .catch(err => console.error("Failed to fetch dataset", err));
    }, []);

    const now = new Date();
    const dateString = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="dashboard">
            <div className="dashboard-header">
                <h3 className="dashboard-datetime">{dateString} | {timeString}</h3>
            </div>

            <div className="dashboard-grid">
                {/* Left Column - Stats */}
                <div className="stats-column">
                    <div className="stat-card">
                        <div className="stat-icon"><AlertTriangle color="var(--status-amber)" size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">{alertsCount}</span>
                            <span className="stat-label">Active Alerts</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon"><Users color="var(--status-blue)" size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">{datasetLength}</span>
                            <span className="stat-label">Case Profiles</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon"><Camera color="var(--status-green)" size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">1</span>
                            <span className="stat-label">Active Cameras</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon"><CheckCircle2 color="var(--status-green)" size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">100%</span>
                            <span className="stat-label">System Uptime</span>
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
                    {/* System Modules */}
                    <div className="card system-modules-card">
                        <div className="card-header" style={{ marginBottom: '12px' }}>
                            <h4>System Modules</h4>
                            <span className="badge badge-green">4 RUNNING</span>
                        </div>
                        <div className="modules-grid" style={{ marginBottom: '8px' }}>
                            <div className="module-item">
                                <Camera className="module-icon" color="var(--accent)" size={24} />
                                <div className="module-info">
                                    <span className="module-name">Live Camera</span>
                                    <span className="module-status badge badge-green mono">ONLINE</span>
                                </div>
                            </div>
                            <div className="module-item">
                                <Clock className="module-icon" color="var(--status-amber)" size={24} />
                                <div className="module-info">
                                    <span className="module-name">AI Aging</span>
                                    <span className="module-status badge badge-green mono">READY</span>
                                </div>
                            </div>
                            <div className="module-item">
                                <Search className="module-icon" color="var(--status-blue)" size={24} />
                                <div className="module-info">
                                    <span className="module-name">Face Matcher</span>
                                    <span className="module-status badge badge-green mono">READY</span>
                                </div>
                            </div>
                            <div className="module-item">
                                <Users className="module-icon" color="var(--text-tertiary)" size={24} />
                                <div className="module-info">
                                    <span className="module-name">Case Profiles</span>
                                    <span className="module-status badge badge-green mono">SYNCED</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Recent Alerts (from Logs) */}
                    <div className="card recent-alerts-card">
                        <div className="card-header" style={{ marginBottom: '12px' }}>
                            <h4>Recent Alerts</h4>
                            <span className="badge badge-red">{alertsCount} UNREVIEWED</span>
                        </div>
                        <div className="alert-list">
                            {recentLogs.length > 0 ? recentLogs.map((log, i) => {
                                const cleanActivity = log.activity.length > 28 ? log.activity.substring(0, 28) + '...' : log.activity;
                                return (
                                <div key={i} className="alert-row">
                                    <div className="alert-avatar" style={{ background: 'var(--bg-card-hover)', border: '1px solid var(--border)' }}></div>
                                    <div className="alert-details">
                                        <span className="alert-name" style={{ fontSize: '12px' }}>{cleanActivity}</span>
                                        <span className="badge badge-blue mono" style={{ marginTop: '4px' }}>{log.type ? log.type.toUpperCase() : 'SYSTEM LOG'}</span>
                                    </div>
                                    <div className="alert-meta">
                                        <span className="badge badge-amber mono">{log.time}</span>
                                        {log.severity && <span className={`badge ${log.severity === 'warning' ? 'badge-red' : 'badge-amber'}`}>{log.severity}</span>}
                                    </div>
                                </div>
                                );
                            }) : (
                                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>No unreviewed alerts found.</div>
                            )}
                        </div>
                        <a href="/alerts" className="btn btn-full" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>Review All Alerts</a>
                    </div>

                    {/* Active Cases */}
                    <div className="card active-cases-card">
                        <div className="card-header">
                            <h4>Active Cases</h4>
                        </div>
                        <div className="cases-grid">
                            {activeCases.length > 0 ? activeCases.map((ac, i) => (
                                <div key={i} className="mini-case-card">
                                    <div className="case-avatar" style={{ background: 'var(--bg-card-hover)', border: '1px solid var(--border)' }}></div>
                                    <div className="case-info">
                                        <span className="case-name">{ac.name}</span>
                                        <div className="case-tags">
                                            <span className="badge badge-amber">{ac.status}</span>
                                            {ac.severity === 'High Priority' && <span className="badge badge-red">{ac.severity}</span>}
                                        </div>
                                    </div>
                                </div>
                            )) : (
                                <div style={{ gridColumn: '1 / -1', padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>No active cases found.</div>
                            )}
                        </div>
                        <a href="/case-profiles" className="btn btn-full" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>View All Cases</a>
                    </div>
                </div>
            </div>
        </div>
    );
}
