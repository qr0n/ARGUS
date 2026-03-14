import './ActivityLog.css';

export function ActivityLog() {
    const dummyLogs = Array.from({ length: 20 }).map((_, i) => {
        const time = `05:${20 - i < 10 ? '0' : ''}${20 - i}:03 PM`;
        const conf = 85 - (i % 3) * 5;
        return {
            time,
            activity: `Match Detected — John Smith AT Image Upload (${conf}%)`
        };
    });

    return (
        <div className="activity-log-page">
            <div className="card log-card">
                <div className="log-header">
                    <div className="log-col-time mono">TIME</div>
                    <div className="log-col-activity mono">LOGGED ACTIVITY</div>
                </div>

                <div className="log-table-body">
                    {dummyLogs.map((log, i) => (
                        <div key={i} className="log-row">
                            <div className="log-col-time mono">{log.time}</div>
                            <div className="log-col-activity mono">{log.activity}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
