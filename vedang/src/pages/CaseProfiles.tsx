import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Plus, Trash2, UploadCloud, Loader2, RefreshCw } from 'lucide-react';
import './CaseProfiles.css';

const SERVER = 'https://localhost:3000';

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

export function CaseProfiles() {
  const [profiles, setProfiles] = useState<DatasetProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState(false);
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [subjectName, setSubjectName] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const [deletingFile, setDeletingFile] = useState<string | null>(null);

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
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Upload failed');
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
    setDeletingFile(filename);
    try {
      await fetch(`${SERVER}/dataset/${filename}`, { method: 'DELETE' });
      setProfiles(prev => prev.filter(p => p.filename !== filename));
    } catch {}
    setDeletingFile(null);
  };

  const filtered = profiles.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

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

        <div className="filter-tabs">
          <button className="tab active">Dataset ({profiles.length})</button>
        </div>

        <button className="btn cp-refresh-btn" onClick={fetchProfiles} title="Refresh">
          <RefreshCw size={16} />
        </button>

        <button className="btn btn-primary cp-create-btn" onClick={() => { setShowModal(true); setUploadError(''); }}>
          <Plus size={18} /> Add to Dataset
        </button>
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
          <p>⚠️ Cannot reach the AI server at <code>https://localhost:3000</code>.</p>
          <span>Make sure the live-camera-server is running, then open that URL and accept the certificate warning.</span>
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
              <div className="cp-card-header">
                <div className="cp-tags">
                  <span className="badge badge-green">Dataset Entry</span>
                </div>
                <button
                  className="btn cp-delete-btn"
                  title="Remove from dataset"
                  onClick={() => handleDelete(profile.filename)}
                  disabled={deletingFile === profile.filename}
                >
                  {deletingFile === profile.filename
                    ? <Loader2 className="spin" size={14} />
                    : <Trash2 size={14} />
                  }
                </button>
              </div>

              <div className="cp-card-body">
                <div
                  className="cp-avatar"
                  style={{ backgroundImage: `url(${profile.src})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                />
                <div className="cp-info">
                  <h4 className="cp-name">{profile.name}</h4>
                  <div className="cp-details-list">
                    <span className="cp-detail-item mono" style={{ fontSize: 11, opacity: 0.55 }}>{profile.filename}</span>
                  </div>
                </div>
              </div>

              <div className="cp-card-footer">
                <a
                  className="btn btn-full"
                  href={profile.src}
                  target="_blank"
                  rel="noreferrer"
                >
                  View Full Image
                </a>
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
    </div>
  );
}
