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
    const [statusText, setStatusText] = useState('OFFLINE');
    const [matches, setMatches] = useState<{name: string, conf: number}[]>([]);
    const [modelsLoaded, setModelsLoaded] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const faceMatcherRef = useRef<any>(null);
    const requestRef = useRef<number>(0);

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
                const backendHost = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? '' : `https://${window.location.host}`);
                const modelUrl = `${backendHost}/models`;
                const datasetUrl = `${backendHost}/dataset`;

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
                    faceMatcherRef.current = new faceapi.FaceMatcher(labeledDescriptors, 0.5);
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

    // WebRTC connection logic
    useEffect(() => {
        let isMounted = true;
        if (!isLive) {
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

        setStatusText('CONNECTING TO SERVER...');
        const configuredApiUrl = import.meta.env.VITE_API_URL;
        let wsUrl = '';
        if (configuredApiUrl) {
            wsUrl = configuredApiUrl.replace(/^http/, 'ws') + '/ws-view';
        } else {
            const isHttps = window.location.protocol === 'https:';
            const wsProtocol = isHttps ? 'wss:' : 'ws:';
            const configuredApiUrl = import.meta.env.VITE_API_URL;
            let host;
            if (configuredApiUrl) {
                host = new URL(configuredApiUrl).host;
            } else {
                host = window.location.hostname === 'localhost' ? 'localhost:3000' : window.location.host;
            }
            wsUrl = `${wsProtocol}//${host}/ws-view`;
        }
        
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = async (event) => {
            const msg = JSON.parse(event.data);
            
            if (msg.type === 'offer') {
                const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
                pcRef.current = pc;
                
                pc.ontrack = (e) => {
                    if (videoRef.current) {
                        if (videoRef.current.srcObject !== e.streams[0]) {
                            videoRef.current.srcObject = e.streams[0];
                            videoRef.current.play().catch(console.error);
                        }
                    }
                    if (isMounted) setStatusText('LIVE VIEW');
                };

                pc.onicecandidate = (e) => {
                    if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({ type: 'ice', candidate: e.candidate }));
                    }
                };
                
                await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'answer', sdp: pc.localDescription }));
                }

            } else if (msg.type === 'ice' && pcRef.current) {
                if (msg.candidate) await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
            } else if (msg.type === 'streamer-gone') {
                setStatusText('STREAM OFFLINE (Awaiting Phone...)');
                if (videoRef.current) videoRef.current.srcObject = null;
                if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
                setMatches([]);
            } else if (msg.type === 'streamer-present') {
                 setStatusText('PHONE CONNECTED (Awaiting Video...)');
            }
        };

        ws.onclose = () => {
            if (isLive) setStatusText('CONNECTION LOST');
        };

        ws.onerror = () => {
             if (isLive) setStatusText('WSS ERROR (Accept Cert on Port 3000)');
        }

        return () => {
            isMounted = false;
            if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
            if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
        };
    }, [isLive, modelsLoaded]);


    // Detection Loop
    const detectLoop = async () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const faceapi = window.faceapi;

        if (!video || !canvas || !faceapi || video.paused || video.ended || !video.srcObject) {
            requestRef.current = requestAnimationFrame(detectLoop);
            return;
        }

        const displaySize = { width: video.clientWidth, height: video.clientHeight };
        if (displaySize.width === 0 || displaySize.height === 0) {
            requestRef.current = requestAnimationFrame(detectLoop);
            return;
        }

        faceapi.matchDimensions(canvas, displaySize);

        try {
            const detections = await faceapi.detectAllFaces(video).withFaceLandmarks().withFaceDescriptors();
            const resizedDetections = faceapi.resizeResults(detections, displaySize);
            const ctx = canvas.getContext('2d');
            
            if (ctx) {
                // Keep drawing within boundaries without scaling errors
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                let activeMatches: {name: string, conf: number}[] = [];

                resizedDetections.forEach((detection: any) => {
                    let boxColor = '#555963'; // Grey for unknown
                    let labelText = 'UNKNOWN';
                    let conf = 0;

                    if (faceMatcherRef.current) {
                        const bestMatch = faceMatcherRef.current.findBestMatch(detection.descriptor);
                        if (bestMatch.label !== 'unknown') {
                            boxColor = '#f0a832'; // Amber for known
                            conf = Math.round((1 - bestMatch.distance) * 100);
                            const cappedConf = Math.min(100, Math.max(0, conf));
                            labelText = `${bestMatch.label} - ${cappedConf}% CONFIDENT`;
                            activeMatches.push({ name: bestMatch.label, conf: cappedConf });
                        }
                    }

                    const box = detection.detection.box;
                    ctx.strokeStyle = boxColor;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(box.x, box.y, box.width, box.height);

                    ctx.fillStyle = boxColor;
                    
        ctx.fillRect(box.x, box.y - 20, box.width, 20);

                    ctx.fillStyle = boxColor === '#f0a832' ? '#000' : '#fff';
                    ctx.font = 'bold 12px "IBM Plex Mono", monospace';
                    ctx.fillText(labelText, box.x + 4, box.y - 6);
                });
                
                setMatches(activeMatches);
            }
        } catch(e) { console.error("Face detection loop error:", e); }

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
                            <button className="chip active">External Phone Server</button>
                            <button className="chip" style={{ opacity: 0.5, cursor: 'not-allowed' }}>This Device (Disabled)</button>
                        </div>
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
