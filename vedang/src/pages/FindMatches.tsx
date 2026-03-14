import { UploadCloud, FileSearch, CheckCircle2, ChevronRight, Activity, Search } from 'lucide-react';
import './FindMatches.css';

export function FindMatches() {
    return (
        <div className="find-matches-page">
            {/* How it Works Banner */}
            <div className="how-it-works card">
                <h4>How It Works</h4>
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
                            <span>Compare AI Data</span>
                        </div>
                    </div>
                    <ChevronRight className="hiw-arrow" />
                    <div className="hiw-step">
                        <div className="hiw-icon"><CheckCircle2 size={20} /></div>
                        <div className="hiw-text">
                            <span className="hiw-num">4</span>
                            <span>Review Matches</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="fm-grid">
                {/* Left Column - Upload */}
                <div className="card upload-card">
                    <h4>Upload Image</h4>
                    <div className="dropzone">
                        <div className="dropzone-content">
                            <UploadCloud size={48} color="var(--accent)" />
                            <p>Drop image here or click to browse</p>
                            <span className="dropzone-hints">Supports JPG, PNG, WEBP · Max 10MB</span>
                        </div>
                    </div>
                    <button className="btn btn-primary fm-scan-btn">Run AI Scan</button>
                </div>

                {/* Right Column - Results */}
                <div className="card results-card">
                    <h4>Detected Matches: <span className="mono match-count">0</span></h4>
                    <div className="empty-results">
                        <div className="empty-icon"><Search size={32} /></div>
                        <p>Awaiting Image Upload</p>
                        <span>Scan an image to view potential matches from the database.</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
