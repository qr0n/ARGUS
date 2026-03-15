import { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileSearch, CheckCircle2, ChevronRight, Activity, Search, Loader2 } from 'lucide-react';
import './FindMatches.css';

declare global {
  interface Window {
    faceapi: any;
  }
}

export function FindMatches() {
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [scanComplete, setScanComplete] = useState(false);
    const [matchResults, setMatchResults] = useState<{name: string, conf: number}[]>([]);
    
    const [matcherReady, setMatcherReady] = useState(false);
    const [faceMatcher, setFaceMatcher] = useState<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let isMounted = true;
        const initFaceApi = async () => {
            try {
                const faceapi = window.faceapi;
                if (!faceapi) {
                    if (isMounted) setTimeout(initFaceApi, 500);
                    return;
                }
                await faceapi.nets.ssdMobilenetv1.loadFromUri(`/models`);
                await faceapi.nets.faceLandmark68Net.loadFromUri(`/models`);
                await faceapi.nets.faceRecognitionNet.loadFromUri(`/models`);

                const res = await fetch(`/dataset`);
                const images = await res.json();
                
                const labeledDescriptors: any[] = [];
                for (const filename of images) {
                    const img = await faceapi.fetchImage(`/dataset/${filename}`);
                    const detections = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
                    
                    if (detections) {
                        let label = filename.split('.')[0];
                        label = label.replace(/_[0-9]+$/, '').replace(/[_|-]/g, ' '); 
                        
                        const existing = labeledDescriptors.find((l: any) => l.label.toLowerCase() === label.toLowerCase());
                        if (existing) {
                            existing.descriptors.push(detections.descriptor);
                        } else {
                            labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(label.toUpperCase(), [detections.descriptor]));
                        }
                    }
                }
                
                if (labeledDescriptors.length > 0 && isMounted) {
                    setFaceMatcher(new faceapi.FaceMatcher(labeledDescriptors, 0.5));
                }
                if (isMounted) setMatcherReady(true);
            } catch (e) {
                console.error('AI Loading Error:', e);
                if (isMounted) setMatcherReady(false);
            }
        };
        initFaceApi();
        return () => { isMounted = false; };
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setSelectedImage(event.target?.result as string);
                setScanComplete(false);
                setMatchResults([]);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (isScanning) return;
        
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setSelectedImage(event.target?.result as string);
                setScanComplete(false);
                setMatchResults([]);
            };
            reader.readAsDataURL(file);
        }
    };

    const runScan = async () => {
        if (!selectedImage || isScanning || !matcherReady) return;
        setIsScanning(true);
        setScanComplete(false);
        setMatchResults([]);

        try {
            const faceapi = window.faceapi;
            const img = await faceapi.fetchImage(selectedImage);
            // Detect all faces in the image
            const detections = await faceapi.detectAllFaces(img).withFaceLandmarks().withFaceDescriptors();
            
            setTimeout(() => {
                let currentResults = [];
                let hasKnownMatch = false;

                if (detections && faceMatcher) {
                    for (const detection of detections) {
                        const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
                        const conf = Math.round((1 - bestMatch.distance) * 100);
                        currentResults.push({
                            name: bestMatch.label,
                            conf: Math.min(100, Math.max(0, conf))
                        });

                        if (bestMatch.label !== 'unknown') {
                            hasKnownMatch = true;
                            fetch('/api/logs', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ activity: `Image Scan: Found ${bestMatch.label} (${conf}%)`, type: 'ai-scan', severity: 'warning' })
                            }).catch(e => console.error("Failed to log", e));
                        }
                    }
                }
                
                setMatchResults(currentResults);
                setIsScanning(false);
                setScanComplete(true);

                if (!hasKnownMatch) {
                    const activityMsg = currentResults.length > 0 
                        ? `Image Scan: Detected ${currentResults.length} unknown subject(s).` 
                        : 'Image Scan: No faces or subjects detected.';
                    fetch('/api/logs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ activity: activityMsg, type: 'ai-scan', severity: 'info' })
                    }).catch(e => console.error("Failed to log", e));
                }

            }, 1500);
        } catch (e) {
            console.error('Scan error:', e);
            setIsScanning(false);
            setScanComplete(true);
        }
    };

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
                    
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileChange} 
                        accept="image/*" 
                        style={{ display: 'none' }} 
                    />

                    <div 
                        className={`dropzone ${(selectedImage && !isScanning && matcherReady) ? 'has-image' : ''} ${(isScanning || !matcherReady) ? 'disabled' : ''}`}
                        onClick={() => { if (!isScanning && matcherReady) fileInputRef.current?.click(); }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                    >
                        {selectedImage ? (
                            <div className="preview-container">
                                <img src={selectedImage} alt="Preview" className="image-preview" />
                                {!isScanning && (
                                    <div className="preview-overlay">
                                        <span>Click to change image</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="dropzone-content">
                                <UploadCloud size={48} color="var(--accent)" />
                                <p>Drop image here or click to browse</p>
                                <span className="dropzone-hints">Supports JPG, PNG, WEBP · Max 10MB</span>
                            </div>
                        )}
                    </div>
                    
                    <button 
                        className="btn btn-primary fm-scan-btn" 
                        onClick={runScan} 
                        disabled={!selectedImage || isScanning || !matcherReady}
                    >
                        {isScanning ? (
                            <><Loader2 className="spin" size={18} /> Scanning...</>
                        ) : !matcherReady ? (
                            <><Loader2 className="spin" size={18} /> Loading Models...</>
                        ) : (
                            'Run AI Scan'
                        )}
                    </button>
                </div>

                {/* Right Column - Results */}
                <div className="card results-card">
                    <h4>Detected Matches: <span className="mono match-count">{matchResults.length}</span></h4>
                    
                    {isScanning || (!matcherReady && selectedImage) ? (
                        <div className="empty-results simulation-active">
                            <Loader2 className="spin highlight-icon" size={48} />
                            <p className="mono">{!matcherReady ? 'CONNECTING TO INTEL...' : 'ANALYZING FACIAL STRUCTURE...'}</p>
                        </div>
                    ) : scanComplete && matchResults.length > 0 ? (
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {matchResults.map((match, i) => (
                                <div key={i} style={{ 
                                    padding: '15px', 
                                    background: match.name === 'unknown' ? 'transparent' : 'rgba(240, 168, 50, 0.1)', 
                                    border: match.name === 'unknown' ? '1px solid var(--border)' : '1px solid var(--accent)',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    color: '#fff'
                                }}>
                                    <strong>{match.name === 'unknown' ? 'Unknown Subject' : match.name}</strong>
                                    <span className="mono" style={{ color: match.name === 'unknown' ? 'var(--text-tertiary)' : 'var(--status-amber)' }}>
                                        {match.conf}% CONFIDENCE
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : scanComplete && matchResults.length === 0 ? (
                        <div className="empty-results">
                            <CheckCircle2 size={32} color="var(--status-green)" style={{ marginBottom: 12 }} />
                            <p>No faces found in the image.</p>
                        </div>
                    ) : (
                        <div className="empty-results">
                            <div className="empty-icon"><Search size={32} /></div>
                            <p>Awaiting Image Upload</p>
                            <span>Scan an image to view potential matches from the database.</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
