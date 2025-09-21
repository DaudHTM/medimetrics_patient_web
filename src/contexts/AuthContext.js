import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';

const AuthContext = createContext();

// Helper function to detect mobile devices
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         (window.screen && window.screen.width < 768);
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Check if we're expecting a redirect result on initial load
  const [loading, setLoading] = useState(
    localStorage.getItem('authRedirectPending') === 'true' || true
  );
  const [role, setRole] = useState(null); // 'patient' | 'hcp' | null (unknown)
  const [showRolePrompt, setShowRolePrompt] = useState(false);
  const provider = new GoogleAuthProvider();

  const signInWithGoogle = async () => {
    try {
      if (isMobileDevice()) {
        // Use redirect flow for mobile devices
        // Set loading state in localStorage so it persists through redirect
        localStorage.setItem('authRedirectPending', 'true');
        setLoading(true);
        await signInWithRedirect(auth, provider);
        // Note: this code won't execute because the page will redirect
      } else {
        // Use popup flow for desktop
        setLoading(true);
        await signInWithPopup(auth, provider);
        setLoading(false);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Google sign-in error', err);
      // Clear the pending flag if there was an error
      localStorage.removeItem('authRedirectPending');
      setLoading(false);
      throw err;
    }
  };

  const signOutUser = async () => {
    try {
      setLoading(true);
      await firebaseSignOut(auth);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    // Handle redirect result first (for mobile sign-in)
    const handleRedirectResult = async () => {
      try {
        // Check if we were expecting a redirect result
        const wasRedirectPending = localStorage.getItem('authRedirectPending') === 'true';
        
        if (wasRedirectPending) {
          setLoading(true);
        }
        
        const result = await getRedirectResult(auth);
        if (result && mounted) {
          // User successfully signed in via redirect
          console.log('Redirect sign-in successful', result.user);
          localStorage.removeItem('authRedirectPending');
          // Don't set loading to false here - let onAuthStateChanged handle it
        } else if (mounted) {
          // No redirect result
          localStorage.removeItem('authRedirectPending');
          if (!wasRedirectPending) {
            // Only set loading to false if we weren't expecting a redirect
            setLoading(false);
          }
        }
      } catch (err) {
        console.error('Redirect sign-in error', err);
        localStorage.removeItem('authRedirectPending');
        if (mounted) {
          setLoading(false);
        }
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!mounted) return;
      
      setUser(u);
      // when auth state changes, determine role from Firestore
      (async () => {
        if (!mounted) return;
        setLoading(true);
        setRole(null);
        setShowRolePrompt(false);
        try {
          if (u) {
            // check users/{uid} doc for explicit role
            const userDocRef = doc(db, 'users', u.uid);
            const userSnap = await getDoc(userDocRef);
            if (userSnap.exists()) {
              const data = userSnap.data();
              if (data && data.role) {
                if (mounted) {
                  setRole(data.role);
                  setShowRolePrompt(false);
                  setLoading(false);
                }
                return;
              }
            }

            // check central admin doc for healthcare professionals
            const adminRef = doc(db, 'admin', 'healthcare_professionals');
            const adminSnap = await getDoc(adminRef);
            if (adminSnap.exists()) {
              const ad = adminSnap.data();
              const members = ad && ad.members ? ad.members : [];
              const found = members.find((m) => m.uid === u.uid || m.email === u.email);
              if (found) {
                // treat as hcp
                if (mounted) {
                  setRole('hcp');
                  // also ensure users/{uid} has role
                  await setDoc(userDocRef, { role: 'hcp', email: u.email, uid: u.uid }, { merge: true });
                  setLoading(false);
                }
                return;
              }
            }

            // otherwise, no known role — prompt the user to choose
            if (mounted) {
              setRole(null);
              setShowRolePrompt(true);
            }
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Error resolving user role', err);
        } finally {
          if (mounted) {
            setLoading(false);
          }
        }
      })();
    });

    // Start by handling any pending redirect result
    handleRedirectResult();

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // set role helper used by RoleSelect component
  const setUserRole = async (newRole) => {
    if (!user) return;
    const userDocRef = doc(db, 'users', user.uid);
    try {
      // persist user role
      await setDoc(userDocRef, { role: newRole, email: user.email, uid: user.uid }, { merge: true });
      setRole(newRole);
      setShowRolePrompt(false);

      if (newRole === 'hcp') {
        // register in central admin doc
        const adminRef = doc(db, 'admin', 'healthcare_professionals');
        await updateDoc(adminRef, {
          members: arrayUnion({ uid: user.uid, email: user.email }),
        }).catch(async (err) => {
          // if doc doesn't exist, create it
          await setDoc(adminRef, { members: [{ uid: user.uid, email: user.email }] });
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to set user role', err);
      throw err;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, role, showRolePrompt, setUserRole, signInWithGoogle, signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
