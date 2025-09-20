import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';

export default function PersonnelHome(){
  const { user, signOutUser } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [requestEmail, setRequestEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);

  const [patientScans, setPatientScans] = useState([]); // flattened scans with patient info
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [selectedScan, setSelectedScan] = useState(null);
  const patientsUnsubRef = useRef([]);

  useEffect(() => {
    if (!user) return;
    setLoadingPatients(true);
    // find users who have allowed this HCP (assume users/{uid}.allowedHcps is array of uids)
    const usersCol = collection(db, 'users');
    const q = query(usersCol, where('allowedHcps', 'array-contains', user.uid));
    const unsubUsers = onSnapshot(q, (snap) => {
      // unsubscribe previous patient scan listeners
      patientsUnsubRef.current.forEach((u) => u());
      patientsUnsubRef.current = [];
      const patients = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
      // for each patient, subscribe to their scans collection
      const allScans = [];
      patients.forEach((p) => {
        const scansCol = collection(db, 'users', p.uid, 'scans');
        const q2 = query(scansCol, orderBy('timestamp', 'desc'), limit(50));
        const unsub = onSnapshot(q2, (s2) => {
          // remove existing scans for this patient
          setPatientScans((prev) => {
            const filtered = prev.filter(x => x.patientUid !== p.uid);
            const newItems = s2.docs.map(d => ({ id: d.id, patientUid: p.uid, patientName: p.email || p.uid, ...d.data() }));
            return [...filtered, ...newItems];
          });
        });
        patientsUnsubRef.current.push(unsub);
      });
      setLoadingPatients(false);
    }, (err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to query allowed patients', err);
      setLoadingPatients(false);
    });

    return () => {
      unsubUsers();
      patientsUnsubRef.current.forEach((u) => u());
    };
  }, [user]);

  const openModal = () => {
    setMessage(null);
    setRequestEmail('');
    setShowModal(true);
  };

  const sendRequest = async () => {
    setMessage(null);
    if (!requestEmail || !requestEmail.includes('@')) {
      setMessage({ type: 'error', text: 'Please enter a valid email address.' });
      return;
    }
    setSending(true);
    try {
      const col = collection(db, 'hcp_requests');
      await addDoc(col, {
        email: requestEmail,
        requestedBy: { uid: user.uid, email: user.email },
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      setMessage({ type: 'success', text: 'Request sent.' });
      setRequestEmail('');
      setTimeout(() => setShowModal(false), 900);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to send request', err);
      setMessage({ type: 'error', text: 'Failed to send request.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Healthcare Personnel</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={openModal} style={{ padding: '8px 12px' }}>Send request</button>
          <button onClick={() => signOutUser()} style={{ padding: '8px 12px' }}>Sign out</button>
        </div>
      </div>
      <p>Welcome{user && user.displayName ? `, ${user.displayName}` : ''}. This view is for healthcare personnel.</p>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', zIndex: 1200 }}>
          <div style={{ background: '#fff', padding: 18, borderRadius: 8, width: 420, maxWidth: '94%' }}>
            <h3 style={{ marginTop: 0 }}>Send request</h3>
            <p>Enter the email address of the person you want to get measurements from:</p>
            <input value={requestEmail} onChange={(e) => setRequestEmail(e.target.value)} placeholder="email@example.com" style={{ width: '100%', padding: 8, marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} disabled={sending}>Cancel</button>
              <button onClick={sendRequest} disabled={sending}>{sending ? 'Sending...' : 'Done'}</button>
            </div>
            {message && (
              <div style={{ marginTop: 8, color: message.type === 'error' ? '#b00020' : 'green' }}>{message.text}</div>
            )}
          </div>
        </div>
      )}

      <hr style={{ margin: '18px 0' }} />
      <h3>Authorized patient scans</h3>
      {loadingPatients && <div>Loading patients…</div>}
      {!loadingPatients && patientScans.length === 0 && <div>No patient scans available yet.</div>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {patientScans
          .slice()
          .sort((a, b) => {
            const ta = a.timestamp && a.timestamp.toDate ? a.timestamp.toDate().getTime() : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
            const tb = b.timestamp && b.timestamp.toDate ? b.timestamp.toDate().getTime() : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
            return tb - ta;
          })
          .map((s) => (
            <li key={`${s.patientUid}-${s.id}`} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 8, borderBottom: '1px solid #eee', cursor: 'pointer' }} onClick={() => setSelectedScan(s)}>
              <div style={{ width: 88, height: 66, flex: '0 0 88px' }}>
                {s.annotatedImageUrl ? (
                  <img src={s.annotatedImageUrl} alt={`scan-${s.id}`} style={{ width: '88px', height: '66px', objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }} />
                ) : (
                  <div style={{ width: '88px', height: '66px', background: '#f2f2f2', borderRadius: 6 }} />
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{s.patientName || s.patientUid}</div>
                <div style={{ color: '#666', fontSize: 12 }}>{formatTimestamp(s.timestamp)}</div>
              </div>
              <div style={{ color: '#666', fontSize: 12 }}>{s.measurements ? Object.keys(s.measurements).length + ' measurements' : 'No measurements'}</div>
            </li>
          ))}
      </ul>

      {selectedScan && (
        <div>
          <div className="modal-backdrop" onClick={() => setSelectedScan(null)} />
          <div className="modal-panel" role="dialog" aria-modal="true">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0 }}>Patient: {selectedScan.patientName || selectedScan.patientUid}</h4>
              <button onClick={() => setSelectedScan(null)} style={{ border: 'none', background: 'transparent', fontSize: 18 }}>✕</button>
            </div>
            <div style={{ marginBottom: 8, color: '#666' }}>Scan ID: {selectedScan.id}</div>
            {selectedScan.annotatedImageUrl && (
              <div style={{ marginBottom: 12 }}>
                <img src={selectedScan.annotatedImageUrl} alt="Annotated" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #ddd' }} />
              </div>
            )}
            {selectedScan.scale_mm_per_px && <div>Scale: {selectedScan.scale_mm_per_px} mm/px</div>}
            <div style={{ marginTop: 8 }}>{renderMeasurementsInline(selectedScan)}</div>
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

function renderMeasurementsInline(scan) {
  const m = scan.measurements || null;
  if (!m) return <div>No measurement data.</div>;
  return (
    <div style={{ marginTop: 8, background: '#fff', padding: 8, borderRadius: 6, border: '1px solid #eee' }}>
      <h5 style={{ marginTop: 0 }}>Measurements</h5>
      <ul style={{ margin: 0, paddingLeft: 16 }}>
        {Object.entries(m).map(([k, v]) => (
          <li key={k}>{k.replace(/_/g, ' ')}: {typeof v === 'number' ? Number(v).toFixed(3) : String(v)} mm</li>
        ))}
      </ul>
    </div>
  );
}
