import { useState, useEffect } from 'react';
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
                            <div className="log-col-time mono">{log.time}</div>
                            <div className="log-col-activity mono">{log.activity}</div>
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
