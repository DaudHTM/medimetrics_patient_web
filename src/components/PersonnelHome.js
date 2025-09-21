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

  const exportToCSV = (scan) => {
    if (!scan || !scan.measurements) {
      alert('No measurements to export');
      return;
    }

    // Create CSV content
    const headers = ['Measurement', 'Value (mm)', 'Timestamp', 'Patient', 'Scan ID', 'Scan Type'];
    const timestamp = formatTimestamp(scan.timestamp);
    const patientName = scan.patientName || scan.patientUid;
    const scanType = scan.scanType || 'Unknown';

    const rows = Object.entries(scan.measurements).map(([key, value]) => [
      key.replace(/_/g, ' '),
      typeof value === 'number' ? Number(value).toFixed(3) : String(value),
      timestamp,
      patientName,
      scan.id,
      scanType
    ]);

    // Convert to CSV format
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(field => `"${field}"`).join(','))
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `measurements_${patientName}_${scan.id}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <div className="title-lg">Healthcare Personnel</div>
          <div className="subtitle">Welcome{user && user.displayName ? `, ${user.displayName}` : ''}. This view is for healthcare personnel.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={openModal}>Send request</button>
          <button className="btn btn-ghost" onClick={() => signOutUser()}>Sign out</button>
        </div>
      </div>

      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-panel card" role="dialog" aria-modal="true" style={{ width: 420, maxWidth: '94%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Send request</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <p>Enter the email address of the person you want to get measurements from:</p>
            <input value={requestEmail} onChange={(e) => setRequestEmail(e.target.value)} placeholder="email@example.com" />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)} disabled={sending}>Cancel</button>
              <button className="btn btn-primary" onClick={sendRequest} disabled={sending}>{sending ? 'Sending...' : 'Done'}</button>
            </div>
            {message && (
              <div style={{ marginTop: 8, color: message.type === 'error' ? '#b00020' : 'var(--cyan-700)' }}>{message.text}</div>
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop: '18px' }}>
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
            <li key={`${s.patientUid}-${s.id}`} className="list-item card" onClick={() => setSelectedScan(s)}>
              <div className="thumb">
                {s.annotatedImageUrl ? (
                  <img src={s.annotatedImageUrl} alt={`scan-${s.id}`} />
                ) : (
                  <div style={{ width: '88px', height: '66px', background: '#eefcff' }} />
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div className="patient-name">{s.patientName || s.patientUid}</div>
                <div className="meta">{formatTimestamp(s.timestamp)}</div>
              </div>
              <div className="meta">{s.measurements ? Object.keys(s.measurements).length + ' measurements' : 'No measurements'}</div>
            </li>
          ))}
        </ul>
      </div>

      {selectedScan && (
        <div>
          <div className="modal-backdrop" onClick={() => setSelectedScan(null)} />
          <div className="modal-panel card" role="dialog" aria-modal="true">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0 }}>Patient: {selectedScan.patientName || selectedScan.patientUid}</h4>
              <button className="modal-close" onClick={() => setSelectedScan(null)}>✕</button>
            </div>
            <div className="meta" style={{ marginBottom: 8 }}>Scan ID: {selectedScan.id}</div>
            {selectedScan.annotatedImageUrl && (
              <div style={{ marginBottom: 12 }}>
                <img src={selectedScan.annotatedImageUrl} alt="Annotated" style={{ maxWidth: '100%', borderRadius: 8 }} />
              </div>
            )}
            {selectedScan.scale_mm_per_px && <div className="meta">Scale: {selectedScan.scale_mm_per_px} mm/px</div>}
            <div style={{ marginTop: 8 }}>{renderMeasurementsInline(selectedScan)}</div>
            
            {/* Export button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingTop: 16, borderTop: '1px solid #eee' }}>
              <button 
                className="btn btn-primary" 
                onClick={() => exportToCSV(selectedScan)}
                disabled={!selectedScan.measurements || Object.keys(selectedScan.measurements).length === 0}
              >
                📊 Export CSV
              </button>
            </div>
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
