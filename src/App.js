import React from 'react';
import './App.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import SignIn from './components/SignIn';
import Home from './components/Home';
import RoleSelect from './components/RoleSelect';
import PersonnelHome from './components/PersonnelHome';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;

  if (!user) return <SignIn />;

  return (
    <>
      <RoleSelect />
      {/* if role is 'hcp' show personnel home, otherwise show normal Home */}
      {/* role is available from useAuth via context */}
      <RoleBasedApp />
    </>
  );
}

function RoleBasedApp(){
  const { role } = useAuth();
  if (role === 'hcp') return <PersonnelHome />;
  // default to patient home
  return <Home />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
