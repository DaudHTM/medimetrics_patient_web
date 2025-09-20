import React from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function SignIn() {
  const { signInWithGoogle, loading } = useAuth();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 24 }}>
      <h2>Sign in</h2>
      <button
        onClick={() => signInWithGoogle()}
        disabled={loading}
        style={{ padding: '8px 16px', fontSize: 16 }}
      >
        Sign in with Google
      </button>
      {loading && <p>Signing in…</p>}
    </div>
  );
}
