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
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null); // 'patient' | 'hcp' | null (unknown)
  const [showRolePrompt, setShowRolePrompt] = useState(false);
  const provider = new GoogleAuthProvider();

  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      
      if (isMobileDevice()) {
        // Use redirect flow for mobile devices
        await signInWithRedirect(auth, provider);
      } else {
        // Use popup flow for desktop
        await signInWithPopup(auth, provider);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Google sign-in error', err);
      throw err;
    } finally {
      // Only set loading to false for popup flow
      // For redirect flow, the page will reload so this won't execute
      if (!isMobileDevice()) {
        setLoading(false);
      }
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
    // Handle redirect result first (for mobile sign-in)
    const handleRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          // User successfully signed in via redirect
          console.log('Redirect sign-in successful', result.user);
        }
      } catch (err) {
        console.error('Redirect sign-in error', err);
      }
    };

    handleRedirectResult();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      // when auth state changes, determine role from Firestore
      (async () => {
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
                setRole(data.role);
                setShowRolePrompt(false);
                setLoading(false);
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
                setRole('hcp');
                // also ensure users/{uid} has role
                await setDoc(userDocRef, { role: 'hcp', email: u.email, uid: u.uid }, { merge: true });
                setLoading(false);
                return;
              }
            }

            // otherwise, no known role — prompt the user to choose
            setRole(null);
            setShowRolePrompt(true);
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Error resolving user role', err);
        } finally {
          setLoading(false);
        }
      })();
    });
    return () => unsubscribe();
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
