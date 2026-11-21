import { useCallback, useEffect, useState } from 'react';
import { Smartphone, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/context';

export interface CameraDevice {
    id: string;
    name: string;
    online: boolean;
    createdBy: string;
    createdAt: string;
    lastSeenAt: string | null;
}

interface Pairing { code: string; name: string; expiresAt: string; pairUrl: string }

const POLL_MS = 5000;

export function DevicePanel({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
    const { user } = useAuth();
    const canManage = user.role === 'operator' || user.role === 'admin';
    const [devices, setDevices] = useState<CameraDevice[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [pairing, setPairing] = useState<Pairing | null>(null);
    const [now, setNow] = useState(() => Date.now());

    const refresh = useCallback(async () => {
        try {
            const res = await fetch('/api/devices');
            if (!res.ok) throw new Error(`Could not load devices (${res.status})`);
            const list = (await res.json()) as CameraDevice[];
            setDevices(list);
            setError(null);
            // Keep the selection valid; default to the first online device.
            if (!selectedId || !list.some(d => d.id === selectedId)) {
                onSelect(list.find(d => d.online)?.id ?? list[0]?.id ?? null);
            }
        } catch (e) {
            setError((e as Error).message);
        }
    }, [selectedId, onSelect]);

    useEffect(() => {
        refresh();
        const t = setInterval(refresh, POLL_MS);
        return () => clearInterval(t);
    }, [refresh]);

    // Countdown for the pairing code; also hides it once a new device shows up.
    useEffect(() => {
        if (!pairing) return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [pairing]);
    const secondsLeft = pairing ? Math.max(0, Math.round((Date.parse(pairing.expiresAt) - now) / 1000)) : 0;

    const startPairing = async () => {
        const name = window.prompt('Name for this camera (e.g. "Front entrance phone")', 'Phone camera');
        if (name === null) return;
        try {
            const res = await fetch('/api/devices/pairing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            if (!res.ok) throw new Error(res.status === 403 ? 'Only operators and administrators can pair phones.' : 'Could not start pairing.');
            setPairing(await res.json());
            setNow(Date.now());
        } catch (e) {
            setError((e as Error).message);
        }
    };

    const removeDevice = async (d: CameraDevice) => {
        if (!window.confirm(`Remove "${d.name}"? It will be disconnected and must be paired again to stream.`)) return;
        const res = await fetch(`/api/devices/${encodeURIComponent(d.id)}`, { method: 'DELETE' });
        if (!res.ok) { setError('Could not remove the device.'); return; }
        if (selectedId === d.id) onSelect(null);
        refresh();
    };

    return (
        <div className="lc-input-selector">
            <span className="input-label mono">PHONE CAMERA:</span>
            {error && <p style={{ color: 'var(--status-red)', fontSize: '12px', margin: '6px 0' }}>⚠ {error}</p>}
            {devices.length === 0 && !error && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '6px 0' }}>
                    No phones paired yet.{canManage ? ' Use "Pair a phone" to add one.' : ' Ask an operator to pair one.'}
                </p>
            )}
            <div className="input-chips" style={{ flexWrap: 'wrap' }}>
                {devices.map(d => (
                    <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <button
                            className={`chip ${selectedId === d.id ? 'active' : ''}`}
                            onClick={() => onSelect(d.id)}
                            title={d.online ? 'Streaming now' : `Offline${d.lastSeenAt ? ` — last seen ${new Date(d.lastSeenAt).toLocaleString()}` : ''}`}
                        >
                            <Smartphone size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
                            {d.name} {d.online ? '●' : '○'}
                        </button>
                        {canManage && (
                            <button className="chip" onClick={() => removeDevice(d)} title={`Remove ${d.name}`} aria-label={`Remove ${d.name}`}>
                                <Trash2 size={14} />
                            </button>
                        )}
                    </span>
                ))}
                {canManage && (
                    <button className="chip" onClick={startPairing}>
                        <Plus size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} /> Pair a phone
                    </button>
                )}
            </div>
            {pairing && secondsLeft > 0 && (
                <div className="card" style={{ marginTop: 12, padding: 16 }}>
                    <p style={{ margin: '0 0 8px', color: 'var(--text-secondary)', fontSize: 13 }}>
                        On the phone (same Wi-Fi), open this link and accept the certificate warning:
                    </p>
                    <code style={{ display: 'block', wordBreak: 'break-all', marginBottom: 8 }}>{pairing.pairUrl}</code>
                    <p style={{ margin: '0 0 4px', color: 'var(--text-secondary)', fontSize: 13 }}>Or enter this code on the phone's ARGUS page:</p>
                    <div className="mono" style={{ fontSize: 28, letterSpacing: 6, color: 'var(--text-primary)' }}>{pairing.code}</div>
                    <p style={{ margin: '8px 0 0', color: 'var(--text-tertiary)', fontSize: 12 }}>
                        One-time code for "{pairing.name}" — expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
                        {' · '}
                        <a href="#" onClick={e => { e.preventDefault(); setPairing(null); }}>Hide</a>
                    </p>
                </div>
            )}
        </div>
    );
}
