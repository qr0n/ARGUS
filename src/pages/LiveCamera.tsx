import { useState } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import './LiveCamera.css';

export function LiveCamera() {
    const [isLive, setIsLive] = useState(false);

    return (
        <div className="live-camera-page">
            <div className="lc-top-row">
                <div className="lc-status-box">
                    <span className="lc-label mono">LIVE FEED</span>
                    <span className={`badge ${isLive ? 'badge-green' : 'badge-red'} mono`}>
                        {isLive ? 'ONLINE' : 'OFFLINE'}
                    </span>
                </div>
                <div className="lc-matches-box mono">
                    MATCHES FOUND: <span className="highlight">0</span>
                </div>
            </div>

            <div className="lc-viewport-container">
                <div className="lc-viewport">
                    <div className="brackets top-left"></div>
                    <div className="brackets top-right"></div>
                    <div className="brackets bottom-left"></div>
                    <div className="brackets bottom-right"></div>

                    {isLive ? (
                        <div className="lc-live-view">
                            <div className="rec-indicator mono">
                                <span className="rec-dot"></span> REC
                            </div>
                            {/* Dummy video output - styling handles the placeholder */}
                            <div className="dummy-video-feed">Scanning external source...</div>
                        </div>
                    ) : (
                        <div className="lc-offline-view">
                            <Camera size={48} color="var(--text-tertiary)" />
                            <p>Camera Feed Offline — Click Start Camera Feed to Detect Matches</p>
                        </div>
                    )}
                </div>

                <div className="lc-controls card">
                    <div className="lc-feed-toggle">
                        <button
                            className={`btn btn-lg ${isLive ? 'btn-danger' : 'btn-primary'}`}
                            onClick={() => setIsLive(!isLive)}
                        >
                            <RefreshCw size={18} className={isLive ? 'spin' : ''} />
                            {isLive ? 'Stop Camera Feed' : 'Start Camera Feed'}
                        </button>
                    </div>
                    <div className="lc-input-selector">
                        <span className="input-label mono">FEED INPUT:</span>
                        <div className="input-chips">
                            <button className="chip active">This Device</button>
                            <button className="chip">External Device: None</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card lc-results-card">
                <div className="card-header">
                    <h4>Detected Matches: 0</h4>
                    {isLive && <span className="badge badge-amber">Scanning...</span>}
                </div>
                {!isLive && (
                    <div className="empty-state">
                        System offline. Awaiting video feed to begin match detection against known profiles.
                    </div>
                )}
            </div>
        </div>
    );
}
