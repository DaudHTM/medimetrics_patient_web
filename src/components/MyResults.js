import React from 'react';

export default function MyResults() {
  // Placeholder results list — replace with real data fetching
  const dummy = [
    { id: 1, title: 'Blood test', date: '2025-09-01', status: 'Available' },
    { id: 2, title: 'X-Ray', date: '2025-08-15', status: 'Processing' },
  ];

  return (
    <div className="tab-panel">
      <h3>My Results</h3>
      <ul className="results-list">
        {dummy.map((r) => (
          <li key={r.id} className="result-item">
            <div className="result-title">{r.title}</div>
            <div className="result-meta">{r.date} · {r.status}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
