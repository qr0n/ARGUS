import './OnboardingOverlay.css';
import { ShieldCheck, Camera, Search, Activity, Clock } from 'lucide-react';

export function OnboardingOverlay({ onDismiss }: { onDismiss: () => void }) {
    return (
        <div className="onboarding-overlay">
            <div className="onboarding-modal">
                <div className="onboarding-header">
                    <ShieldCheck className="onboarding-logo-icon" size={48} />
                    <h2>Welcome to ARGUS</h2>
                    <p>Autonomous Recognition & Geo-Unified Surveillance System</p>
                </div>

                <div className="timeline-container">
                    <div className="timeline-step">
                        <div className="step-node"><Camera size={16} /></div>
                        <div className="step-content">
                            <h4>1. Live Camera Detection</h4>
                            <p>Navigate to the Live Camera tab. Ensure your mobile device is connected. The phone acts as input and laptop displays the output feed.</p>
                        </div>
                    </div>
                    <div className="timeline-step">
                        <div className="step-node"><Search size={16} /></div>
                        <div className="step-content">
                            <h4>2. Find Matches</h4>
                            <p>Upload an image of a missing or wanted suspect. The system will compare against the database and return similarity matches with confidence scores.</p>
                        </div>
                    </div>
                    <div className="timeline-step">
                        <div className="step-node"><Activity size={16} /></div>
                        <div className="step-content">
                            <h4>3. Activity Log</h4>
                            <p>View all Match Detected reports with timestamps, names, sources, and confidence levels.</p>
                        </div>
                    </div>
                    <div className="timeline-step">
                        <div className="step-node"><Clock size={16} /></div>
                        <div className="step-content">
                            <h4>4. AI Aging Detection</h4>
                            <p>Upload a photo and simulate aging or de-aging across 2, 5, or 10 year intervals.</p>
                        </div>
                    </div>
                </div>

                <button className="btn btn-primary enter-btn" onClick={onDismiss}>
                    ENTER ARGUS
                </button>
            </div>
        </div>
    );
}
