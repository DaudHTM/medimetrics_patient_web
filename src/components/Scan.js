import React, { useRef, useState } from 'react';

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
                        <strong>Fingers</strong>
                        <ul>
                          {Object.entries(hand.fingers).map(([name, info]) => (
                            <li key={name}>
                              {name}: total = {info.total.toFixed(2)} mm; segments = [{info.segments.map(s=>s.toFixed(2)).join(', ')}]
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <strong>Landmarks (first 5 shown)</strong>
                        <ol>
                          {hand.landmarks_px.slice(0, 5).map((pt, i) => (
                            <li key={i}>px: [{pt[0].toFixed(1)}, {pt[1].toFixed(1)}] — mm: [{hand.landmarks_mm[i][0].toFixed(1)}, {hand.landmarks_mm[i][1].toFixed(1)}]</li>
                          ))}
                        </ol>
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
            <h4>Full response</h4>
            <pre style={{ background: '#f6f6f6', padding: 8, borderRadius: 6, maxHeight: 300, overflow: 'auto' }}>{JSON.stringify(resultJson, null, 2)}</pre>
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
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
// Note: the Scan component now only fetches and displays JSON measurements
