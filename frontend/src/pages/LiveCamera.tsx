import { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, RefreshCw, Plus, Minus } from 'lucide-react';
import './LiveCamera.css';

declare global {
  interface Window { faceapi: any; }
}

const DETECT_INTERVAL_MS = 125;       // ~8fps inference
const ALERT_COOLDOWN_MS  = 30_000;    // 30s idempotency window per camera per person
const MAX_CAMERAS        = 6;

// ─── PhoneFeed ────────────────────────────────────────────────────────────────
// Self-contained component: manages its own WS, WebRTC, and detection loop.
// Receives the shared faceMatcher and alertCooldown refs from the parent.

interface MatchResult { name: string; conf: number; }

interface PhoneFeedProps {
    slot: number;
    isLive: boolean;
    faceMatcherRef: { current: any };
    alertCooldownRef: { current: Map<string, number> };
    onMatchesChange: (slot: number, matches: MatchResult[]) => void;
}

function PhoneFeed({ slot, isLive, faceMatcherRef, alertCooldownRef, onMatchesChange }: PhoneFeedProps) {
    const [status, setStatus] = useState('OFFLINE');
    const [matches, setMatches] = useState<MatchResult[]>([]);

    const videoRef    = useRef<HTMLVideoElement>(null);
    const canvasRef   = useRef<HTMLCanvasElement>(null);
    const wsRef       = useRef<WebSocket | null>(null);
    const pcRef       = useRef<RTCPeerConnection | null>(null);
    const requestRef  = useRef<number>(0);
    const detectingRef = useRef(false);
    const lastDetectRef = useRef(0);
    const pendingRef  = useRef<MatchResult[]>([]);

    // Slot 1 keeps the legacy /ws-view path for backward compat
    const wsPath      = slot === 1 ? '/ws-view' : `/ws-view-${slot}`;
    const cameraLabel = `Camera ${slot}`;

    const setMatchesAndNotify = useCallback((m: MatchResult[]) => {
        setMatches(m);
        onMatchesChange(slot, m);
    }, [slot, onMatchesChange]);

    // ── WS + WebRTC ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isLive) {
            wsRef.current?.close();
            wsRef.current = null;
            if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
            if (videoRef.current) videoRef.current.srcObject = null;
            setStatus('OFFLINE');
            setMatchesAndNotify([]);
            return;
        }

        const isHttps = window.location.protocol === 'https:';
        const wsUrl   = `${isHttps ? 'wss:' : 'ws:'}//${window.location.host}${wsPath}`;
        let reconnectDelay = 1500;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let isMounted = true;

        const closePc = () => {
            if (pcRef.current) {
                pcRef.current.ontrack = null;
                pcRef.current.onicecandidate = null;
                pcRef.current.oniceconnectionstatechange = null;
                pcRef.current.close();
                pcRef.current = null;
            }
            if (videoRef.current) videoRef.current.srcObject = null;
            setMatchesAndNotify([]);
        };

        const connect = () => {
            if (!isMounted) return;
            setStatus('CONNECTING...');
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onmessage = async (event) => {
                if (!isMounted) return;
                const msg = JSON.parse(event.data);

                if (msg.type === 'offer') {
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
                        setStatus('LIVE VIEW');
                    };

                    pc.onicecandidate = (e) => {
                        if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN)
                            wsRef.current.send(JSON.stringify({ type: 'ice', candidate: e.candidate }));
                    };

                    pc.oniceconnectionstatechange = () => {
                        if (!isMounted) return;
                        const s = pc.iceConnectionState;
                        if (s === 'disconnected') {
                            setStatus('UNSTABLE...');
                            wsRef.current?.send(JSON.stringify({ type: 'request-restart' }));
                        } else if (s === 'failed') { setStatus('STREAM LOST'); closePc(); }
                        else if (s === 'closed')   { setStatus('OFFLINE');     closePc(); }
                        else if (s === 'connected' || s === 'completed') setStatus('LIVE VIEW');
                    };

                    try {
                        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        if (wsRef.current?.readyState === WebSocket.OPEN)
                            wsRef.current.send(JSON.stringify({ type: 'answer', sdp: pc.localDescription }));
                    } catch (err) {
                        console.error(`[ARGUS] Cam ${slot} SDP error:`, err);
                        closePc();
                    }

                } else if (msg.type === 'ice' && pcRef.current) {
                    try { if (msg.candidate) await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate)); }
                    catch { /* stale candidate */ }
                } else if (msg.type === 'streamer-gone') {
                    setStatus('AWAITING PHONE...');
                    closePc();
                } else if (msg.type === 'streamer-present') {
                    setStatus('PHONE CONNECTED...');
                }
            };

            ws.onclose = () => {
                if (!isMounted) return;
                wsRef.current = null;
                closePc();
                setStatus('RECONNECTING...');
                reconnectTimer = setTimeout(() => {
                    reconnectDelay = Math.min(reconnectDelay * 2, 15000);
                    connect();
                }, reconnectDelay);
            };

            ws.onerror = () => { if (isMounted) setStatus('WSS ERROR'); };
        };

        connect();
        return () => {
            isMounted = false;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            wsRef.current?.close();
            wsRef.current = null;
            closePc();
        };
    }, [isLive, wsPath]);

    // ── Detection Loop (mounted once, runs forever) ───────────────────────────
    useEffect(() => {
        const loop: FrameRequestCallback = () => {
            const now = performance.now();
            if (now - lastDetectRef.current < DETECT_INTERVAL_MS || detectingRef.current) {
                requestRef.current = requestAnimationFrame(loop); return;
            }
            const video = videoRef.current, canvas = canvasRef.current, faceapi = window.faceapi;
            if (!video || !canvas || !faceapi || video.paused || video.ended
                || !video.srcObject || video.videoWidth === 0 || video.clientWidth === 0) {
                requestRef.current = requestAnimationFrame(loop); return;
            }
            const dW = video.clientWidth, dH = video.clientHeight;
            lastDetectRef.current = now;
            detectingRef.current  = true;
            const iW = video.videoWidth, iH = video.videoHeight;

            faceapi.detectAllFaces(video).withFaceLandmarks().withFaceDescriptors()
                .then((detections: any[]) => {
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;
                    if (canvas.width !== dW || canvas.height !== dH) { canvas.width = dW; canvas.height = dH; }
                    ctx.clearRect(0, 0, dW, dH);

                    // objectFit:cover scaling — keeps bounding boxes aligned with visible pixels
                    const vA = iW / iH, dA = dW / dH;
                    let sX: number, sY: number, oX: number, oY: number;
                    if (vA > dA) { sY = dH / iH; sX = sY; oX = (dW - iW * sX) / 2; oY = 0; }
                    else         { sX = dW / iW; sY = sX; oX = 0; oY = (dH - iH * sY) / 2; }

                    const active: MatchResult[] = [];
                    detections.forEach((det: any) => {
                        let color = '#555963', label = 'UNKNOWN';
                        if (faceMatcherRef.current) {
                            const best = faceMatcherRef.current.findBestMatch(det.descriptor);
                            if (best.label !== 'unknown') {
                                color = '#f0a832';
                                const conf = Math.min(100, Math.max(0, Math.round((1 - best.distance) * 100)));
                                label = `${best.label} — ${conf}%`;
                                active.push({ name: best.label, conf });

                                // Idempotent alert: one POST per person per camera per cooldown window
                                const key      = `${cameraLabel}:${best.label.toLowerCase()}`;
                                const alertNow = Date.now();
                                if ((alertNow - (alertCooldownRef.current.get(key) ?? 0)) >= ALERT_COOLDOWN_MS) {
                                    alertCooldownRef.current.set(key, alertNow);
                                    fetch('/api/logs', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            activity: `${cameraLabel} — Match Detected: ${best.label} (${conf}%)`,
                                            type: 'face-match',
                                            severity: 'high'
                                        })
                                    }).catch(console.error);
                                }
                            }
                        }
                        const rb = det.detection.box;
                        const x = rb.x * sX + oX, y = rb.y * sY + oY, w = rb.width * sX, h = rb.height * sY;
                        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
                        ctx.fillStyle = color;   ctx.fillRect(x, y - 22, w, 22);
                        ctx.fillStyle = color === '#f0a832' ? '#000' : '#fff';
                        ctx.font = 'bold 11px "IBM Plex Mono", monospace';
                        ctx.fillText(label, x + 4, y - 6);
                    });

                    // Debounce: only re-render when matches actually change
                    const prev = pendingRef.current;
                    if (active.length !== prev.length ||
                        active.some((m, i) => m.name !== prev[i]?.name || m.conf !== prev[i]?.conf)) {
                        pendingRef.current = active;
                        setMatchesAndNotify(active);
                    }
                })
                .catch((e: any) => console.error('Detection error:', e))
                .finally(() => { detectingRef.current = false; });

            requestRef.current = requestAnimationFrame(loop);
        };
        requestRef.current = requestAnimationFrame(loop);
        return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
    }, []);

    const isLiveView = status === 'LIVE VIEW';

    return (
        <div className="cam-feed-wrapper">
            <div className="cam-feed-header">
                <span className="cam-label mono">CAM {slot}</span>
                <span className={`badge mono ${isLiveView ? 'badge-green' : status.includes('ERROR') || status.includes('LOST') ? 'badge-red' : 'badge-amber'}`}>
                    {status}
                </span>
            </div>
            <div className="lc-viewport" style={{ position: 'relative', background: '#000', overflow: 'hidden' }}>
                <div className="brackets top-left" /><div className="brackets top-right" />
                <div className="brackets bottom-left" /><div className="brackets bottom-right" />
                {isLiveView && (
                    <div className="rec-indicator mono" style={{ zIndex: 10 }}>
                        <span className="rec-dot" /> REC
                    </div>
                )}
                {isLive ? (
                    <>
                        <video ref={videoRef} autoPlay playsInline muted
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <canvas ref={canvasRef}
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 5, pointerEvents: 'none' }} />
                    </>
                ) : (
                    <div className="lc-offline-view">
                        <Camera size={32} color="var(--text-tertiary)" />
                        <p>Offline</p>
                    </div>
                )}
            </div>
            <div className="cam-matches-list">
                {matches.length === 0
                    ? <div className="cam-no-match mono">{isLiveView ? 'No matches in frame' : '—'}</div>
                    : matches.map((m, i) => (
                        <div key={i} className="match-row">
                            <strong>{m.name}</strong>
                            <span className="mono" style={{ color: 'var(--accent)' }}>{m.conf}%</span>
                        </div>
                    ))
                }
            </div>
        </div>
    );
}

