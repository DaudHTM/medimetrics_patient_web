import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

// Helper function to detect mobile devices
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         (window.screen && window.screen.width < 768);
};

export default function SignIn() {
  const { signInWithGoogle, loading } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  const handleSignIn = async () => {
    try {
      setSigningIn(true);
      await signInWithGoogle();
    } catch (error) {
      console.error('Sign-in failed:', error);
      setSigningIn(false);
    }
  };

  const isLoading = loading || signingIn;
  const isMobile = isMobileDevice();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 24 }}>
      <h2>Sign in</h2>
      {isMobile && (
        <p style={{ textAlign: 'center', color: '#666', fontSize: 14, marginBottom: 16 }}>
          You'll be redirected to Google to sign in securely.
        </p>
      )}
      <button
        onClick={handleSignIn}
        disabled={isLoading}
        style={{ 
          padding: '12px 24px', 
          fontSize: 16,
          backgroundColor: isLoading ? '#ccc' : '#4285f4',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: isLoading ? 'not-allowed' : 'pointer'
        }}
      >
        {isLoading ? 'Signing in…' : 'Sign in with Google'}
      </button>
      {isLoading && (
        <p style={{ color: '#666', fontSize: 14, marginTop: 8 }}>
          {isMobile ? 'Redirecting to Google...' : 'Opening sign-in popup...'}
        </p>
      )}
    </div>
  );
}
