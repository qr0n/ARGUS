import { useState } from 'react';
import { Search, Plus } from 'lucide-react';
import './CaseProfiles.css';

export function CaseProfiles() {
    const [showModal, setShowModal] = useState(false);
    const [showDetails, setShowDetails] = useState(false);

    const [showEdit, setShowEdit] = useState(false);
    const [activeTab, setActiveTab] = useState('All');

    return (
        <div className="case-profiles-page">
            <div className="cp-toolbar">
                <div className="cp-search-container">
                    <Search size={18} className="cp-search-icon" />
                    <input type="text" placeholder="Search by name, location…" className="cp-search-input" />
                </div>

                <div className="filter-tabs">
                    {['All', 'Missing', 'Wanted', 'Resolved'].map(tab => (
                        <button
                            key={tab}
                            className={`tab ${activeTab === tab ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab)}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                <button className="btn btn-primary cp-create-btn" onClick={() => setShowModal(true)}>
                    <Plus size={18} /> Create Case Profile
                </button>
            </div>

            <div className="cp-grid">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="card cp-card">
                        <div className="cp-card-header">
                            <div className="cp-tags">
                                <span className={`badge ${i % 2 === 0 ? 'badge-green' : 'badge-amber'}`}>
                                    {i % 2 === 0 ? 'Resolved' : 'Unresolved'}
                                </span>
                                <span className={`badge ${i % 3 === 0 ? 'badge-amber' : 'badge-red'}`}>
                                    {i % 3 === 0 ? 'Missing' : 'Wanted'}
                                </span>
                            </div>
                        </div>

                        <div className="cp-card-body">
                            <div className="cp-avatar"></div>
                            <div className="cp-info">
                                <h4 className="cp-name">Subject Name #{100 + i}</h4>
                                <div className="cp-details-list">
                                    <span className="cp-detail-item">Age: {20 + i * 2}</span>
                                    <span className="cp-detail-item">Loc: Kingston, JM</span>
                                    <span className="cp-detail-item highlight">Priority: {i % 2 === 0 ? 'Medium' : 'High'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="cp-card-footer">
                            <button className="btn btn-full" onClick={() => setShowDetails(true)}>View Case Details</button>
                        </div>
                    </div>
                ))}
            </div>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="modal-title">Create Case Profile</h3>
                        <div className="modal-form">
                            <input className="input-field" placeholder="Full Name" />
                            <input className="input-field" placeholder="Age" type="number" />

                            <select className="input-field select-field">
                                <option value="missing">Missing Person</option>
                                <option value="wanted">Wanted Person</option>
                            </select>

                            <select className="input-field select-field">
                                <option value="high">High Priority</option>
                                <option value="medium">Medium Priority</option>
                                <option value="low">Low Priority</option>
                            </select>

                            <input className="input-field" placeholder="Last Known Location" />
                            <textarea className="input-field text-area" placeholder="Notes / Description" rows={4}></textarea>

                            <div className="modal-upload">
                                <p>Upload Photo</p>
                                <button className="btn">Browse File</button>
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={() => setShowModal(false)}>Save Profile</button>
                        </div>
                    </div>
                </div>
            )}

            {showDetails && (
                <div className="modal-overlay" onClick={() => setShowDetails(false)}>
                    <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header-flex">
                            <h3 className="modal-title">Case Profile Details</h3>
                            <div className="cp-tags">
                                <span className="badge badge-amber">Unresolved</span>
                                <span className="badge badge-red">Wanted</span>
                            </div>
                        </div>
                        <div className="modal-body-split">
                            <div className="modal-photo"></div>
                            <div className="modal-info-grid">
                                <div className="info-block">
                                    <span className="info-label mono">FULL NAME</span>
                                    <span className="info-val">Subject Name #101</span>
                                </div>
                                <div className="info-block">
                                    <span className="info-label mono">AGE</span>
                                    <span className="info-val">24</span>
                                </div>
                                <div className="info-block">
                                    <span className="info-label mono">PRIORITY</span>
                                    <span className="info-val highlight">High Priority</span>
                                </div>
                                <div className="info-block">
                                    <span className="info-label mono">LAST KNOWN LOCATION</span>
                                    <span className="info-val">Kingston, JM</span>
                                </div>
                            </div>
                        </div>
                        <div className="info-block full-width">
                            <span className="info-label mono">NOTES / DESCRIPTION</span>
                            <p className="info-val text-muted">Subject was last seen heading north. Considered highly dangerous. Proceed with caution.</p>
                        </div>
                        <div className="modal-actions spread">
                            <button className="btn btn-danger">Close Case</button>
                            <div>
                                <button className="btn" style={{ marginRight: '12px' }} onClick={() => setShowDetails(false)}>Dismiss</button>
                                <button className="btn btn-primary" onClick={() => {
                                    setShowDetails(false);
                                    setShowEdit(true);
                                }}>Update Details</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showEdit && (
                <div className="modal-overlay" onClick={() => setShowEdit(false)}>
                    <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="modal-title">Edit Case Profile</h3>
                        <div className="modal-form">
                            <div className="info-block">
                                <span className="info-label mono">FULL NAME</span>
                                <input className="input-field" defaultValue="Subject Name #101" />
                            </div>
                            <div className="info-block">
                                <span className="info-label mono">AGE</span>
                                <input className="input-field" defaultValue="24" type="number" />
                            </div>

                            <div className="info-block">
                                <span className="info-label mono">STATUS</span>
                                <select className="input-field select-field" defaultValue="wanted">
                                    <option value="missing">Missing Person</option>
                                    <option value="wanted">Wanted Person</option>
                                </select>
                            </div>

                            <div className="info-block">
                                <span className="info-label mono">PRIORITY</span>
                                <select className="input-field select-field" defaultValue="high">
                                    <option value="high">High Priority</option>
                                    <option value="medium">Medium Priority</option>
                                    <option value="low">Low Priority</option>
                                </select>
                            </div>

                            <div className="info-block full-width">
                                <span className="info-label mono">LAST KNOWN LOCATION</span>
                                <input className="input-field" defaultValue="Kingston, JM" />
                            </div>
                            <div className="info-block full-width">
                                <span className="info-label mono">NOTES / DESCRIPTION</span>
                                <textarea className="input-field text-area" defaultValue="Subject was last seen heading north. Considered highly dangerous. Proceed with caution." rows={4}></textarea>
                            </div>

                            <div className="modal-upload full-width">
                                <p>Update Photo</p>
                                <button className="btn">Browse File</button>
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button className="btn" onClick={() => {
                                setShowEdit(false);
                                setShowDetails(true);
                            }}>Cancel</button>
                            <button className="btn btn-primary" onClick={() => {
                                setShowEdit(false);
                                setShowDetails(true);
                            }}>Save Changes</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
