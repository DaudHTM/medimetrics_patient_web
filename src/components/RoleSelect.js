import React from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function RoleSelect() {
  const { showRolePrompt, setUserRole, user } = useAuth();
  if (!showRolePrompt) return null;

  return (
    <div className="role-select-backdrop">
      <div className="role-select-panel">
        <h3>Welcome{user && user.displayName ? `, ${user.displayName}` : ''}!</h3>
        <p>Are you signing in as a patient or a healthcare professional?</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={() => setUserRole('patient')}>Patient</button>
          <button onClick={() => setUserRole('hcp')}>Healthcare professional</button>
        </div>
      </div>
    </div>
  );
}
