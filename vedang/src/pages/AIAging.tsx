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
                        <div className="hiw-icon"><UploadCloud size={20} /></div>
                        <div className="hiw-text">
                            <span className="hiw-num">1</span>
                            <span>Upload Image</span>
                        </div>
                    </div>
                    <ChevronRight className="hiw-arrow" />
                    <div className="hiw-step">
                        <div className="hiw-icon"><FileSearch size={20} /></div>
                        <div className="hiw-text">
                            <span className="hiw-num">2</span>
                            <span>Image Scan</span>
                        </div>
                    </div>
                    <ChevronRight className="hiw-arrow" />
                    <div className="hiw-step">
                        <div className="hiw-icon"><Activity size={20} /></div>
                        <div className="hiw-text">
                            <span className="hiw-num">3</span>
                            <span>AI Aging Process</span>
                        </div>
                    </div>
                    <ChevronRight className="hiw-arrow" />
                    <div className="hiw-step">
                        <div className="hiw-icon"><CheckCircle2 size={20} /></div>
                        <div className="hiw-text">
                            <span className="hiw-num">4</span>
                            <span>Result Matches</span>
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
