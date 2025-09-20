import React from 'react';

export default function Requests() {
  const dummy = [
    { id: 1, title: 'Request blood test', status: 'Sent' },
  ];

  return (
    <div className="tab-panel">
      <h3>Requests</h3>
      <ul>
        {dummy.map((r) => (
          <li key={r.id}>{r.title} — {r.status}</li>
        ))}
      </ul>
    </div>
  );
}
