"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  ReactElement,
} from "react";
import { apiClient } from "./api";

interface User {
  id: string;
  email: string;
  role: string;
  created_at: string;
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

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in on mount
    void checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const token =
        typeof window !== "undefined"
          ? window.localStorage.getItem("auth_token")
          : null;
      if (token) {
        apiClient.setToken(token);
        const userData = await apiClient.getMe();
        setUser(userData);
      }
    } catch {
      // Not authenticated
      apiClient.setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const response = await apiClient.login(email, password);
    setUser({
      id: response.user_id.toString(),
      email: response.email,
      role: response.role,
      created_at: new Date().toISOString(),
    });
    router.push("/dashboard");
  }

  async function register(email: string, password: string) {
    try {
      const response = await apiClient.register(email, password);
      console.log("Register response:", response); // Debug log
      setUser({
        id: response.user_id,  // This is already a string
        email: response.email,
        role: response.role,
        created_at: new Date().toISOString(),
      });
      router.push("/dashboard");
    } catch (error) {
      console.error("Registration error:", error); // Debug log
      throw error; // Re-throw so the page can show the error
    }
  }

  function logout() {
    apiClient.setToken(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("auth_token");
    }
    setUser(null);
    router.push("/sign-in");
  }

  async function refreshUser() {
    try {
      const userData = await apiClient.getMe();
      setUser(userData);
    } catch {
      setUser(null);
    }
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


