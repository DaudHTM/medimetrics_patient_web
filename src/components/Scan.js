import React, { useRef, useState } from 'react';
import { db, storage } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../contexts/AuthContext';

// Sanitize data for Firestore: Firestore rejects nested arrays (arrays containing arrays).
// This function recursively converts any nested arrays into objects (maps) so the
// final structure contains arrays of primitives or arrays of maps, which Firestore accepts.
function sanitizeForFirestore(value) {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    // Map each element; if an element is itself an array, convert it to an object
    return value.map((el) => {
      if (Array.isArray(el)) {
        const obj = {};
        el.forEach((sub, i) => {
          obj[i] = sanitizeForFirestore(sub);
        });
        return obj;
      }
      return sanitizeForFirestore(el);
    });
  }

  if (typeof value === 'object') {
    const out = {};
    Object.entries(value).forEach(([k, v]) => {
      out[k] = sanitizeForFirestore(v);
    });
    return out;
  }

  return value;
}

export default function Scan() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [measurements, setMeasurements] = useState(null);
  const [resultJson, setResultJson] = useState(null);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      videoRef.current.srcObject = s;
      await videoRef.current.play();
      setStream(s);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Could not start camera', err);
      alert('Could not access camera. Please allow camera permission or use Upload.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  };

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    setPreviewSrc(dataUrl);
    stopCamera();
  };

  const onFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => setPreviewSrc(reader.result);
    reader.readAsDataURL(file);
  };

  const startScan = async () => {
    if (!previewSrc) {
      alert('Please capture or upload an image first');
      return;
    }
  setScanning(true);
  setMeasurements(null);
  setResultJson(null);
  setError(null);
    try {
      // Build FormData like the Python client example (field name 'file')
      const form = new FormData();
      if (selectedFile) {
        form.append('file', selectedFile, selectedFile.name);
      } else {
        // Convert data URL to Blob
        const resData = await (await fetch(previewSrc)).blob();
        form.append('file', resData, 'capture.png');
      }

      const res = await fetch('http://127.0.0.1:8000/measure-hand', {
        method: 'POST',
        body: form,
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = (json && (json.error || JSON.stringify(json))) || `Request failed with status ${res.status}`;
        setError(msg);
        return;
      }

      setResultJson(json);

      // Handle example response shape: top-level scale_mm_per_px and result.hands
      if (json && (json.scale_mm_per_px || json.result)) {
        const obj = { scale_mm_per_px: json.scale_mm_per_px, result: json.result };
        setMeasurements(obj);
      } else if (json && json.measurements) {
        setMeasurements(json.measurements);
      } else if (json && json.data) {
        setMeasurements(json.data);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Scan request failed', err);
      setError(String(err) || 'Scan failed to fetch');
    } finally {
      setScanning(false);
    }
  };

  const uploadResults = async () => {
    if (!user) {
      alert('You must be signed in to upload results');
      return;
    }
    if (!measurements && !resultJson) {
      alert('No results to upload');
      return;
    }

    try {
      // If the backend returned an annotated image (base64), upload it to Storage first
      let imageUrl = null;
      try {
        const annotated = resultJson && resultJson.annotated_image_b64;
        if (annotated) {
          let dataUrl = annotated;
          if (!dataUrl.startsWith('data:')) {
            dataUrl = `data:image/png;base64,${dataUrl}`;
          }
          const path = `users/${user.uid}/scans/annotated-${Date.now()}-${Math.floor(Math.random() * 1e6)}.png`;
          const sRef = storageRef(storage, path);
          // uploadString supports data_url format
          await uploadString(sRef, dataUrl, 'data_url');
          imageUrl = await getDownloadURL(sRef);
        }
      } catch (imgErr) {
        // eslint-disable-next-line no-console
        console.error('Failed to upload annotated image to Storage', imgErr);
        // Continue without failing the whole upload; the payload will simply omit imageUrl
      }

      const userScansCol = collection(db, 'users', user.uid, 'scans');
      const payload = {
        userId: user.uid,
        createdAt: serverTimestamp(),
        measurements: measurements ? sanitizeForFirestore(measurements) : null,
        resultJson: resultJson ? sanitizeForFirestore(resultJson) : null,
        imageUrl: imageUrl || null,
      };

      const docRef = await addDoc(userScansCol, payload);
      // eslint-disable-next-line no-console
      console.log('Uploaded scan document:', docRef.id, 'imageUrl:', imageUrl);
      alert('Results uploaded successfully');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to upload results', err);
      alert('Upload failed: ' + (err.message || String(err)));
    }
  };

  return (
    <div className="tab-panel">
      <h3>Scan</h3>

      <div className="scan-controls">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label className="upload-btn">
            Upload Image
            <input type="file" accept="image/*" onChange={onFileChange} style={{ display: 'none' }} />
          </label>

          {!stream && (
            <button onClick={startCamera} style={{ padding: '8px 12px' }}>Take Image</button>
          )}

          {stream && (
            <button onClick={capture} style={{ padding: '8px 12px' }}>Capture</button>
          )}

          <button onClick={startScan} style={{ padding: '8px 12px' }} disabled={scanning}>
            {scanning ? 'Scanning…' : 'Start Scan'}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {stream && (
          <div>
            <video ref={videoRef} style={{ width: '100%', maxHeight: 360, borderRadius: 8 }} />
            <div style={{ marginTop: 8 }}>
              <button onClick={stopCamera}>Stop Camera</button>
            </div>
          </div>
        )}

        {previewSrc && (
          <div style={{ marginTop: 12 }}>
            <div>Preview:</div>
            <img src={previewSrc} alt="preview" style={{ width: '100%', borderRadius: 8, marginTop: 8 }} />
          </div>
        )}

        {error && <div style={{ color: 'red', marginTop: 12 }}>{error}</div>}

        {measurements && (
          <div style={{ marginTop: 12 }}>
            <h4>Measurements</h4>
            {measurements.scale_mm_per_px && (
              <div>Scale: {measurements.scale_mm_per_px} mm/px</div>
            )}

            {measurements.result && measurements.result.hands && measurements.result.hands.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <h5>Hand 1</h5>
                {(() => {
                  const hand = measurements.result.hands[0];
                  return (
                    <div>
                      <div style={{ marginBottom: 8 }}>
                     
                      </div>

                      <div>
                        <strong>Finger segments (phalanges)</strong>
                        <div style={{ marginTop: 6 }}>
                          {Object.entries(hand.fingers).map(([fname, finfo]) => (
                            <div key={fname} style={{ marginBottom: 8 }}>
                              <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{fname}</div>
                              <ul style={{ margin: '6px 0 0 16px' }}>
                                {finfo.segments.map((seg, idx) => {
                                  // Map segment indexes to anatomical labels per user's spec:
                                  // index 0 = Wrist-to-knuckle, 1 = Proximal, 2 = Middle, 3 = Distal
                                  const labels = ['Wrist-to-knuckle', 'Proximal', 'Middle', 'Distal'];
                                  const label = idx < labels.length ? labels[idx] : `Segment ${idx + 1}`;
                                  return (
                                    <li key={idx}>{label}: {seg.toFixed(2)} mm</li>
                                  );
                                })}
                                <li style={{ marginTop: 4 }}><strong>Total: {finfo.total.toFixed(2)} mm</strong></li>
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {!measurements.result && (
              <pre style={{ background: '#f6f6f6', padding: 8, borderRadius: 6 }}>{JSON.stringify(measurements, null, 2)}</pre>
            )}
          </div>
        )}

        {resultJson && (
          <div style={{ marginTop: 12 }}>
           
            {resultJson.annotated_image_b64 && (
              <div style={{ marginTop: 12 }}>
                <h4>Annotated Image</h4>
                <img
                  src={resultJson.annotated_image_b64.startsWith('data:') ? resultJson.annotated_image_b64 : `data:image/png;base64,${resultJson.annotated_image_b64}`}
                  alt="Annotated"
                  style={{ maxWidth: '100%', height: 'auto', border: '1px solid #ccc' }}
                />
              </div>
            )}
          </div>
        )}
        {/* Upload results button placed after annotated image / measurements */}
        {(measurements || resultJson) && (
          <div style={{ marginTop: 16 }}>
            <button onClick={uploadResults} style={{ padding: '8px 12px' }}>Upload Results</button>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
// Note: the Scan component now only fetches and displays JSON measurements