// ─── LiveCamera ───────────────────────────────────────────────────────────────

export function LiveCamera() {
    const [isLive, setIsLive]             = useState(false);
    const [feedMode, setFeedMode]         = useState<'phone' | 'device'>('phone');
    const [cameraCount, setCameraCount]   = useState(1);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [loadStatus, setLoadStatus]     = useState('OFFLINE');
    const [deviceStatus, setDeviceStatus] = useState('OFFLINE');
    const [deviceError, setDeviceError]   = useState<string | null>(null);
    const [devMatches, setDevMatches]     = useState<MatchResult[]>([]);
    const [allMatches, setAllMatches]     = useState<Map<number, MatchResult[]>>(new Map());

    // Shared across all phone feeds
    const faceMatcherRef   = useRef<any>(null);
    const alertCooldownRef = useRef<Map<string, number>>(new Map());

    // Device-camera-specific refs
    const devVideoRef    = useRef<HTMLVideoElement>(null);
    const devCanvasRef   = useRef<HTMLCanvasElement>(null);
    const devRequestRef  = useRef<number>(0);
    const devDetecting   = useRef(false);
    const devLastDetect  = useRef(0);
    const devPending     = useRef<MatchResult[]>([]);

    // ── AI Model Loading (shared by all feeds) ────────────────────────────────
    useEffect(() => {
        let isMounted = true;
        const initFaceApi = async () => {
            try {
                const faceapi = window.faceapi;
                if (!faceapi) { if (isMounted) setTimeout(initFaceApi, 500); return; }
                setLoadStatus('LOADING AI MODELS...');
                await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
                await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
                await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
                if (!isMounted) return;
                setLoadStatus('BUILDING DATASET...');
                const images: string[] = await (await fetch('/dataset')).json();
                const descriptorsData = await Promise.all(
                    images.map(async (filename: string) => {
                        try {
                            const img = await faceapi.fetchImage(`/dataset/${filename}`);
                            const det = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
                            if (det) {
                                const label = filename.split('.')[0].replace(/_[0-9]+$/, '').replace(/[_|-]/g, ' ').toUpperCase();
                                return { label, descriptor: det.descriptor };
                            }
                        } catch (e) { console.error(`Error processing ${filename}:`, e); }
                        return null;
                    })
                );
                const grouped = descriptorsData.filter(Boolean).reduce((acc: any, curr: any) => {
                    if (!acc[curr.label]) acc[curr.label] = [];
                    acc[curr.label].push(curr.descriptor);
                    return acc;
                }, {});
                const labeled = Object.keys(grouped).map(
                    label => new faceapi.LabeledFaceDescriptors(label, grouped[label])
                );
                if (labeled.length > 0 && isMounted) faceMatcherRef.current = new faceapi.FaceMatcher(labeled, 0.48);
                if (isMounted) { setModelsLoaded(true); setLoadStatus('READY'); }
            } catch (e) {
                console.error('AI Loading Error:', e);
                if (isMounted) setLoadStatus('AI LOAD ERROR — ACCEPT CERT ON PORT 3000');
            }
        };
        if (window.location.protocol === 'https:' || window.location.hostname === 'localhost') initFaceApi();
        else setLoadStatus('HTTPS OR LOCALHOST REQUIRED');
        return () => { isMounted = false; };
    }, []);

    // ── Device Camera ─────────────────────────────────────────────────────────
    useEffect(() => {
        let isMounted = true;
        let stream: MediaStream | null = null;
        if (!isLive || feedMode !== 'device') {
            if (devVideoRef.current) devVideoRef.current.srcObject = null;
            if (feedMode !== 'device') setDeviceError(null);
            setDeviceStatus('OFFLINE');
            return;
        }
        setDeviceStatus('STARTING...');
        setDeviceError(null);
        (async () => {
            try {
                if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API unavailable — needs HTTPS');
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: false
                });
                if (!isMounted) { stream.getTracks().forEach(t => t.stop()); return; }
                if (devVideoRef.current) { devVideoRef.current.srcObject = stream; devVideoRef.current.play().catch(console.error); }
                if (isMounted) setDeviceStatus('LIVE VIEW');
            } catch (err: any) {
                if (!isMounted) return;
                setDeviceError(err?.message || 'Camera access denied');
                setDeviceStatus('DEVICE CAM ERROR');
            }
        })();
        return () => {
            isMounted = false;
            stream?.getTracks().forEach(t => t.stop());
            if (devVideoRef.current) devVideoRef.current.srcObject = null;
            setDevMatches([]);
        };
    }, [isLive, feedMode]);

    // ── Device Camera Detection Loop ──────────────────────────────────────────
    useEffect(() => {
        const cameraLabel = 'Live Camera';
        const loop: FrameRequestCallback = () => {
            const now = performance.now();
            if (now - devLastDetect.current < DETECT_INTERVAL_MS || devDetecting.current) {
                devRequestRef.current = requestAnimationFrame(loop); return;
            }
            const video = devVideoRef.current, canvas = devCanvasRef.current, faceapi = window.faceapi;
            if (!video || !canvas || !faceapi || video.paused || video.ended
                || !video.srcObject || video.videoWidth === 0 || video.clientWidth === 0) {
                devRequestRef.current = requestAnimationFrame(loop); return;
            }
            const dW = video.clientWidth, dH = video.clientHeight;
            devLastDetect.current = now;
            devDetecting.current  = true;
            const iW = video.videoWidth, iH = video.videoHeight;

            faceapi.detectAllFaces(video).withFaceLandmarks().withFaceDescriptors()
                .then((detections: any[]) => {
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;
                    if (canvas.width !== dW || canvas.height !== dH) { canvas.width = dW; canvas.height = dH; }
                    ctx.clearRect(0, 0, dW, dH);
                    const vA = iW / iH, dA = dW / dH;
                    let sX: number, sY: number, oX: number, oY: number;
                    if (vA > dA) { sY = dH / iH; sX = sY; oX = (dW - iW * sX) / 2; oY = 0; }
                    else         { sX = dW / iW; sY = sX; oX = 0; oY = (dH - iH * sY) / 2; }
                    const active: MatchResult[] = [];
                    detections.forEach((det: any) => {
                        let color = '#555963', label = 'UNKNOWN';
                        if (faceMatcherRef.current) {
                            const best = faceMatcherRef.current.findBestMatch(det.descriptor);
                            if (best.label !== 'unknown') {
                                color = '#f0a832';
                                const conf = Math.min(100, Math.max(0, Math.round((1 - best.distance) * 100)));
                                label = `${best.label} — ${conf}%`;
                                active.push({ name: best.label, conf });
                                const key = `${cameraLabel}:${best.label.toLowerCase()}`;
                                const alertNow = Date.now();
                                if ((alertNow - (alertCooldownRef.current.get(key) ?? 0)) >= ALERT_COOLDOWN_MS) {
                                    alertCooldownRef.current.set(key, alertNow);
                                    fetch('/api/logs', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            activity: `${cameraLabel} — Match Detected: ${best.label} (${conf}%)`,
                                            type: 'face-match', severity: 'high'
                                        })
                                    }).catch(console.error);
                                }
                            }
                        }
                        const rb = det.detection.box;
                        const x = rb.x * sX + oX, y = rb.y * sY + oY, w = rb.width * sX, h = rb.height * sY;
                        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
                        ctx.fillStyle = color;   ctx.fillRect(x, y - 22, w, 22);
                        ctx.fillStyle = color === '#f0a832' ? '#000' : '#fff';
                        ctx.font = 'bold 11px "IBM Plex Mono", monospace';
                        ctx.fillText(label, x + 4, y - 6);
                    });
                    const prev = devPending.current;
                    if (active.length !== prev.length ||
                        active.some((m, i) => m.name !== prev[i]?.name || m.conf !== prev[i]?.conf)) {
                        devPending.current = active;
                        setDevMatches(active);
                    }
                })
                .catch((e: any) => console.error('Device detection error:', e))
                .finally(() => { devDetecting.current = false; });
            devRequestRef.current = requestAnimationFrame(loop);
        };
        devRequestRef.current = requestAnimationFrame(loop);
        return () => { if (devRequestRef.current) cancelAnimationFrame(devRequestRef.current); };
    }, []);

    // ── Callback for PhoneFeed match updates ──────────────────────────────────
    const handleMatchesChange = useCallback((slot: number, m: MatchResult[]) => {
        setAllMatches(prev => {
            const next = new Map(prev);
            if (m.length === 0) next.delete(slot); else next.set(slot, m);
            return next;
        });
    }, []);

    const totalMatches = feedMode === 'device'
        ? devMatches.length
        : Array.from(allMatches.values()).reduce((s, m) => s + m.length, 0);

    // Grid column count: 1→1, 2→2, 3-4→2, 5-6→3
    const cols  = cameraCount === 1 ? 1 : cameraCount <= 4 ? 2 : 3;
    const slots = Array.from({ length: cameraCount }, (_, i) => i + 1);
    const devIsLive = deviceStatus === 'LIVE VIEW';

    return (
        <div className="live-camera-page">
            {/* Status Bar */}
            <div className="lc-top-row">
                <div className="lc-status-box">
                    {feedMode === 'phone' ? (
                        <>
                            <span className="lc-label mono">CAMERAS:</span>
                            <span className="badge badge-blue mono">{cameraCount} ACTIVE</span>
                        </>
                    ) : (
                        <>
                            <span className="lc-label mono">LIVE FEED:</span>
                            <span className={`badge mono ${devIsLive ? 'badge-green' : deviceStatus.includes('ERROR') ? 'badge-red' : 'badge-amber'}`}>
                                {deviceStatus}
                            </span>
                        </>
                    )}
                    {!modelsLoaded && (
                        <span className="badge badge-amber mono" style={{ marginLeft: 8 }}>{loadStatus}</span>
                    )}
                </div>
                <div className="lc-matches-box mono">
                    MATCHES FOUND: <span className="highlight">{totalMatches}</span>
                </div>
            </div>

            {/* Feeds + Controls */}
            <div className="lc-viewport-container">
                {feedMode === 'phone' ? (
                    <div className="lc-feeds-grid" data-cols={cols}>
                        {slots.map(slot => (
                            <PhoneFeed
                                key={slot}
                                slot={slot}
                                isLive={isLive}
                                faceMatcherRef={faceMatcherRef}
                                alertCooldownRef={alertCooldownRef}
                                onMatchesChange={handleMatchesChange}
                            />
                        ))}
                    </div>
                ) : (
                    /* Device camera — single viewport */
                    <div className="lc-viewport" style={{ flex: 3, position: 'relative', background: '#000', overflow: 'hidden' }}>
                        <div className="brackets top-left" /><div className="brackets top-right" />
                        <div className="brackets bottom-left" /><div className="brackets bottom-right" />
                        {devIsLive && (
                            <div className="rec-indicator mono" style={{ zIndex: 10 }}>
                                <span className="rec-dot" /> REC
                            </div>
                        )}
                        {isLive ? (
                            <>
                                <video ref={devVideoRef} autoPlay playsInline muted
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                <canvas ref={devCanvasRef}
                                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 5, pointerEvents: 'none' }} />
                            </>
                        ) : (
                            <div className="lc-offline-view">
                                <Camera size={48} color="var(--text-tertiary)" />
                                <p>Camera Feed Offline — Click Start Camera Feed to begin</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Controls Panel */}
                <div className="lc-controls card">
                    <div className="lc-feed-toggle">
                        <button
                            className={`btn btn-lg ${isLive ? 'btn-danger' : 'btn-primary'}`}
                            onClick={() => setIsLive(v => !v)}
                            disabled={!modelsLoaded}
                        >
                            <RefreshCw size={18} className={isLive ? 'spin' : ''} style={{ marginRight: '8px' }} />
                            {isLive ? 'Stop Camera Feed' : !modelsLoaded ? 'Loading Models...' : 'Start Camera Feed'}
                        </button>
                    </div>

                    <div className="lc-input-selector">
                        <span className="input-label mono">FEED INPUT:</span>
                        <div className="input-chips">
                            <button className={`chip ${feedMode === 'phone' ? 'active' : ''}`}
                                onClick={() => setFeedMode('phone')}>
                                External Phone(s)
                            </button>
                            <button className={`chip ${feedMode === 'device' ? 'active' : ''}`}
                                onClick={() => setFeedMode('device')}
                                title="Use this device's webcam">
                                This Device
                            </button>
                        </div>
                        {feedMode === 'device' && deviceError && (
                            <p style={{ color: 'var(--error)', fontSize: '12px', margin: '6px 0 0', fontFamily: 'monospace' }}>
                                ⚠ {deviceError}
                            </p>
                        )}
                    </div>

                    {feedMode === 'phone' && (
                        <>
                            <div className="lc-cam-count">
                                <span className="input-label mono">CAMERA COUNT:</span>
                                <div className="cam-count-controls">
                                    <button onClick={() => setCameraCount(c => Math.max(1, c - 1))} disabled={cameraCount <= 1}>
                                        <Minus size={16} />
                                    </button>
                                    <span>{cameraCount}</span>
                                    <button onClick={() => setCameraCount(c => Math.min(MAX_CAMERAS, c + 1))} disabled={cameraCount >= MAX_CAMERAS}>
                                        <Plus size={16} />
                                    </button>
                                </div>
                            </div>
                            {isLive && (
                                <div className="phone-hints">
                                    {slots.map(slot => (
                                        <p key={slot} className="mono">
                                            Phone {slot} → <code>/stream-video{slot > 1 ? `?slot=${slot}` : ''}</code>
                                        </p>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Device mode match results (phone mode shows results inline per feed) */}
            {feedMode === 'device' && (
                <div className="card lc-results-card">
                    <div className="card-header">
                        <h4>Detected Matches: {devMatches.length}</h4>
                        {isLive && <span className="badge badge-amber">Scanning...</span>}
                    </div>
                    {!isLive ? (
                        <div className="empty-state">System offline. Awaiting video feed.</div>
                    ) : devMatches.length === 0 ? (
                        <div className="empty-state">
                            {devIsLive ? 'No known matches currently in frame.' : 'Awaiting video feed...'}
                        </div>
                    ) : (
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {devMatches.map((m, i) => (
                                <div key={i} style={{
                                    padding: '15px',
                                    background: 'rgba(240, 168, 50, 0.1)',
                                    border: '1px solid var(--accent)',
                                    borderRadius: '8px',
                                    display: 'flex', justifyContent: 'space-between', color: '#fff'
                                }}>
                                    <strong>{m.name}</strong>
                                    <span className="mono" style={{ color: 'var(--accent)' }}>{m.conf}% CONFIDENCE</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
