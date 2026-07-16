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

async function requestEnvelope<T>(path: string, options: RequestInit = {}, retry = true): Promise<ApiEnvelope<T>> {
  // FormData (file uploads) must NOT get an explicit Content-Type - the
  // browser sets one itself with the correct multipart boundary. Setting
  // "application/json" here (the default for every other request) would
  // send a boundary-less multipart body the backend's multer middleware
  // can't parse.
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401 && retry) {
    if (refreshToken) {
      const refreshed = await tryRefresh();
      if (refreshed) return requestEnvelope<T>(path, options, false);
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

  if (res.status === 204) return { data: undefined as T };
  return (await res.json()) as ApiEnvelope<T>;
}

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const envelope = await requestEnvelope<T>(path, options, retry);
  return envelope.data;
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
  // Same as get(), but also returns the envelope's `meta` - needed by
  // screens that use meta for more than a bare count, e.g. Reports.tsx
  // reading meta.columns for proper column headers instead of raw field keys.
  getWithMeta: <T>(path: string) => requestEnvelope<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: "POST", body: formData }),
};

/**
 * Fetches a binary response (e.g. GET /attachments/:id, which streams the
 * raw file rather than a JSON envelope - see attachment.routes.ts) with the
 * same auth/refresh handling as `request`, but returning a Blob instead of
 * parsing JSON. Used to preview/download an attachment without exposing it
 * at a plain unauthenticated URL.
 */
export async function fetchBlob(path: string, retry = true): Promise<{ blob: Blob; contentType: string | null; disposition: string | null }> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE_URL}${path}`, { headers });

  if (res.status === 401 && retry && refreshToken) {
    const refreshed = await tryRefresh();
    if (refreshed) return fetchBlob(path, false);
  }
  if (!res.ok) {
    throw new ApiError("DOWNLOAD_FAILED", `Failed to download file (${res.status}).`);
  }
  const blob = await res.blob();
  return { blob, contentType: res.headers.get("Content-Type"), disposition: res.headers.get("Content-Disposition") };
}
