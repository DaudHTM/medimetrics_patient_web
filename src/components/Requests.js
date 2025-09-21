import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp, arrayUnion, setDoc } from 'firebase/firestore';

export default function Requests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    // listen for requests where email matches the user's email and status is pending
    const col = collection(db, 'hcp_requests');
    const q = query(col, where('email', '==', user.email));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRequests(items);
      setLoading(false);
    }, (err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to listen to requests', err);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  const respond = async (requestObj, accept) => {
    try {
      const ref = doc(db, 'hcp_requests', requestObj.id);
      await updateDoc(ref, {
        status: accept ? 'accepted' : 'declined',
        respondedBy: user ? { uid: user.uid, email: user.email } : null,
        respondedAt: serverTimestamp(),
      });

      // If the patient accepted the request, add the requesting HCP uid to this patient's allowedHcps
      if (accept && requestObj.requestedBy && requestObj.requestedBy.uid) {
        const patientRef = doc(db, 'users', user.uid);
        // Use setDoc with merge to ensure the user doc exists and arrayUnion to append the HCP uid
        await setDoc(patientRef, { allowedHcps: arrayUnion(requestObj.requestedBy.uid) }, { merge: true });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to respond to request', err);
      alert('Failed to update request');
    }
  };

  return (
    <div className="tab-panel container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Requests</h3>
      </div>
      {loading && <div>Loading…</div>}
      {!loading && requests.length === 0 && <div>No requests found.</div>}
      <ul style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
        {requests.map((r) => (
          <li key={r.id} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{r.requestedBy?.email || 'Unknown'}</div>
                <div className="meta">Requested {r.createdAt && r.createdAt.toDate ? r.createdAt.toDate().toLocaleString() : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="meta">Status: {r.status}</div>
                {r.status === 'pending' && (
                  <div style={{ marginTop: 8 }}>
                    <button className="btn btn-primary" onClick={() => respond(r, true)} style={{ marginRight: 8 }}>Accept</button>
                    <button className="btn btn-ghost" onClick={() => respond(r, false)}>Decline</button>
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
