import { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileSearch, Activity, CheckCircle2, ChevronRight, UserCircle, Loader2 } from 'lucide-react';
import './AIAging.css';

declare global {
  interface Window {
    faceapi: any;
  }
}

export function AIAging() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationComplete, setSimulationComplete] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [matcherReady, setMatcherReady] = useState(false);
  const [faceMatcher, setFaceMatcher] = useState<any>(null);
  const [matchResult, setMatchResult] = useState<{name: string, conf: number, src: string} | null>(null);
  const [labelToImageMap, setLabelToImageMap] = useState<Record<string, string>>({});

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
        const mapping: Record<string, string> = {};
        for (const filename of images) {
          const img = await faceapi.fetchImage(`/dataset/${filename}`);
          const detections = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
          
          if (detections) {
            let label = filename.split('.')[0];
            label = label.replace(/_[0-9]+$/, '').replace(/[_|-]/g, ' '); 
            mapping[label.toLowerCase()] = filename;
            
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
          setLabelToImageMap(mapping);
        }
        if (isMounted) setMatcherReady(true);
      } catch (e) {
        console.error('AI Loading Error:', e);
        if (isMounted) setMatcherReady(false);
        // We will handle the error message in the UI rendering below by checking `!matcherReady && !isSimulating`
      }
    };
    initFaceApi();
    return () => { isMounted = false; };
  }, []);

  const handleAreaClick = () => {
    if (!isSimulating && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSelectedImage(event.target?.result as string);
        setSimulationComplete(false);
        setCurrentStep(1);
        setMatchResult(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isSimulating) return;
    
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSelectedImage(event.target?.result as string);
        setSimulationComplete(false);
        setCurrentStep(1);
        setMatchResult(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const runSimulation = async () => {
    if (!selectedImage || isSimulating || !matcherReady) return;
    
    setIsSimulating(true);
    setCurrentStep(2); // Image Scan
    setMatchResult(null);

    try {
      const faceapi = window.faceapi;
      const img = await faceapi.fetchImage(selectedImage);
      const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
      
      setCurrentStep(3); // AI Aging Process

      setTimeout(() => {
        if (detection && faceMatcher) {
          const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
          if (bestMatch.label !== 'unknown') {
            const conf = Math.round((1 - bestMatch.distance) * 100);
            
            // Check the mapping first, otherwise fallback to guessing the generic .jpg
            const targetFilename = labelToImageMap[bestMatch.label.toLowerCase()] 
              || (bestMatch.label.toLowerCase().replace(/ /g, '_') + '.jpg');
            
            setMatchResult({
              name: bestMatch.label,
              conf: Math.min(100, Math.max(0, conf)),
              src: `/dataset/${targetFilename}`
            });
            
            // Log Match
            fetch('/api/logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activity: `AI Aging: Match Detected — ${bestMatch.label} (${Math.min(100, Math.max(0, conf))}%)`, type: 'ai-scan', severity: 'warning' })
            }).catch(e => console.error("Failed to log", e));

          } else {
            // Log No Match
            fetch('/api/logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activity: `AI Aging: No database match found.`, type: 'ai-scan', severity: 'info' })
            }).catch(e => console.error("Failed to log", e));
          }
        }

        setCurrentStep(4); // Result Matches
        setSimulationComplete(true);
        setIsSimulating(false);
      }, 2000);
    } catch (e) {
      console.error('Detection error:', e);
      setCurrentStep(4);
      setSimulationComplete(true);
      setIsSimulating(false);
    }
  };

  return (
    <div className="ai-aging-page">
      {/* How it Works Banner */}
      <div className="how-it-works card">
        <h4>AI Aging Process</h4>
        <div className="steps-row">
          <div className={`hiw-step ${currentStep >= 1 ? 'active-step' : ''}`}>
            <div className="hiw-icon"><UploadCloud size={20} /></div>
            <div className="hiw-text">
              <span className="hiw-num">1</span>
              <span>Upload Image</span>
            </div>
          </div>
          <ChevronRight className="hiw-arrow" />
          <div className={`hiw-step ${currentStep >= 2 ? 'active-step' : ''}`}>
            <div className="hiw-icon"><FileSearch size={20} /></div>
            <div className="hiw-text">
              <span className="hiw-num">2</span>
              <span>Image Scan</span>
            </div>
          </div>
          <ChevronRight className="hiw-arrow" />
          <div className={`hiw-step ${currentStep >= 3 ? 'active-step' : ''}`}>
            <div className="hiw-icon"><Activity size={20} /></div>
            <div className="hiw-text">
              <span className="hiw-num">3</span>
              <span>AI Aging Process</span>
            </div>
          </div>
          <ChevronRight className="hiw-arrow" />
          <div className={`hiw-step ${currentStep >= 4 ? 'active-step' : ''}`}>
            <div className="hiw-icon"><CheckCircle2 size={20} /></div>
            <div className="hiw-text">
              <span className="hiw-num">4</span>
              <span>Result Matches</span>
            </div>
          </div>
        </div>
      </div>

      <div className="aging-grid">
        {/* Left Column - Upload */}
        <div className="card upload-card">
          <h4>Upload Subject Photo</h4>
          <div className="aging-settings">
            <label className="settings-label mono">SIMULATION INTERVAL</label>
            <select className="input-field select-field" disabled={isSimulating}>
              <option value="+2">+2 Years (Future)</option>
              <option value="+5">+5 Years (Future)</option>
              <option value="+10">+10 Years (Future)</option>
              <option value="-2">-2 Years (Past)</option>
              <option value="-5">-5 Years (Past)</option>
              <option value="-10">-10 Years (Past)</option>
            </select>
          </div>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            style={{ display: 'none' }} 
          />
          
          <div 
            className={`dropzone ${selectedImage ? 'has-image' : ''} ${isSimulating || !matcherReady ? 'disabled' : ''}`}
            onClick={handleAreaClick}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {selectedImage ? (
               <div className="preview-container">
                 <img src={selectedImage} alt="Preview" className="image-preview" />
                 {!isSimulating && (
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
            onClick={runSimulation}
            disabled={!selectedImage || isSimulating || !matcherReady}
          >
            {isSimulating ? (
              <><Loader2 className="spin" size={18} /> Simulating...</>
            ) : !matcherReady ? (
              <><Loader2 className="spin" size={18} /> Loading Models...</>
            ) : (
              'Simulate Aging & Find Match'
            )}
          </button>
        </div>

        {/* Right Column - Results */}
        <div className="card results-card">
          <h4>Closest Match</h4>
          
          {isSimulating || (!matcherReady && selectedImage) ? (
            <div className="empty-results simulation-active">
              <Loader2 className="spin highlight-icon" size={48} />
              <p className="mono">{!matcherReady ? 'CONNECTING TO INTELLIGENCE DATABASE...' : 'ANALYZING FACIAL STRUCTURE...'}</p>
              <span>{
                !matcherReady 
                ? 'Awaiting secure TLS handshake. If this takes longer than 5 seconds, please accept the self-signed certificate on port 3000.'
                : 'Cross-referencing database arrays.'
              }</span>
            </div>
          ) : simulationComplete && selectedImage ? (
            <div className="match-result-view">
              <div className="result-images-split">
                <div className="result-side">
                  <span className="label mono">INPUT IMAGE</span>
                  <div className="img-box original">
                    <img src={selectedImage} alt="Original" />
                  </div>
                </div>
                <div className="result-side">
                  <span className="label mono highlight">DATASET MATCH</span>
                  <div className="img-box predicate">
                    <img src={matchResult ? matchResult.src : selectedImage} alt="Match" style={matchResult ? {} : { filter: 'grayscale(1) opacity(0.5)' }}/>
                    {isSimulating && <div className="scan-line"></div>}
                  </div>
                </div>
              </div>
              
              <div className="match-identity-box">
                {matchResult ? (
                  <>
                    <div className="identity-header">
                      <div className="avatar-dummy" style={{ backgroundImage: `url(${matchResult.src})`, backgroundSize: 'cover' }}></div>
                      <div className="identity-info">
                        <h5>{matchResult.name}</h5>
                        <div className="tags">
                          <span className="badge badge-red">VERIFIED KNOWN</span>
                        </div>
                      </div>
                    </div>
                    <div className="identity-score">
                      <span className="badge badge-amber mono score-badge">{matchResult.conf}% CONFIDENT</span>
                    </div>
                  </>
                ) : (
                  <div className="identity-header">
                    <div className="avatar-dummy" style={{ background: '#555963' }}></div>
                    <div className="identity-info">
                      <h5>No Matches Found</h5>
                      <div className="tags">
                        <span className="badge">UNKNOWN IDENTITY</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-results">
              <div className="empty-icon"><UserCircle size={32} /></div>
              <p>{!matcherReady ? 'Connection Error' : 'Awaiting Image'}</p>
              <span>{
                !matcherReady 
                ? `Cannot connect to Server. Please open a new tab to ${import.meta.env.VITE_API_URL} and click "Advanced" -> "Proceed" to accept the SSL certificate, then refresh this page.`
                : 'Upload an image and run the simulation to view predictions and database matches.'
              }</span>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
}
