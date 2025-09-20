import React from 'react';
import './App.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import SignIn from './components/SignIn';
import Home from './components/Home';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;

  return user ? <Home /> : <SignIn />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
