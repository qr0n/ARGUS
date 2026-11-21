import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Plus, UploadCloud, Loader2, RefreshCw, MapPin, Calendar, AlertCircle } from 'lucide-react';
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

const getMockData = (name: string) => {
  const val = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return {
      isResolved: val % 2 === 0,
      isMissing: val % 3 === 0,
      age: 20 + (val % 35),
      firstSeenLoc: val % 3 === 0 ? 'Downtown Hub, Kingston' : 'Portmore, JM',
      lastSeenLoc: val % 2 === 0 ? 'Kingston, JM' : 'Montego Bay, JM',
      dateSubmitted: `2024-${String((val % 12) + 1).padStart(2, '0')}-${String((val % 28) + 1).padStart(2, '0')}`,
      priority: val % 4 === 0 ? 'Low' : (val % 2 === 0 ? 'Medium' : 'High')
  };
};

export function CaseProfiles() {
  const [profiles, setProfiles] = useState<DatasetProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('All');

  const [showModal, setShowModal] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
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
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    
    if (activeTab === 'All') return true;
    
    const mock = getMockData(p.name);
    // Simple mock logic for filtering
    if (activeTab === 'Resolved' && mock.isResolved) return true;
    if (activeTab === 'Missing' && mock.isMissing && !mock.isResolved) return true;
    if (activeTab === 'Wanted' && !mock.isMissing && !mock.isResolved) return true;
    
    return false;
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
            <div className="filter-tabs">
                {['All', 'Missing', 'Wanted', 'Resolved'].map(tab => (
                    <button
                        key={tab}
                        className={`tab ${activeTab === tab ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab}
                    </button>
                ))}
            </div>
        </div>

        <button className="btn btn-primary cp-create-btn" onClick={() => { setShowModal(true); setUploadError(''); }}>
          <Plus size={18} /> Create Case Profile
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
              <div className="cp-card-header">
                <div className="cp-tags">
                  {(() => {
                    const mock = getMockData(profile.name);
                    return (
                        <>
                            <span className={`badge ${mock.isResolved ? 'badge-green' : 'badge-amber'}`}>
                                {mock.isResolved ? 'Resolved' : 'Unresolved'}
                            </span>
                            <span className={`badge ${mock.isMissing ? 'badge-amber' : 'badge-red'}`}>
                                {mock.isMissing ? 'Missing' : 'Wanted'}
                            </span>
                        </>
                    );
                  })()}
                </div>
              </div>

              <div className="cp-card-body">
                <div
                  className="cp-avatar"
                  style={{ backgroundImage: `url(${profile.src})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                />
                <div className="cp-info">
                  <h4 className="cp-name">{profile.name}</h4>
                  <div className="cp-details-list">
                    {(() => {
                       const mock = getMockData(profile.name);
                       return (
                          <>
                              <span className="cp-detail-item" style={{display: 'flex', alignItems: 'center', gap: '6px'}}><Calendar size={12} /> Age: {mock.age}</span>
                              <span className="cp-detail-item" style={{display: 'flex', alignItems: 'center', gap: '6px'}}><MapPin size={12} /> Last Seen at: {mock.lastSeenLoc}</span>
                              <span className="cp-detail-item highlight" style={{display: 'flex', alignItems: 'center', gap: '6px'}}><AlertCircle size={12} /> Priority: {mock.priority}</span>
                          </>
                       );
                    })()}
                  </div>
                </div>
              </div>

              <div className="cp-card-footer">
                <button
                  className="btn btn-full"
                  onClick={() => { setSelectedProfile(profile); setShowEdit(false); }}
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

      {/* Case Details View/Edit Modals */}
      {selectedProfile && !showEdit && (
        <div className="modal-overlay" onClick={() => setSelectedProfile(null)}>
          <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-flex">
              <h3 className="modal-title">Case Profile Details</h3>
              <div className="cp-tags">
                <span className={`badge ${getMockData(selectedProfile.name).isResolved ? 'badge-green' : 'badge-amber'}`}>
                    {getMockData(selectedProfile.name).isResolved ? 'Resolved' : 'Unresolved'}
                </span>
                <span className={`badge ${getMockData(selectedProfile.name).isMissing ? 'badge-amber' : 'badge-red'}`}>
                    {getMockData(selectedProfile.name).isMissing ? 'Missing' : 'Wanted'}
                </span>
              </div>
            </div>
            <div className="modal-body-split">
              <div style={{ flex: 1.5, display: 'flex', minHeight: '400px' }}>
                <div className="modal-photo" style={{ backgroundImage: `url(${selectedProfile.src})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', width: '100%', height: '100%', borderRadius: '8px' }}></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '20px' }}>
                <div className="modal-info-grid">
                  <div className="info-block">
                    <span className="info-label mono">FULL NAME</span>
                    <span className="info-val">{selectedProfile.name}</span>
                  </div>
                  <div className="info-block">
                    <span className="info-label mono">DATE SUBMITTED</span>
                    <span className="info-val">{getMockData(selectedProfile.name).dateSubmitted}</span>
                  </div>
                  <div className="info-block">
                    <span className="info-label mono">PRIORITY</span>
                    <span className="info-val highlight">{getMockData(selectedProfile.name).priority} Priority</span>
                  </div>
                  <div className="info-block">
                    <span className="info-label mono">FIRST SEEN AT</span>
                    <span className="info-val">{getMockData(selectedProfile.name).firstSeenLoc}</span>
                  </div>
                  <div className="info-block">
                    <span className="info-label mono">LAST SEEN AT</span>
                    <span className="info-val">{getMockData(selectedProfile.name).lastSeenLoc}</span>
                  </div>
                </div>
                <div className="info-block full-width">
                  <span className="info-label mono">NOTES / DESCRIPTION</span>
                  <p className="info-val text-muted">Subject was last seen heading near {getMockData(selectedProfile.name).lastSeenLoc}. Internal system actively tracking {selectedProfile.name} alongside dataset filename: <span className="mono">{selectedProfile.filename}</span></p>
                </div>
              </div>
            </div>
            <div className="modal-actions spread" style={{ marginTop: '20px' }}>
              <button className="btn btn-danger" onClick={() => {
                setSelectedProfile(null);
                handleDelete(selectedProfile.filename);
              }}>Remove Profile</button>
              <div>
                <button className="btn" style={{ marginRight: '12px' }} onClick={() => setSelectedProfile(null)}>Close</button>
                <button className="btn btn-primary" onClick={() => setShowEdit(true)}>
                  Update Details
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedProfile && showEdit && (
        <div className="modal-overlay" onClick={() => setShowEdit(false)}>
          <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-flex">
              <h3 className="modal-title">Edit Case Profile</h3>
              <div className="cp-tags">
                <span className={`badge ${getMockData(selectedProfile.name).isResolved ? 'badge-green' : 'badge-amber'}`}>
                    {getMockData(selectedProfile.name).isResolved ? 'Resolved' : 'Unresolved'}
                </span>
                <span className={`badge ${getMockData(selectedProfile.name).isMissing ? 'badge-amber' : 'badge-red'}`}>
                    {getMockData(selectedProfile.name).isMissing ? 'Missing' : 'Wanted'}
                </span>
              </div>
            </div>
            <div className="modal-body-split">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1.5 }}>
                  <div className="modal-photo" style={{ backgroundImage: `url(${selectedProfile.src})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', width: '100%', flex: 1, minHeight: '400px', borderRadius: '8px' }}></div>
                  <div className="modal-upload full-width" style={{ marginTop: 0, padding: '16px' }}>
                      <p style={{marginBottom: 0}}>Update Photo</p>
                      <button className="btn" style={{width: '100%'}}>Browse File</button>
                  </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '20px' }}>
                <div className="modal-info-grid">
                  <div className="info-block">
                    <span className="info-label mono">FULL NAME</span>
                    <input className="input-field" defaultValue={selectedProfile.name} />
                  </div>
                  <div className="info-block">
                    <span className="info-label mono">DATE SUBMITTED</span>
                    <input className="input-field" defaultValue={getMockData(selectedProfile.name).dateSubmitted} type="text" />
                  </div>
                  <div className="info-block">
                    <span className="info-label mono">STATUS</span>
                    <select className="input-field select-field" defaultValue={getMockData(selectedProfile.name).isMissing ? 'missing' : 'wanted'}>
                        <option value="missing">Missing Person</option>
                        <option value="wanted">Wanted Person</option>
                    </select>
                  </div>
                  <div className="info-block">
                    <span className="info-label mono">PRIORITY</span>
                    <select className="input-field select-field" defaultValue={getMockData(selectedProfile.name).priority.toLowerCase()}>
                        <option value="high">High Priority</option>
                        <option value="medium">Medium Priority</option>
                        <option value="low">Low Priority</option>
                    </select>
                  </div>
                </div>
              
                <div className="modal-info-grid">
                    <div className="info-block full-width">
                        <span className="info-label mono">FIRST SEEN AT</span>
                        <input className="input-field" defaultValue={getMockData(selectedProfile.name).firstSeenLoc} />
                    </div>
                    <div className="info-block full-width">
                        <span className="info-label mono">LAST SEEN AT</span>
                        <input className="input-field" defaultValue={getMockData(selectedProfile.name).lastSeenLoc} />
                    </div>
                </div>

                <div className="info-block full-width">
                  <span className="info-label mono">NOTES / DESCRIPTION</span>
                  <textarea className="input-field text-area" defaultValue={`Subject was last seen heading near ${getMockData(selectedProfile.name).lastSeenLoc}. Internal system actively tracking ${selectedProfile.name} alongside dataset filename: ${selectedProfile.filename}`} rows={3}></textarea>
                </div>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '20px' }}>
              <button className="btn" onClick={() => setShowEdit(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => setShowEdit(false)}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}