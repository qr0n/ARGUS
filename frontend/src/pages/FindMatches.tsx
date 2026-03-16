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

                // Parallel image loading — same pattern as LiveCamera for speed
                const descriptorsData = await Promise.all(
                    images.map(async (filename: string) => {
                        try {
                            const img = await faceapi.fetchImage(`/dataset/${filename}`);
                            const det = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
                            if (det) {
                                let label = filename.split('.')[0].replace(/_[0-9]+$/, '').replace(/[_|-]/g, ' ');
                                return { label, descriptor: det.descriptor };
                            }
                        } catch { /* skip bad image */ }
                        return null;
                    })
                );

                // Group descriptors by label
                const grouped: Record<string, any[]> = {};
                for (const d of descriptorsData) {
                    if (!d) continue;
                    const key = d.label.toUpperCase();
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key].push(d.descriptor);
                }
                const labeledDescriptors = Object.entries(grouped).map(
                    ([label, descs]) => new faceapi.LabeledFaceDescriptors(label, descs)
                );
                
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
