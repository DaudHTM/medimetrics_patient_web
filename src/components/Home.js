import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import MyResults from './MyResults';
import Scan from './Scan';
import Requests from './Requests';

export default function Home() {
  const { user, signOutUser } = useAuth();
  const [active, setActive] = useState('results');

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="user-info">
          {user && (
            <>
              <img src={user.photoURL} alt="avatar" className="user-avatar" />
              <div className="user-name">{user.displayName || user.email}</div>
            </>
          )}
        </div>
        <button className="signout-btn" onClick={() => signOutUser()}>
          Sign out
        </button>
      </header>

      <main className="app-main">
        {active === 'results' && <MyResults />}
        {active === 'scan' && <Scan />}
        {active === 'requests' && <Requests />}
      </main>

      <nav className="tab-bar">
        <button className={`tab-btn ${active === 'results' ? 'active' : ''}`} onClick={() => setActive('results')}>My Results</button>
        <button className={`tab-btn ${active === 'scan' ? 'active' : ''}`} onClick={() => setActive('scan')}>Scan</button>
        <button className={`tab-btn ${active === 'requests' ? 'active' : ''}`} onClick={() => setActive('requests')}>Requests</button>
      </nav>
    </div>
  );
}
