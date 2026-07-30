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
import { apiClient } from "./api";
import { getSupabase } from "./supabase";

export type AccountType = "individual" | "business";

interface User {
  id: string;
  email: string;
  role: string;
  fullName: string | null;
  accountType: AccountType;
  businessName: string | null;
  onboarded: boolean;
  // True for an invited staff member of someone else's business -- their
  // own accountType stays "individual" (they never onboarded as a business
  // themselves), so this is tracked separately for routing/gating.
  isBusinessMember: boolean;
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

async function fetchProfile(userId: string): Promise<{ role: string; fullName: string | null }> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return { role: "user", fullName: null };
  }
  return {
    role: (data.role as string) ?? "user",
    fullName: (data.full_name as string | null) ?? null,
  };
}

async function fetchAccountSettings(): Promise<{
  accountType: AccountType;
  businessName: string | null;
  onboarded: boolean;
  isBusinessMember: boolean;
}> {
  try {
    const settings = await apiClient.getMyAccountSettings();
    let onboarded =
      settings.onboarded ||
      settings.account_type === "business" ||
      settings.is_business_member;

    // Older accounts can have dashboard activity but no account_settings row.
    // Do not let a stale/older backend response classify them as brand new.
    if (!onboarded) {
      try {
        const summary = await apiClient.getMySummary();
        onboarded =
          summary.last_analyzed_at !== null ||
          summary.financial_health_score !== null ||
          summary.linked_accounts_count > 0 ||
          summary.frozen_items_count > 0;
      } catch {
        // A completed profile is checked separately in userFromSession.
      }
    }

    return {
      accountType: settings.account_type,
      businessName: settings.business_name,
      onboarded,
      isBusinessMember: settings.is_business_member,
    };
  } catch {
    // Backend unreachable -- fall back to "already onboarded, individual"
    // rather than get someone stuck behind a modal or bounced to the wrong
    // dashboard because of a transient outage.
    return { accountType: "individual", businessName: null, onboarded: true, isBusinessMember: false };
  }
}

async function userFromSession(session: Session | null): Promise<User | null> {
  if (!session?.user?.email) {
    return null;
  }
  const [{ role, fullName }, { accountType, businessName, onboarded, isBusinessMember }] = await Promise.all([
    fetchProfile(session.user.id),
    fetchAccountSettings(),
  ]);
  return {
    id: session.user.id,
    email: session.user.email,
    role,
    fullName,
    accountType,
    businessName,
    onboarded: onboarded || Boolean(fullName?.trim()),
    isBusinessMember,
  };
}

export function homeRouteForUser(user: Pick<User, "role" | "accountType" | "isBusinessMember">): string {
  if (user.role === "admin") return "/dashboard";
  if (user.role === "investor") return "/investor";
  if (user.role === "partner") return "/partner";
  if (user.accountType === "business" || user.isBusinessMember) return "/business";
  return "/app";
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
    const nextUser = await userFromSession(data.session);
    setUser(nextUser);
    router.push(
      homeRouteForUser(nextUser ?? { role: "user", accountType: "individual", isBusinessMember: false })
    );
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

    const nextUser = await userFromSession(data.session);
    setUser(nextUser);
    router.push(
      homeRouteForUser(nextUser ?? { role: "user", accountType: "individual", isBusinessMember: false })
    );
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
