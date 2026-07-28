"use client";

import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  ReactElement,
} from "react";
import { getSupabase } from "./supabase";

interface User {
  id: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchRole(userId: string): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return "user";
  }
  return (data.role as string) ?? "user";
}

async function userFromSession(session: Session | null): Promise<User | null> {
  if (!session?.user?.email) {
    return null;
  }
  const role = await fetchRole(session.user.id);
  return { id: session.user.id, email: session.user.email, role };
}

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const supabase = getSupabase();

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(await userFromSession(session));
      setLoading(false);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void userFromSession(session).then(setUser);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function login(email: string, password: string) {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
    setUser(await userFromSession(data.session));
    router.push("/dashboard");
  }

  async function register(email: string, password: string) {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      throw error;
    }

    if (!data.session) {
      // Email confirmation is required before a session exists.
      throw new Error("Check your email to confirm your account before signing in.");
    }

    setUser(await userFromSession(data.session));
    router.push("/dashboard");
  }

  function logout() {
    const supabase = getSupabase();
    void supabase.auth.signOut();
    setUser(null);
    router.push("/sign-in");
  }

  async function refreshUser() {
    const supabase = getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    setUser(await userFromSession(session));
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
