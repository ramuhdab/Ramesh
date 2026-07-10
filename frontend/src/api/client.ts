// Same-origin relative path by default (works behind the nginx proxy in
// docker-compose, where the frontend and backend share one origin). Set
// VITE_API_BASE_URL at build time when the frontend and backend are deployed
// as separate origins instead (e.g. a Render static site calling a separate
// Render web service) - see deployment/08-Deployment-Render.md.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

type ApiEnvelope<T> = { data: T; meta?: Record<string, unknown> };
type ApiErrorBody = { error: { code: string; message: string; details?: unknown } };

export class ApiError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

let accessToken: string | null = localStorage.getItem("spqr_access_token");
let refreshToken: string | null = localStorage.getItem("spqr_refresh_token");

export function setTokens(tokens: { accessToken: string; refreshToken: string } | null) {
  accessToken = tokens?.accessToken ?? null;
  refreshToken = tokens?.refreshToken ?? null;
  if (tokens) {
    localStorage.setItem("spqr_access_token", tokens.accessToken);
    localStorage.setItem("spqr_refresh_token", tokens.refreshToken);
  } else {
    localStorage.removeItem("spqr_access_token");
    localStorage.removeItem("spqr_refresh_token");
  }
}

export function getAccessToken() {
  return accessToken;
}

// AuthContext registers a listener here so that when a refresh-token retry
// fails (session truly expired), the React user state is cleared too -
// otherwise isAuthenticated stays true (derived from localStorage) while
// every request silently fails, and ProtectedRoute never redirects to /login.
type SessionExpiredListener = () => void;
let sessionExpiredListener: SessionExpiredListener | null = null;
export function onSessionExpired(listener: SessionExpiredListener) {
  sessionExpiredListener = listener;
}

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(options.headers as Record<string, string>) };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401 && retry) {
    if (refreshToken) {
      const refreshed = await tryRefresh();
      if (refreshed) return request<T>(path, options, false);
    } else {
      // No refresh token to try (or it was already cleared) - the session is
      // definitively over; make sure the UI reflects that immediately.
      setTokens(null);
      sessionExpiredListener?.();
    }
  }

  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(body?.error.code ?? "UNKNOWN_ERROR", body?.error.message ?? res.statusText, body?.error.details);
  }

  if (res.status === 204) return undefined as T;
  const json = (await res.json()) as ApiEnvelope<T>;
  return json.data;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) throw new Error("refresh failed");
    const json = await res.json();
    accessToken = json.data.accessToken;
    localStorage.setItem("spqr_access_token", accessToken!);
    return true;
  } catch {
    setTokens(null);
    sessionExpiredListener?.();
    return false;
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
