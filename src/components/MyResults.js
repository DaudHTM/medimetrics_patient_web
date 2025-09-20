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
    const q = query(scansCol, orderBy('createdAt', 'desc'), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setScans(items);
      setLoading(false);
    }, (err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to listen to scans', err);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  const selectScan = (scan) => {
    // Toggle: if clicking the already selected scan, collapse it
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
          <li key={s.id} className="result-item" onClick={() => selectScan(s)} style={{ cursor: 'pointer' }}>
            <div className="result-title">Scan {s.id}</div>
            <div className="result-meta">{s.createdAt && s.createdAt.toDate ? s.createdAt.toDate().toLocaleString() : '—'}</div>
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
            <div style={{ marginTop: 8 }}>{renderMeasurements(selected)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function renderMeasurements(selected) {
  // Prefer saved 'measurements' then 'resultJson'
  const data = selected.measurements || selected.resultJson || null;
  if (!data) return <div>No measurement data saved.</div>;

  const scale = data.scale_mm_per_px || (data.scale && data.scale_mm_per_px) || null;

  // Attempt to find hands in the saved structure
  const hands = (data.result && data.result.hands) || (data.hands) || null;

  return (
    <div>
      {selected.imageUrl && (
        <div style={{ marginBottom: 12 }}>
          <h5>Annotated image</h5>
          <img src={selected.imageUrl} alt="Annotated" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #ddd' }} />
        </div>
      )}
      {scale && <div>Scale: {scale} mm/px</div>}

      {!hands && (
        <div style={{ marginTop: 8, background: '#f6f6f6', padding: 8, borderRadius: 6 }}>No hand details found in this scan.</div>
      )}

      {hands && hands.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <h5>Hand 1</h5>
          {(() => {
            const hand = hands[0];
            const fingers = hand.fingers || {};
            return (
              <div>
                <div style={{ marginBottom: 8 }} />
                <div>
                  <strong>Finger segments (phalanges)</strong>
                  <div style={{ marginTop: 6 }}>
                    {Object.entries(fingers).map(([fname, finfo]) => (
                      <div key={fname} style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{fname}</div>
                        <ul style={{ margin: '6px 0 0 16px' }}>
                          {(finfo.segments || []).map((seg, idx) => {
                            const labels = ['Wrist-to-knuckle', 'Proximal', 'Middle', 'Distal'];
                            const label = idx < labels.length ? labels[idx] : `Segment ${idx + 1}`;
                            const num = typeof seg === 'number' ? seg : (parseFloat(seg) || 0);
                            return (
                              <li key={idx}>{label}: {Number(num).toFixed(2)} mm</li>
                            );
                          })}
                          <li style={{ marginTop: 4 }}><strong>Total: {(finfo.total || 0).toFixed ? Number(finfo.total).toFixed(2) : String(finfo.total)}</strong></li>
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
    </div>
  );
}
