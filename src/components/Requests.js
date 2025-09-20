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
    <div className="tab-panel">
      <h3>Requests</h3>
      {loading && <div>Loading…</div>}
      {!loading && requests.length === 0 && <div>No requests found.</div>}
      <ul>
        {requests.map((r) => (
          <li key={r.id} style={{ marginBottom: 8 }}>
            <div><strong>Request from:</strong> {r.requestedBy?.email || 'Unknown'}</div>
            <div><strong>Status:</strong> {r.status}</div>
            <div style={{ marginTop: 6 }}>
              {r.status === 'pending' && (
                <>
                  <button onClick={() => respond(r, true)} style={{ marginRight: 8 }}>Accept</button>
                  <button onClick={() => respond(r, false)}>Decline</button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
