import { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileSearch, CheckCircle2, ChevronRight, Activity, Search, Loader2 } from 'lucide-react';
import './FindMatches.css';
import { RECOGNITION_CONFIG, clampConfidence, getArgusAuthHeaders, isUsableDetection } from '../recognitionConfig';

declare global {
  interface Window {
    faceapi: any;
  }
}

export function FindMatches() {
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [scanComplete, setScanComplete] = useState(false);
    const [matchResults, setMatchResults] = useState<{name: string, conf: number, kind: 'known' | 'review' | 'unknown'}[]>([]);
    const [overlayData, setOverlayData] = useState<{ detections: any[]; results: {name: string, conf: number, kind: 'known' | 'review' | 'unknown'}[] } | null>(null);
    
    const [matcherReady, setMatcherReady] = useState(false);
    const [faceMatcher, setFaceMatcher] = useState<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const previewImageRef = useRef<HTMLImageElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

    const clearOverlay = () => {
        const canvas = overlayCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const width = canvas.clientWidth || canvas.width;
        const height = canvas.clientHeight || canvas.height;
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const drawOverlay = (detections: any[], results: {name: string, conf: number, kind: 'known' | 'review' | 'unknown'}[]) => {
        const img = previewImageRef.current;
        const canvas = overlayCanvasRef.current;
        if (!img || !canvas || !img.naturalWidth || !img.naturalHeight) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dW = img.clientWidth;
        const dH = img.clientHeight;
        if (!dW || !dH) return;
        if (canvas.width !== dW || canvas.height !== dH) {
            canvas.width = dW;
            canvas.height = dH;
        }
        ctx.clearRect(0, 0, dW, dH);

        const iW = img.naturalWidth, iH = img.naturalHeight;
        const vA = iW / iH, dA = dW / dH;
        let sX: number, sY: number, oX: number, oY: number;
        if (vA > dA) { sY = dH / iH; sX = sY; oX = (dW - iW * sX) / 2; oY = 0; }
        else         { sX = dW / iW; sY = sX; oX = 0; oY = (dH - iH * sY) / 2; }

        detections.forEach((det, idx) => {
            const match = results[idx];
            const isKnown = !!match && match.kind === 'known';
            const color = isKnown ? '#f0a832' : '#555963';
            const label = !match || match.kind === 'unknown'
                ? 'UNKNOWN'
                : match.kind === 'review'
                    ? `REVIEW — ${match.name} (${match.conf}%)`
                    : `${match.name} — ${match.conf}%`;

            const rb = det.detection.box;
            const x = rb.x * sX + oX, y = rb.y * sY + oY, w = rb.width * sX, h = rb.height * sY;
            const labelHeight = 22;
            const labelY = Math.max(0, y - labelHeight);

            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = color;
            ctx.fillRect(x, labelY, w, labelHeight);
            ctx.fillStyle = isKnown ? '#000' : '#fff';
            ctx.font = 'bold 11px "IBM Plex Mono", monospace';
            ctx.fillText(label, x + 4, labelY + 15);
        });
    };

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
                    setFaceMatcher(new faceapi.FaceMatcher(labeledDescriptors, RECOGNITION_CONFIG.reviewDistance));
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
                setOverlayData(null);
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
                setOverlayData(null);
            };
            reader.readAsDataURL(file);
        }
    };

    useEffect(() => {
        if (!overlayData) {
            clearOverlay();
            return;
        }
        drawOverlay(overlayData.detections, overlayData.results);
    }, [overlayData, selectedImage]);

    const runScan = async () => {
        if (!selectedImage || isScanning || !matcherReady) return;
        setIsScanning(true);
        setScanComplete(false);
        setMatchResults([]);
        setOverlayData(null);

        try {
            const faceapi = window.faceapi;
            const img = await faceapi.fetchImage(selectedImage);
            // Detect all faces in the image
            const detections = await faceapi.detectAllFaces(img).withFaceLandmarks().withFaceDescriptors();
            
            setTimeout(() => {
                const currentResults: {name: string, conf: number, kind: 'known' | 'review' | 'unknown'}[] = [];
                let hasKnownMatch = false;

                if (detections && faceMatcher) {
                    for (const detection of detections) {
                        if (!isUsableDetection(detection)) {
                            currentResults.push({ name: 'unknown', conf: 0, kind: 'unknown' });
                            continue;
                        }
                        const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
                        const conf = clampConfidence(bestMatch.distance);
                        const isKnown = bestMatch.label !== 'unknown' && bestMatch.distance <= RECOGNITION_CONFIG.acceptDistance;
                        const isReview = bestMatch.label !== 'unknown' && !isKnown;
                        currentResults.push({
                            name: isKnown || isReview ? bestMatch.label : 'unknown',
                            conf: isKnown || isReview ? conf : 0,
                            kind: isKnown ? 'known' : isReview ? 'review' : 'unknown'
                        });

                        if (isKnown) {
                            hasKnownMatch = true;
                            fetch('/api/logs', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', ...getArgusAuthHeaders() },
                                body: JSON.stringify({
                                    activity: `Image Scan: Found ${bestMatch.label} (${conf}%)`,
                                    type: 'ai-scan',
                                    severity: 'warning',
                                    modelVersion: RECOGNITION_CONFIG.modelVersion,
                                    thresholdPolicy: { accept: RECOGNITION_CONFIG.acceptDistance, review: RECOGNITION_CONFIG.reviewDistance },
                                    matchedLabel: bestMatch.label,
                                    matchDistance: bestMatch.distance,
                                    matchConfidence: conf,
                                    reviewRequired: false
                                })
                            }).catch(e => console.error("Failed to log", e));
                        } else if (isReview) {
                            fetch('/api/logs', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', ...getArgusAuthHeaders() },
                                body: JSON.stringify({
                                    activity: `Image Scan: Review Required for ${bestMatch.label} (${conf}%)`,
                                    type: 'ai-scan',
                                    severity: 'info',
                                    modelVersion: RECOGNITION_CONFIG.modelVersion,
                                    thresholdPolicy: { accept: RECOGNITION_CONFIG.acceptDistance, review: RECOGNITION_CONFIG.reviewDistance },
                                    matchedLabel: bestMatch.label,
                                    matchDistance: bestMatch.distance,
                                    matchConfidence: conf,
                                    reviewRequired: true
                                })
                            }).catch(e => console.error("Failed to log", e));
                        }
                    }
                }
                
                setMatchResults(currentResults);
                setOverlayData({ detections, results: currentResults });
                setIsScanning(false);
                setScanComplete(true);

                if (!hasKnownMatch) {
                    const activityMsg = currentResults.length > 0 
                        ? `Image Scan: Detected ${currentResults.length} unknown subject(s).` 
                        : 'Image Scan: No faces or subjects detected.';
                    fetch('/api/logs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...getArgusAuthHeaders() },
                        body: JSON.stringify({
                            activity: activityMsg,
                            type: 'ai-scan',
                            severity: 'info',
                            modelVersion: RECOGNITION_CONFIG.modelVersion,
                            thresholdPolicy: { accept: RECOGNITION_CONFIG.acceptDistance, review: RECOGNITION_CONFIG.reviewDistance },
                            reviewRequired: false
                        })
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
                                    <img
                                        ref={previewImageRef}
                                        src={selectedImage}
                                        alt="Preview"
                                        className="image-preview"
                                        onLoad={() => {
                                            if (overlayData) drawOverlay(overlayData.detections, overlayData.results);
                                        }}
                                    />
                                    <canvas ref={overlayCanvasRef} className="match-overlay-canvas" />
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
                                    background: match.kind === 'known' ? 'rgba(240, 168, 50, 0.1)' : 'transparent', 
                                    border: match.kind === 'known' ? '1px solid var(--accent)' : '1px solid var(--border)',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    color: '#fff'
                                }}>
                                    <strong>{match.kind === 'unknown' ? 'Unknown Subject' : match.kind === 'review' ? `Review Required: ${match.name}` : match.name}</strong>
                                    <span className="mono" style={{ color: match.kind === 'known' ? 'var(--status-amber)' : 'var(--text-tertiary)' }}>
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
