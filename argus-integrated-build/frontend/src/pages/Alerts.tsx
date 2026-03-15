import { useState, useEffect } from 'react';
import './Alerts.css';
import { Check, X, Loader2 } from 'lucide-react';

interface LogEntry {
    id?: string;
    time: string;
    activity: string;
    type?: string;
    severity?: string;
    status?: string;
}

export function Alerts() {
    const [alerts, setAlerts] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'unreviewed' | 'verified' | 'dismissed'>('unreviewed');
    const [datasetFiles, setDatasetFiles] = useState<string[]>([]);
    
    const fetchAlerts = () => {
        fetch('/api/logs')
            .then(res => res.json())
            .then((data: LogEntry[]) => {
                // Filter out info logs, we only want warnings or high priority items to act as Alerts
                const filtered = data.filter(log => log.severity === 'warning' || log.severity === 'high');
                setAlerts(filtered);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch alerts", err);
                setLoading(false);
            });
            
        fetch('/dataset')
            .then(res => res.json())
            .then((data: string[]) => setDatasetFiles(data))
            .catch(() => {});
    };

    useEffect(() => {
        fetchAlerts();
    }, []);

    const updateStatus = async (id: string, newStatus: string) => {
        try {
            await fetch(`/api/logs/${id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            fetchAlerts(); // refresh
        } catch (e) {
            console.error("Failed to update status", e);
        }
    };

    const filteredAlerts = alerts.filter(a => (a.status || 'unreviewed') === filter);
    const unreviewedCount = alerts.filter(a => (a.status || 'unreviewed') === 'unreviewed').length;

    return (
        <div className="alerts-page">
            <div className="alerts-toolbar">
                <div className="alerts-count mono">{unreviewedCount} ALERTS UNREVIEWED</div>
                <div className="filter-tabs">
                    <button className={`tab ${filter === 'unreviewed' ? 'active' : ''}`} onClick={() => setFilter('unreviewed')}>Unreviewed</button>
                    <button className={`tab ${filter === 'verified' ? 'active' : ''}`} onClick={() => setFilter('verified')}>Verified</button>
                    <button className={`tab ${filter === 'dismissed' ? 'active' : ''}`} onClick={() => setFilter('dismissed')}>Dismissed</button>
                </div>
            </div>

            <div className="alerts-listview">
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="spin" size={32} color="var(--accent)" /></div>
                ) : filteredAlerts.length > 0 ? filteredAlerts.map((alert) => {
                    // Extract confidence if exists in string (e.g. "91%")
                    const confMatch = alert.activity.match(/(\d+)%/);
                    const conf = confMatch ? confMatch[1] : null;
                    const cleanActivity = alert.activity;
                    
                    let subjectName = '';
                    const nameMatch = alert.activity.match(/—\s+([A-Z0-9\s_]+?)\s*\(/i) || alert.activity.match(/Match Detected[\s:-—]+([A-Z0-9\s_]+?)\s*\(/i);
                    if (nameMatch) {
                        subjectName = nameMatch[1].trim().toLowerCase();
                    }
                    
                    let imageSrc: string | undefined = undefined;
                    if (subjectName && datasetFiles.length > 0) {
                        const file = datasetFiles.find(f => f.toLowerCase().startsWith(subjectName));
                        imageSrc = file ? `/dataset/${file}` : `/dataset/${subjectName}.jpg`;
                    } else if (subjectName) {
                        imageSrc = `/dataset/${subjectName}.jpg`;
                    }
                    
                    return (
                        <div key={alert.id || alert.time} className="card alert-full-card">
                            <span className={`badge status-badge ${filter === 'unreviewed' ? 'badge-red' : filter === 'verified' ? 'badge-green' : 'badge-blue'}`}>
                                {filter.toUpperCase()}
                            </span>

                            <div className="alert-top-row">
                                <div className="alert-full-avatar">
                                    {imageSrc && (
                                        <img src={imageSrc} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                    )}
                                    <span className={`online-dot ${alert.status === 'dismissed' ? 'offline' : ''}`}></span>
                                </div>

                                <div className="alert-full-info">
                                    <div className="afi-header">
                                        <h3 className="afi-name">{cleanActivity}</h3>
                                    </div>
                                    <div className="afi-meta mono">
                                        <span className="afi-time">{alert.time}</span>
                                        <span className="afi-divider">|</span>
                                        <span className="afi-source">AT: {alert.type ? alert.type.toUpperCase() : 'SYSTEM'}</span>
                                    </div>
                                </div>
                            </div>

                            {conf && (
                                <div className="alert-full-confidence">
                                    <span className="badge badge-blue mono">{conf}% CONFIDENT</span>
                                    <div className="progress-bar-container">
                                        <div className="progress-bar-fill" style={{ width: `${conf}%` }}></div>
                                    </div>
                                </div>
                            )}

                            <div className="alert-full-actions">
                                {(alert.status || 'unreviewed') === 'unreviewed' && (
                                    <div className="action-btns">
                                        <button className="btn btn-action-verify" onClick={() => updateStatus(alert.id!, 'verified')}>
                                            <Check size={16} /> Verify Identified Match
                                        </button>
                                        <button className="btn btn-danger" onClick={() => updateStatus(alert.id!, 'dismissed')}>
                                            <X size={16} /> Dismiss
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                }) : (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                        No {filter} alerts found in the database.
                    </div>
                )}
            </div>
        </div>
    );
}
