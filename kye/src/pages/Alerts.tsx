import './Alerts.css';
import { Check, X } from 'lucide-react';

export function Alerts() {
    return (
        <div className="alerts-page">
            <div className="alerts-toolbar">
                <div className="alerts-count mono">14 ALERTS UNREVIEWED</div>
                <div className="filter-tabs">
                    <button className="tab active">Unreviewed</button>
                    <button className="tab">Verified</button>
                    <button className="tab">Dismissed</button>
                </div>
            </div>

            <div className="alerts-listview">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="card alert-full-card">
                        <span className="badge badge-red status-badge">UNREVIEWED</span>

                        <div className="alert-top-row">
                            <div className="alert-full-avatar">
                                <span className="online-dot"></span>
                            </div>

                            <div className="alert-full-info">
                                <div className="afi-header">
                                    <h3 className="afi-name">Unknown Subject #{8000 + i}</h3>
                                    <div className="afi-tags">
                                        <span className="badge badge-amber">Missing</span>
                                        <span className="badge badge-red">High Priority</span>
                                    </div>
                                </div>
                                <div className="afi-meta mono">
                                    <span className="afi-time">MAR 12, 5:54 PM</span>
                                    <span className="afi-divider">|</span>
                                    <span className="afi-source">AT: IMAGE-UPLOAD</span>
                                </div>
                            </div>
                        </div>

                        <div className="alert-full-confidence">
                            <span className="badge badge-blue mono">78% CONFIDENT</span>
                            <div className="progress-bar-container">
                                <div className="progress-bar-fill" style={{ width: '78%' }}></div>
                            </div>
                        </div>

                        <div className="alert-full-actions">
                            <div className="action-btns">
                                <button className="btn btn-action-verify">
                                    <Check size={16} /> Verify Identified Match
                                </button>
                                <button className="btn btn-danger">
                                    <X size={16} /> Dismiss
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
