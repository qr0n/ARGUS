import { useState, useEffect } from 'react';
import { Clock, Activity, User } from 'lucide-react';
import './ActivityLog.css';

interface LogEntry {
    id?: string;
    time: string;
    timestamp?: string;
    activity: string;
    type?: string;
    actor?: string;
}

// Entries written since sign-in was added carry a full timestamp and the acting user.
function when(log: LogEntry) {
    if (!log.timestamp) return log.time;
    const d = new Date(log.timestamp);
    const today = new Date().toDateString() === d.toDateString();
    return today ? d.toLocaleTimeString() : d.toLocaleString();
}

export function ActivityLog() {
    const [logs, setLogs] = useState<LogEntry[]>([]);

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
                    <div className="log-col-actor mono">BY</div>
                </div>

                <div className="log-table-body">
                    {logs.map((log, i) => (
                        <div key={log.id || i} className="log-row">
                            <div className="log-col-time mono" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Clock size={14} color="var(--text-tertiary)" />
                                {when(log)}
                            </div>
                            <div className="log-col-activity mono" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Activity size={14} color="var(--accent)" />
                                {log.activity}
                            </div>
                            <div className="log-col-actor mono" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {log.actor && <User size={14} color="var(--text-tertiary)" />}
                                {log.actor || '—'}
                            </div>
                        </div>
                    ))}
                    {logs.length === 0 && (
                        <div style={{ padding: '20px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                            No activity recorded yet.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
