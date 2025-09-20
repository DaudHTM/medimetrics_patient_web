import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';

export default function MyResults() {
  const { user } = useAuth();
  const [scans, setScans] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setScans([]);
      return;
    }

    setLoading(true);
    const scansCol = collection(db, 'users', user.uid, 'scans');
    const q = query(scansCol, orderBy('timestamp', 'desc'), limit(200));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setScans(items);
        setLoading(false);
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to listen to scans', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user]);

  const selectScan = (scan) => {
    if (selected && selected.id === scan.id) {
      setSelected(null);
    } else {
      setSelected(scan);
    }
  };

  return (
    <div className="tab-panel">
      <h3>My Results</h3>

      {loading && <div>Loading…</div>}

      {!loading && scans.length === 0 && (
        <div>No scans uploaded yet.</div>
      )}

      <ul className="results-list">
        {scans.map((s) => (
          <li key={s.id} className="result-item" onClick={() => selectScan(s)} style={{ cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 88, height: 66, flex: '0 0 88px' }}>
              {s.annotatedImageUrl ? (
                <img src={s.annotatedImageUrl} alt={`scan-${s.id}`} style={{ width: '88px', height: '66px', objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }} />
              ) : (
                <div style={{ width: '88px', height: '66px', background: '#f2f2f2', borderRadius: 6 }} />
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{s.scanType ? capitalize(s.scanType) : 'Scan'}</div>
              <div style={{ color: '#666', fontSize: 12 }}>{formatTimestamp(s.timestamp)}</div>
            </div>
            <div style={{ color: '#666', fontSize: 12 }}>{s.measurements ? Object.keys(s.measurements).length + ' measurements' : 'No measurements'}</div>
          </li>
        ))}
      </ul>

      {selected && (
        <div>
          <div className="modal-backdrop" onClick={() => setSelected(null)} />
          <div className="modal-panel" role="dialog" aria-modal="true">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0 }}>Scan details</h4>
              <button onClick={() => setSelected(null)} style={{ border: 'none', background: 'transparent', fontSize: 18 }}>✕</button>
            </div>
            <div style={{ marginBottom: 8, color: '#666' }}>ID: {selected.id}</div>

            {selected.annotatedImageUrl && (
              <div style={{ marginBottom: 12 }}>
                <h5 style={{ marginBottom: 8 }}>Annotated image</h5>
                <img src={selected.annotatedImageUrl} alt="Annotated" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #ddd' }} />
                <div style={{ marginTop: 8 }}>
                  <a href={selected.annotatedImageUrl} target="_blank" rel="noreferrer">Open annotated image</a>
                </div>
              </div>
            )}

            {selected.originalImageUrl && (
              <div style={{ marginBottom: 12 }}>
                <h5 style={{ marginBottom: 8 }}>Original image</h5>
                <a href={selected.originalImageUrl} target="_blank" rel="noreferrer">Open original image</a>
              </div>
            )}

            {selected.scanType && <div>Scan type: <strong>{capitalize(selected.scanType)}</strong></div>}
            {selected.scale_mm_per_px && <div>Scale: {selected.scale_mm_per_px} mm/px</div>}

            {renderMeasurementsSimple(selected)}
          </div>
        </div>
      )}
    </div>
  );
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  if (ts.toDate) return ts.toDate().toLocaleString();
  try {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  } catch (e) {
    return '—';
  }
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function renderMeasurementsSimple(selected) {
  const measurements = selected.measurements || null;
  if (!measurements) return <div style={{ marginTop: 8 }}>No measurement data saved.</div>;
  return (
    <div style={{ marginTop: 8, background: '#fff', padding: 8, borderRadius: 6, border: '1px solid #eee' }}>
      <h5 style={{ marginTop: 0 }}>Measurements</h5>
      <ul style={{ margin: 0, paddingLeft: 16 }}>
        {Object.entries(measurements).map(([k, v]) => (
          <li key={k}>{k.replace(/_/g, ' ')}: {typeof v === 'number' ? Number(v).toFixed(3) : String(v)} mm</li>
        ))}
      </ul>
    </div>
  );
}
