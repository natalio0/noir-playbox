"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

import { onAuthStateChanged, User } from "firebase/auth";

import { auth } from "@/lib/firebase";
import {
  clearAuthenticatedProfileCache,
  getAuthenticatedProfile,
} from "@/lib/auth-profile-client";

import type { UserProfile } from "@/lib/auth";

type AuthContextType = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      setUser(firebaseUser);

      if (!firebaseUser) {
        clearAuthenticatedProfileCache();
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const nextProfile =
          await getAuthenticatedProfile(firebaseUser);

        setProfile(nextProfile);
      } catch (error) {
        console.error("AUTH PROFILE ERROR:", error);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
