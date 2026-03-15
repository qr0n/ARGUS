import { useState, useEffect } from 'react';
import { Clock, Activity } from 'lucide-react';
import './ActivityLog.css';

export function ActivityLog() {
    const [logs, setLogs] = useState<{time: string, activity: string, type?: string}[]>([]);

    useEffect(() => {
        fetch('/api/logs')
            .then(res => res.json())
            .then(data => setLogs(data))
            .catch(err => console.error("Failed to fetch logs", err));
    }, []);

    return (
        <div className="activity-log-page">
            <div className="card log-card">
                <div className="log-header">
                    <div className="log-col-time mono">TIME</div>
                    <div className="log-col-activity mono">LOGGED ACTIVITY</div>
                </div>

                <div className="log-table-body">
                    {logs.map((log, i) => (
                        <div key={i} className="log-row">
                            <div className="log-col-time mono" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Clock size={14} color="var(--text-tertiary)" />
                                {log.time}
                            </div>
                            <div className="log-col-activity mono" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Activity size={14} color="var(--accent)" />
                                {log.activity}
                            </div>
                        </div>
                    ))}
                    {logs.length === 0 && (
                        <div style={{ padding: '20px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                            No robust activity available on the server yet.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
