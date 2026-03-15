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
                        <span className="hiw-num">1</span>
                        <div className="hiw-text">
                            <span className="hiw-title"><UploadCloud size={24} /> UPLOAD</span>
                            <span className="hiw-desc">Drop image or browse and select image</span>
                        </div>
                    </div>
                    <ChevronRight className="hiw-arrow" />
                    <div className="hiw-step">
                        <span className="hiw-num">2</span>
                        <div className="hiw-text">
                            <span className="hiw-title"><FileSearch size={24} /> IMAGE SCAN</span>
                            <span className="hiw-desc">AI locates and extracts faces from the image</span>
                        </div>
                    </div>
                    <ChevronRight className="hiw-arrow" />
                    <div className="hiw-step">
                        <span className="hiw-num">3</span>
                        <div className="hiw-text">
                            <span className="hiw-title"><Activity size={24} /> COMPARE</span>
                            <span className="hiw-desc">AI compares the detected face against existing faces to assess similarity</span>
                        </div>
                    </div>
                    <ChevronRight className="hiw-arrow" />
                    <div className="hiw-step">
                        <span className="hiw-num">4</span>
                        <div className="hiw-text">
                            <span className="hiw-title"><CheckCircle2 size={28} /> REVIEW MATCHES</span>
                            <span className="hiw-desc">Top matches returned for human verification</span>
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
