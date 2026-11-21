import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, ScanFace, Camera, Briefcase, Clock } from 'lucide-react';
import './Dashboard.css';

export function Dashboard() {
    const [recentLogs, setRecentLogs] = useState<{time: string, activity: string, type?: string, severity?: string}[]>([]);
    const [alertsCount, setAlertsCount] = useState(0);
    const [datasetLength, setDatasetLength] = useState(0);
    const [datasetFiles, setDatasetFiles] = useState<string[]>([]);
    // Real camera status from paired phones (see /api/devices).
    const [cameras, setCameras] = useState<{ paired: number; online: number } | null>(null);
    const [activeCases, setActiveCases] = useState<{name: string, filename: string}[]>([]);
    
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
            .then((data: string[]) => {
                setDatasetFiles(data);
                setDatasetLength(data.length);
                // Only real data: name (from file name) and photo. No case status is stored yet.
                const cases = data.slice(0, 4).map((filename: string) => {
                    const name = filename.replace(/\.[^.]+$/, '').replace(/_[0-9]+$/, '').replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    return { name, filename };
                });
                setActiveCases(cases);
            })
            .catch(err => console.error("Failed to fetch dataset", err));

        const loadCameras = () => fetch('/api/devices')
            .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
            .then((list: { online: boolean }[]) => setCameras({ paired: list.length, online: list.filter(d => d.online).length }))
            .catch(() => setCameras(null));
        loadCameras();
        const t = setInterval(loadCameras, 10000);
        return () => clearInterval(t);
    }, []);

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
                        <div className="stat-icon"><AlertTriangle color="var(--status-red)" size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">{alertsCount}</span>
                            <span className="stat-label">Active Alerts</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon"><Briefcase color="var(--status-amber)" size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">{datasetLength}</span>
                            <span className="stat-label">Case Profiles</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon"><Camera color="var(--accent)" size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">{cameras ? cameras.online : '–'}</span>
                            <span className="stat-label">Cameras Streaming</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon"><CheckCircle2 color="var(--status-green)" size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">{cameras ? cameras.paired : '–'}</span>
                            <span className="stat-label">Paired Phones</span>
                        </div>
                    </div>

                    {/* Active Cases */}
                    <div className="card active-cases-card" style={{ gridColumn: '1 / -1' }}>
                        <div className="card-header">
                            <h4>Case Profiles</h4>
                        </div>
                        <div className="cases-grid">
                            {activeCases.length > 0 ? activeCases.map((ac, i) => (
                                <div key={i} className="mini-case-card">
                                    <div className="case-avatar" style={{ background: 'var(--bg-card-hover)', border: '1px solid var(--border)' }}>
                                        <img src={`/dataset/${ac.filename}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                    </div>
                                    <div className="case-info">
                                        <span className="case-name">{ac.name}</span>
                                    </div>
                                </div>
                            )) : (
                                <div style={{ gridColumn: '1 / -1', padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>No active cases found.</div>
                            )}
                        </div>
                        <a href="/case-profiles" className="btn btn-full" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>View All Cases</a>
                    </div>
                </div>

                {/* Right Column - Feeds */}
                <div className="feeds-column">
                    {/* System Modules */}
                    <div className="card system-modules-card">
                        <div className="card-header" style={{ marginBottom: '12px' }}>
                            <h4>System Modules</h4>
                            <span className={`badge ${cameras && cameras.online > 0 ? 'badge-green' : 'badge-amber'}`}>
                                {cameras && cameras.online > 0 ? '4 ACTIVE' : '3 READY · NO STREAM'}
                            </span>
                        </div>
                        <div className="modules-grid" style={{ marginBottom: '8px' }}>
                            <div className="module-item">
                                <Camera className="module-icon" color="var(--accent)" size={24} />
                                <div className="module-info">
                                    <span className="module-name">Live Camera</span>
                                    <span className={`module-status badge mono ${cameras && cameras.online > 0 ? 'badge-green' : 'badge-amber'}`}>
                                        {cameras && cameras.online > 0 ? 'STREAMING' : 'NO STREAM'}
                                    </span>
                                </div>
                            </div>
                            <div className="module-item">
                                <Clock className="module-icon" color="var(--accent)" size={24} />
                                <div className="module-info">
                                    <span className="module-name">AI Aging</span>
                                    <span className="module-status badge badge-green mono">READY</span>
                                </div>
                            </div>
                            <div className="module-item">
                                <ScanFace className="module-icon" color="var(--accent)" size={24} />
                                <div className="module-info">
                                    <span className="module-name">Face Matcher</span>
                                    <span className="module-status badge badge-green mono">READY</span>
                                </div>
                            </div>
                            <div className="module-item">
                                <Briefcase className="module-icon" color="var(--accent)" size={24} />
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
                            <span className="badge badge-red">{alertsCount} NEW</span>
                        </div>
                        <div className="alert-list">
                            {recentLogs.length > 0 ? recentLogs.map((log, i) => {
                                let cleanActivity = log.activity;
                                if (cleanActivity.includes(':')) {
                                    cleanActivity = cleanActivity.split(':')[1].trim();
                                }
                                
                                let subjectName = '';
                                const nameMatch = log.activity.match(/—\s+([A-Z0-9\s_]+?)\s*\(/i) || log.activity.match(/Match Detected[\s:-—]+([A-Z0-9\s_]+?)\s*\(/i);
                                if (nameMatch) {
                                    subjectName = nameMatch[1].trim().toLowerCase();
                                }
                                
                                let imageSrc: string | undefined = undefined;
                                if (subjectName && datasetFiles.length > 0) {
                                    const file = datasetFiles.find(f => f.toLowerCase().startsWith(subjectName));
                                    if (file) imageSrc = `/dataset/${file}`;
                                }

                                return (
                                <div key={i} className="alert-row">
                                    <div className="alert-avatar" style={{ background: 'var(--bg-card-hover)', border: '1px solid var(--border)' }}>
                                        {imageSrc && (
                                            <img src={imageSrc} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                        )}
                                    </div>
                                    <div className="alert-details">
                                        <span className="alert-name" style={{ fontSize: '12px' }}>{cleanActivity}</span>
                                        <span className="badge badge-blue mono" style={{ marginTop: '4px' }}>{log.type ? log.type.toUpperCase() : 'SYSTEM LOG'}</span>
                                    </div>
                                    <div className="alert-meta">
                                        <span className="badge badge-amber mono">{log.time}</span>
                                    </div>
                                </div>
                                );
                            }) : (
                                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>No unreviewed alerts found.</div>
                            )}
                        </div>
                        <a href="/alerts" className="btn btn-full" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>Review All Alerts</a>
                    </div>
                </div>
            </div>
        </div>
    );
}
