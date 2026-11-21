import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Plus, UploadCloud, Loader2, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../auth/context';
import './CaseProfiles.css';

const SERVER = ''; // Using Vite proxy to avoid strict SSL issues

interface DatasetProfile {
  filename: string;
  name: string;
  src: string;
}

function toDisplayName(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')         // strip extension
    .replace(/_[0-9]+$/, '')         // strip trailing _1 _2
    .replace(/[_-]/g, ' ')           // underscores → spaces
    .replace(/\b\w/g, c => c.toUpperCase()); // Title Case
}

// Case details (status, priority, locations, notes) are not stored anywhere yet,
// so only real data is shown: the subject's name (from the file name) and photo.
// Do not display invented attributes next to real people's photos.

export function CaseProfiles() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const [profiles, setProfiles] = useState<DatasetProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState(false);
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<DatasetProfile | null>(null);
  const [subjectName, setSubjectName] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    setServerError(false);
    try {
      const res = await fetch(`${SERVER}/dataset`);
      const files: string[] = await res.json();
      setProfiles(files.map(f => ({
        filename: f,
        name: toDisplayName(f),
        src: `${SERVER}/dataset/${f}`,
      })));
    } catch {
      setServerError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const handlePhotoChange = (file: File) => {
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = e => setPhotoPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!photoFile) { setUploadError('Please select a photo.'); return; }
    if (!subjectName.trim()) { setUploadError('Please enter a subject name.'); return; }
    setUploading(true);
    setUploadError('');
    try {
      const fd = new FormData();
      fd.append('subject', subjectName.trim());
      fd.append('photo', photoFile, photoFile.name);
      const res = await fetch(`${SERVER}/dataset/upload`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) throw new Error('Only administrators can add case photos.');
      if (!res.ok || !data.success) throw new Error(data.error || 'Upload failed');
      // The server records this upload in the activity log.

      setShowModal(false);
      setSubjectName('');
      setPhotoFile(null);
      setPhotoPreview(null);
      fetchProfiles();
    } catch (e: any) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Remove "${toDisplayName(filename)}" from the dataset?`)) return;
    try {
      const res = await fetch(`${SERVER}/dataset/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      if (res.status === 403) { alert('Only administrators can remove case photos.'); return; }
      if (!res.ok) { alert('Could not remove the photo. Please try again.'); return; }
      // The server records this removal in the activity log.
      setProfiles(prev => prev.filter(p => p.filename !== filename));
    } catch {
      alert('Could not reach the server.');
    }
  };

  const filtered = profiles.filter(p => {
    return p.name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="case-profiles-page">
      <div className="cp-toolbar">
        <div className="cp-search-container">
          <Search size={18} className="cp-search-icon" />
          <input
            type="text"
            placeholder="Search by name…"
            className="cp-search-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button className="btn cp-refresh-btn" onClick={fetchProfiles} title="Refresh">
              <RefreshCw size={16} />
            </button>
        </div>

        {isAdmin && (
          <button className="btn btn-primary cp-create-btn" onClick={() => { setShowModal(true); setUploadError(''); }}>
            <Plus size={18} /> Create Case Profile
          </button>
        )}
      </div>

      {/* Status states */}
      {loading && (
        <div className="cp-state-msg">
          <Loader2 className="spin" size={32} />
          <p>Loading dataset from server…</p>
        </div>
      )}

      {!loading && serverError && (
        <div className="cp-state-msg error">
          <p>⚠️ Cannot reach the AI server at <code>{SERVER}</code>.</p>
          <span>Make sure the ARGUS backend is running, then open that URL and accept the certificate warning.</span>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={fetchProfiles}>Retry</button>
        </div>
      )}

      {!loading && !serverError && profiles.length === 0 && (
        <div className="cp-state-msg">
          <p>No profiles in dataset yet.</p>
          <span>Click "Add to Dataset" to register the first subject.</span>
        </div>
      )}

      {!loading && !serverError && filtered.length === 0 && profiles.length > 0 && (
        <div className="cp-state-msg">
          <p>No results matching "{search}".</p>
        </div>
      )}

      {/* Profile Grid */}
      {!loading && !serverError && (
        <div className="cp-grid">
          {filtered.map(profile => (
            <div key={profile.filename} className="card cp-card">
              <div className="cp-card-body">
                <div
                  className="cp-avatar"
                  style={{ backgroundImage: `url(${profile.src})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                />
                <div className="cp-info">
                  <h4 className="cp-name">{profile.name}</h4>
                  <div className="cp-details-list">
                    <span className="cp-detail-item mono" style={{display: 'flex', alignItems: 'center', gap: '6px'}}><ImageIcon size={12} /> {profile.filename}</span>
                  </div>
                </div>
              </div>

              <div className="cp-card-footer">
                <button
                  className="btn btn-full"
                  onClick={() => setSelectedProfile(profile)}
                >
                  View Case Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add to Dataset Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content card" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Add Subject to Dataset</h3>

            <div className="modal-form">
              <label className="settings-label mono">SUBJECT FULL NAME</label>
              <input
                className="input-field"
                placeholder="e.g. John Smith"
                value={subjectName}
                onChange={e => setSubjectName(e.target.value)}
              />

              <label className="settings-label mono" style={{ marginTop: 12 }}>SUBJECT PHOTO</label>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoChange(f); }}
              />
              <div
                className={`dropzone ${photoPreview ? 'has-image' : ''}`}
                style={{ minHeight: 140 }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && f.type.startsWith('image/')) handlePhotoChange(f); }}
              >
                {photoPreview ? (
                  <div className="preview-container">
                    <img src={photoPreview} alt="Preview" className="image-preview" />
                    <div className="preview-overlay"><span>Click to change</span></div>
                  </div>
                ) : (
                  <div className="dropzone-content">
                    <UploadCloud size={36} color="var(--accent)" />
                    <p>Drop photo or click to browse</p>
                  </div>
                )}
              </div>

              {uploadError && <p className="upload-error mono">{uploadError}</p>}
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={() => setShowModal(false)} disabled={uploading}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={uploading}>
                {uploading ? <><Loader2 className="spin" size={16} /> Uploading…</> : 'Save to Dataset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Case Details */}
      {selectedProfile && (
        <div className="modal-overlay" onClick={() => setSelectedProfile(null)}>
          <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-flex">
              <h3 className="modal-title">Case Profile Details</h3>
            </div>
            <div className="modal-body-split">
              <div style={{ flex: 1.5, display: 'flex', minHeight: '400px' }}>
                <div className="modal-photo" style={{ backgroundImage: `url(${selectedProfile.src})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', width: '100%', height: '100%', borderRadius: '8px' }}></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '20px' }}>
                <div className="modal-info-grid">
                  <div className="info-block">
                    <span className="info-label mono">NAME</span>
                    <span className="info-val">{selectedProfile.name}</span>
                  </div>
                  <div className="info-block">
                    <span className="info-label mono">PHOTO FILE</span>
                    <span className="info-val mono">{selectedProfile.filename}</span>
                  </div>
                </div>
                <p className="info-val text-muted" style={{ fontSize: 13 }}>
                  Case details such as status, priority and locations are not recorded yet.
                </p>
              </div>
            </div>
            <div className="modal-actions spread" style={{ marginTop: '20px' }}>
              {isAdmin ? (
                <button className="btn btn-danger" onClick={() => {
                  setSelectedProfile(null);
                  handleDelete(selectedProfile.filename);
                }}>Remove Profile</button>
              ) : <span />}
              <button className="btn" onClick={() => setSelectedProfile(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}