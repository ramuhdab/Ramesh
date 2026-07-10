import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { api, setTokens, getAccessToken, onSessionExpired } from "../api/client";

type CurrentUser = {
  id: string;
  username: string;
  email: string | null;
  organizationId: string | null;
  roles: string[];
};

type LoginResult = {
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
  user: CurrentUser;
};

type AuthContextValue = {
  user: CurrentUser | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_USER_KEY = "spqr_current_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(() => {
    const raw = localStorage.getItem(STORAGE_USER_KEY);
    return raw ? (JSON.parse(raw) as CurrentUser) : null;
  });

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.post<LoginResult>("/auth/login", { username, password });
    setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(result.user));
    setUser(result.user);
    return result;
  }, []);

  const logout = useCallback(async () => {
    try {
      if (getAccessToken()) await api.post("/auth/logout");
    } finally {
      setTokens(null);
      localStorage.removeItem(STORAGE_USER_KEY);
      setUser(null);
    }
  }, []);

  // If the API client determines the session is truly over (refresh token
  // missing/expired), clear React state too so isAuthenticated flips to
  // false and ProtectedRoute redirects to /login instead of leaving the
  // user on a page where every request silently fails.
  useEffect(() => {
    onSessionExpired(() => {
      localStorage.removeItem(STORAGE_USER_KEY);
      setUser(null);
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: Boolean(user), login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
