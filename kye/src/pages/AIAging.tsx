import { UploadCloud, FileSearch, Activity, CheckCircle2, ChevronRight, UserCircle } from 'lucide-react';
import './AIAging.css';

export function AIAging() {
    return (
        <div className="ai-aging-page">
            {/* How it Works Banner */}
            <div className="how-it-works card">
                <h4>AI Aging Process</h4>
                <div className="steps-row">
                    <div className="hiw-step">
                        <span className="hiw-num">1</span>
                        <div className="hiw-text">
                            <span className="hiw-title"><UploadCloud size={24} /> UPLOAD</span>
                            <span className="hiw-desc">Drop image or browse and select subject photo</span>
                        </div>
                    </div>
                    <ChevronRight className="hiw-arrow" />
                    <div className="hiw-step">
                        <span className="hiw-num">2</span>
                        <div className="hiw-text">
                            <span className="hiw-title"><FileSearch size={24} /> IMAGE SCAN</span>
                            <span className="hiw-desc">AI locates and extracts the subject's facial features</span>
                        </div>
                    </div>
                    <ChevronRight className="hiw-arrow" />
                    <div className="hiw-step">
                        <span className="hiw-num">3</span>
                        <div className="hiw-text">
                            <span className="hiw-title"><Activity size={24} /> AGING MODEL</span>
                            <span className="hiw-desc">AI applies aging or de-aging simulation based on selected interval</span>
                        </div>
                    </div>
                    <ChevronRight className="hiw-arrow" />
                    <div className="hiw-step">
                        <span className="hiw-num">4</span>
                        <div className="hiw-text">
                            <span className="hiw-title"><CheckCircle2 size={24} /> RESULT MATCHES</span>
                            <span className="hiw-desc">Aged prediction returned and matched against database records</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="aging-grid">
                {/* Left Column - Upload */}
                <div className="card upload-card">
                    <h4>Upload Subject Photo</h4>
                    <div className="aging-settings">
                        <label className="settings-label mono">SIMULATION INTERVAL</label>
                        <select className="input-field select-field">
                            <option value="+2">+2 Years (Future)</option>
                            <option value="+5">+5 Years (Future)</option>
                            <option value="+10">+10 Years (Future)</option>
                            <option value="-2">-2 Years (Past)</option>
                            <option value="-5">-5 Years (Past)</option>
                            <option value="-10">-10 Years (Past)</option>
                        </select>
                    </div>

                    <div className="dropzone">
                        <div className="dropzone-content">
                            <UploadCloud size={48} color="var(--accent)" />
                            <p>Drop image here or click to browse</p>
                            <span className="dropzone-hints">Supports JPG, PNG, WEBP · Max 10MB</span>
                        </div>
                    </div>
                    <button className="btn btn-primary fm-scan-btn">Simulate Aging</button>
                </div>

                {/* Right Column - Results */}
                <div className="card results-card">
                    <h4>Closest Match</h4>
                    <div className="empty-results">
                        <div className="empty-icon"><UserCircle size={32} /></div>
                        <p>Awaiting Simulation</p>
                        <span>Upload an image and run the aging simulation to view predictions and database matches.</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
