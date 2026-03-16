import { useState, useEffect, useRef } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import './LiveCamera.css';

declare global {
  interface Window {
    faceapi: any;
  }
}

export function LiveCamera() {
    const [isLive, setIsLive] = useState(false);
    const [feedMode, setFeedMode] = useState<'phone' | 'device'>('phone');
    const [statusText, setStatusText] = useState('OFFLINE');
    const [matches, setMatches] = useState<{name: string, conf: number}[]>([]);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [deviceCamError, setDeviceCamError] = useState<string | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const faceMatcherRef = useRef<any>(null);
    const requestRef = useRef<number>(0);
    // Frame-lock: prevents async detections from stacking up
    const detectingRef = useRef<boolean>(false);
    // Throttle: target ~8 inference frames per second
    const lastDetectTimeRef = useRef<number>(0);
    const DETECT_INTERVAL_MS = 125; // ~8fps inference
    // Debounce matches updates to avoid flooding React re-renders
    const pendingMatchesRef = useRef<{name: string, conf: number}[]>([]);

    // Load FaceAPI Models
    useEffect(() => {
        let isMounted = true;
        const initFaceApi = async () => {
            try {
                const faceapi = window.faceapi;
                if (!faceapi) {
                    if (isMounted) setTimeout(initFaceApi, 500);
                    return;
                }
                
                setStatusText('LOADING AI MODELS...');
                const modelUrl = `/models`;
                const datasetUrl = `/dataset`;

                await faceapi.nets.ssdMobilenetv1.loadFromUri(modelUrl);
                await faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl);
                await faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl);

                if (!isMounted) return;
                setStatusText('BUILDING DATASET...');
                
                const res = await fetch(datasetUrl);
                const images = await res.json();
                
                // Fetch and parse all images in parallel to remove sequential bottleneck
                const descriptorsData = await Promise.all(
                    images.map(async (filename: string) => {
                        try {
                            const img = await faceapi.fetchImage(`${datasetUrl}/${filename}`);
                            const detections = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
                            if (detections) {
                                let label = filename.split('.')[0].replace(/_[0-9]+$/, '').replace(/[_|-]/g, ' ').toUpperCase();
                                return { label, descriptor: detections.descriptor };
                            }
                        } catch (err) {
                            console.error(`Error processing dataset image ${filename}:`, err);
                        }
                        return null;
                    })
                );

                const groupedDescriptors = descriptorsData.filter(d => d !== null).reduce((acc: any, curr: any) => {
                    if (!acc[curr.label]) acc[curr.label] = [];
                    acc[curr.label].push(curr.descriptor);
                    return acc;
                }, {});

                const labeledDescriptors = Object.keys(groupedDescriptors).map(
                    label => new faceapi.LabeledFaceDescriptors(label, groupedDescriptors[label])
                );

                if (labeledDescriptors.length > 0 && isMounted) {
                    // Tighter threshold (0.48 vs 0.55) = more stable, less flip-flopping
                    faceMatcherRef.current = new faceapi.FaceMatcher(labeledDescriptors, 0.48);
                }
                if (isMounted) {
                    setModelsLoaded(true);
                    setStatusText(isLive ? 'WAITING FOR STREAM' : 'OFFLINE');
                }
            } catch (e) {
                console.error('AI Loading Error:', e);
                if (isMounted) setStatusText('AI LOAD ERROR - ACCEPT CERT ON PORT 3000');
            }
        };

        if (window.location.protocol === 'https:' || window.location.hostname === 'localhost') {
           initFaceApi();
        } else {
           setStatusText('HTTPS OR LOCALHOST REQUIRED FOR CAMERA');
        }
        
        return () => { isMounted = false; };
    }, []);

    // WebRTC connection logic — with ICE monitoring and WS auto-reconnect
    // Only active when feedMode === 'phone'
    useEffect(() => {
        let isMounted = true;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let reconnectDelay = 1500;

        if (feedMode !== 'phone' || !isLive) {
            if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
            if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
            if (videoRef.current) {
                const stream = videoRef.current.srcObject as MediaStream;
                if (stream) stream.getTracks().forEach(t => t.stop());
                videoRef.current.srcObject = null;
            }
            setStatusText(modelsLoaded ? 'OFFLINE' : 'LOADING AI MODELS...');
            setMatches([]);
            return;
        }
        const isHttps = window.location.protocol === 'https:';
        const wsProtocol = isHttps ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws-view`;

        // Helper: cleanly tear down the peer connection
        const closePc = () => {
            if (pcRef.current) {
                pcRef.current.ontrack = null;
                pcRef.current.onicecandidate = null;
                pcRef.current.oniceconnectionstatechange = null;
                pcRef.current.close();
                pcRef.current = null;
            }
            if (videoRef.current) videoRef.current.srcObject = null;
            setMatches([]);
        };

        const connect = () => {
            if (!isMounted) return;
            if (isMounted) setStatusText('CONNECTING TO SERVER...');

            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onmessage = async (event) => {
                if (!isMounted) return;
                const msg = JSON.parse(event.data);

                if (msg.type === 'offer') {
                    // Always close any existing PC before handling a fresh offer
                    closePc();

                    const pc = new RTCPeerConnection({
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' },
                        ]
                    });
                    pcRef.current = pc;

                    pc.ontrack = (e) => {
                        if (!isMounted) return;
                        if (videoRef.current && videoRef.current.srcObject !== e.streams[0]) {
                            videoRef.current.srcObject = e.streams[0];
                            videoRef.current.play().catch(console.error);
                        }
                        setStatusText('LIVE VIEW');
                    };

                    pc.onicecandidate = (e) => {
                        if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
                            wsRef.current.send(JSON.stringify({ type: 'ice', candidate: e.candidate }));
                        }
                    };

                    // Monitor ICE connection health and auto-recover
                    pc.oniceconnectionstatechange = () => {
                        if (!isMounted) return;
                        const state = pc.iceConnectionState;
                        console.log('[ARGUS] ICE state:', state);

                        if (state === 'disconnected') {
                            // Short blip — try ICE restart instead of full teardown
                            setStatusText('STREAM UNSTABLE (reconnecting...)');
                            // Trigger ICE restart by sending a new offer from the phone side
                            // The viewer can only signal this via WS — tell the streamer to restart
                            if (wsRef.current?.readyState === WebSocket.OPEN) {
                                wsRef.current.send(JSON.stringify({ type: 'request-restart' }));
                            }
                        } else if (state === 'failed') {
                            // Hard failure — close PC, the next offer from the phone will set up fresh
                            setStatusText('STREAM LOST (awaiting phone...)');
                            closePc();
                        } else if (state === 'closed') {
                            setStatusText('STREAM OFFLINE (Awaiting Phone...)');
                            closePc();
                        } else if (state === 'connected' || state === 'completed') {
                            setStatusText('LIVE VIEW');
                        }
                    };

                    try {
                        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        if (wsRef.current?.readyState === WebSocket.OPEN) {
                            wsRef.current.send(JSON.stringify({ type: 'answer', sdp: pc.localDescription }));
                        }
                    } catch (err) {
                        console.error('[ARGUS] SDP negotiation error:', err);
                        closePc();
                    }

                } else if (msg.type === 'ice' && pcRef.current) {
                    try {
                        if (msg.candidate) await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
                    } catch (err) {
                        // Stale candidate — safe to ignore
                        console.warn('[ARGUS] Stale ICE candidate, ignoring:', err);
                    }
                } else if (msg.type === 'streamer-gone') {
                    setStatusText('STREAM OFFLINE (Awaiting Phone...)');
                    closePc();
                } else if (msg.type === 'streamer-present') {
                    setStatusText('PHONE CONNECTED (Awaiting Video...)');
                }
            };

            ws.onclose = () => {
                if (!isMounted) return;
                wsRef.current = null;
                closePc();
                // Auto-reconnect WebSocket with exponential backoff
                setStatusText(`CONNECTION LOST — retrying in ${Math.round(reconnectDelay / 1000)}s...`);
                reconnectTimer = setTimeout(() => {
                    reconnectDelay = Math.min(reconnectDelay * 2, 15000);
                    connect();
                }, reconnectDelay);
            };

            ws.onerror = () => {
                if (isMounted) setStatusText('WSS ERROR — check cert on port 3000');
                // onclose will fire after onerror, triggering reconnect
            };
        };

        connect();

        return () => {
            isMounted = false;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
            closePc();
        };
    }, [isLive, modelsLoaded, feedMode]);

    // Device camera mode — use laptop/device webcam directly
    useEffect(() => {
        let isMounted = true;
        let stream: MediaStream | null = null;

        if (!isLive || feedMode !== 'device') {
            // Clean up device stream if switching away
            if (videoRef.current) videoRef.current.srcObject = null;
            if (feedMode !== 'device') setDeviceCamError(null);
            return;
        }

        setStatusText('STARTING DEVICE CAMERA...');
        setDeviceCamError(null);

        const startDeviceCam = async () => {
            try {
                if (!navigator.mediaDevices?.getUserMedia) {
                    throw new Error('Camera API not available — needs HTTPS');
                }
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: false
                });
                if (!isMounted) { stream.getTracks().forEach(t => t.stop()); return; }
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play().catch(console.error);
                }
                if (isMounted) setStatusText('LIVE VIEW');
            } catch (err: any) {
                if (!isMounted) return;
                const msg = err?.message || 'Camera access denied';
                setDeviceCamError(msg);
                setStatusText('DEVICE CAM ERROR');
            }
        };
        startDeviceCam();

        return () => {
            isMounted = false;
            if (stream) stream.getTracks().forEach(t => t.stop());
            if (videoRef.current) videoRef.current.srcObject = null;
            setMatches([]);
        };
    }, [isLive, feedMode]);


    // Detection Loop — fixed version
    const detectLoop = () => {
        const now = performance.now();

        // Throttle: only run inference at ~8fps to avoid overloading
        if (now - lastDetectTimeRef.current < DETECT_INTERVAL_MS) {
            requestRef.current = requestAnimationFrame(detectLoop);
            return;
        }

        // Frame-lock: if a detection is already in-flight, skip this frame
        if (detectingRef.current) {
            requestRef.current = requestAnimationFrame(detectLoop);
            return;
        }

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const faceapi = window.faceapi;

        if (!video || !canvas || !faceapi || video.paused || video.ended || !video.srcObject
            || video.videoWidth === 0 || video.videoHeight === 0) {
            requestRef.current = requestAnimationFrame(detectLoop);
            return;
        }

        const displayW = video.clientWidth;
        const displayH = video.clientHeight;
        if (displayW === 0 || displayH === 0) {
            requestRef.current = requestAnimationFrame(detectLoop);
            return;
        }

        lastDetectTimeRef.current = now;
        detectingRef.current = true;

        // Run detection on the intrinsic video resolution (the actual pixels)
        const intrinsicW = video.videoWidth;
        const intrinsicH = video.videoHeight;

        faceapi.detectAllFaces(video)
            .withFaceLandmarks()
            .withFaceDescriptors()
            .then((detections: any[]) => {
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                // Size the canvas to match the displayed video element
                if (canvas.width !== displayW || canvas.height !== displayH) {
                    canvas.width = displayW;
                    canvas.height = displayH;
                }
                ctx.clearRect(0, 0, displayW, displayH);

                // objectFit:cover scaling: compute the actual rendered sub-rect of the video
                // so that bounding boxes line up with the visible portion of the frame.
                const videoAspect = intrinsicW / intrinsicH;
                const displayAspect = displayW / displayH;
                let scaleX: number, scaleY: number, offsetX: number, offsetY: number;

                if (videoAspect > displayAspect) {
                    // Video is wider than display → letterbox on sides
                    scaleY = displayH / intrinsicH;
                    scaleX = scaleY;
                    offsetX = (displayW - intrinsicW * scaleX) / 2;
                    offsetY = 0;
                } else {
                    // Video is taller than display → letterbox on top/bottom
                    scaleX = displayW / intrinsicW;
                    scaleY = scaleX;
                    offsetX = 0;
                    offsetY = (displayH - intrinsicH * scaleY) / 2;
                }

                const activeMatches: {name: string, conf: number}[] = [];

                detections.forEach((detection: any) => {
                    let boxColor = '#555963';
                    let labelText = 'UNKNOWN';

                    if (faceMatcherRef.current) {
                        const bestMatch = faceMatcherRef.current.findBestMatch(detection.descriptor);
                        if (bestMatch.label !== 'unknown') {
                            boxColor = '#f0a832';
                            const cappedConf = Math.min(100, Math.max(0, Math.round((1 - bestMatch.distance) * 100)));
                            labelText = `${bestMatch.label} — ${cappedConf}%`;
                            activeMatches.push({ name: bestMatch.label, conf: cappedConf });
                        }
                    }

                    // Map raw video coords → displayed canvas coords
                    const rawBox = detection.detection.box;
                    const x = rawBox.x * scaleX + offsetX;
                    const y = rawBox.y * scaleY + offsetY;
                    const w = rawBox.width * scaleX;
                    const h = rawBox.height * scaleY;

                    // Box
                    ctx.strokeStyle = boxColor;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, w, h);

                    // Label background
                    ctx.fillStyle = boxColor;
                    ctx.fillRect(x, y - 22, w, 22);

                    // Label text
                    ctx.fillStyle = boxColor === '#f0a832' ? '#000' : '#fff';
                    ctx.font = 'bold 11px "IBM Plex Mono", monospace';
                    ctx.fillText(labelText, x + 4, y - 6);
                });

                // Debounce: only trigger React re-render if matches actually changed
                const prev = pendingMatchesRef.current;
                const changed = activeMatches.length !== prev.length ||
                    activeMatches.some((m, i) => m.name !== prev[i]?.name || m.conf !== prev[i]?.conf);
                if (changed) {
                    pendingMatchesRef.current = activeMatches;
                    setMatches(activeMatches);
                }
            })
            .catch((e: any) => console.error('Face detection loop error:', e))
            .finally(() => {
                detectingRef.current = false;
            });

        requestRef.current = requestAnimationFrame(detectLoop);
    };

    useEffect(() => {
        requestRef.current = requestAnimationFrame(detectLoop);
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };

    }, []);


    return (
        <div className="live-camera-page">
            <div className="lc-top-row">
                <div className="lc-status-box">
                    <span className="lc-label mono">LIVE FEED:</span>
                    <span className={`badge ${(statusText === 'LIVE VIEW' || statusText.includes('PHONE CONNECTED')) ? 'badge-green' : (statusText.includes('ERROR') || statusText.includes('LOST') ? 'badge-red' : 'badge-amber')} mono`}>
                        {statusText}
                    </span>
                </div>
                <div className="lc-matches-box mono">
                    MATCHES FOUND: <span className="highlight">{matches.length}</span>
                </div>
            </div>

            <div className="lc-viewport-container">
                <div className="lc-viewport" style={{ position: 'relative', background: '#000', overflow: 'hidden' }}>
                    <div className="brackets top-left"></div>
                    <div className="brackets top-right"></div>
                    <div className="brackets bottom-left"></div>
                    <div className="brackets bottom-right"></div>

                    {statusText === 'LIVE VIEW' && (
                        <div className="rec-indicator mono" style={{ zIndex: 10 }}>
                            <span className="rec-dot"></span> REC
                        </div>
                    )}
                    
                    {isLive ? (
                        <>
                            <video 
                                ref={videoRef} 
                                id="video" 
                                autoPlay 
                                playsInline 
                                muted 
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            ></video>
                            <canvas 
                                ref={canvasRef} 
                                id="overlay" 
                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 5, pointerEvents: 'none' }}
                            ></canvas>
                        </>
                    ) : (
                        <div className="lc-offline-view">
                            <Camera size={48} color="var(--text-tertiary)" />
                            <p>Camera Feed Offline — Click Start Camera Feed to start matching</p>
                        </div>
                    )}
                </div>

                <div className="lc-controls card">
                    <div className="lc-feed-toggle">
                        <button
                            className={`btn btn-lg ${isLive ? 'btn-danger' : 'btn-primary'}`}
                            onClick={() => setIsLive(!isLive)}
                            disabled={!modelsLoaded}
                        >
                            <RefreshCw size={18} className={isLive ? 'spin' : ''} style={{ marginRight: '8px' }} />
                            {isLive ? 'Stop Camera Feed' : (!modelsLoaded ? 'Loading Models...' : 'Start Camera Feed')}
                        </button>
                    </div>
                    <div className="lc-input-selector">
                        <span className="input-label mono">FEED INPUT:</span>
                        <div className="input-chips">
                            <button
                                className={`chip ${feedMode === 'phone' ? 'active' : ''}`}
                                onClick={() => { setFeedMode('phone'); if (isLive) setStatusText('CONNECTING TO SERVER...'); }}
                            >
                                External Phone
                            </button>
                            <button
                                className={`chip ${feedMode === 'device' ? 'active' : ''}`}
                                onClick={() => setFeedMode('device')}
                                title="Use this device's webcam as the camera feed"
                            >
                                This Device
                            </button>
                        </div>
                        {feedMode === 'device' && deviceCamError && (
                            <p style={{ color: 'var(--error)', fontSize: '12px', margin: '6px 0 0', fontFamily: 'monospace' }}>
                                ⚠ {deviceCamError}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <div className="card lc-results-card">
                <div className="card-header">
                    <h4>Detected Matches: {matches.length}</h4>
                    {isLive && <span className="badge badge-amber">Scanning...</span>}
                </div>
                {!isLive ? (
                    <div className="empty-state">
                        System offline. Awaiting video feed to begin match detection against known profiles.
                    </div>
                ) : matches.length === 0 ? (
                    <div className="empty-state">
                        {statusText === 'LIVE VIEW' ? 'No known matches currently detected in frame.' : 'Awaiting video feed...'}
                    </div>
                ) : (
                    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {matches.map((m, i) => (
                            <div key={i} style={{ 
                                padding: '15px', 
                                background: 'rgba(240, 168, 50, 0.1)', 
                                border: '1px solid var(--accent)',
                                borderRadius: '8px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                color: '#fff'
                            }}>
                                <strong>{m.name}</strong>
                                <span className="mono" style={{ color: 'var(--accent)' }}>{m.conf}% CONFIDENCE</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
