import * as core from "vlens/core";
import * as rpc from "vlens/rpc";
import * as auth from "./authCache";
import * as server from "../server";

/**
 * Attempts to refresh the authentication token using the refresh token cookie.
 * Returns the new auth context if successful, null otherwise.
 */
async function tryRefreshAuth(): Promise<auth.AuthCache | null> {
  try {
    const response = await fetch("/api/refresh", {
      method: "POST",
      credentials: "include",
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.auth) {
        if (data.token) {
          rpc.setAuthHeaders({ "x-auth-token": data.token });
        }
        return data.auth;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * For protected routes' fetch methods - ensures authentication is valid.
 * Returns true if auth is available, false if redirected to login.
 */
export async function ensureAuthInFetch(): Promise<boolean> {
  const currentAuth = auth.getAuth();
  if (currentAuth && currentAuth.id > 0) {
    // Headers may be lost on page reload — restore them via refresh if needed
    if (!rpc.getAuthHeaders()["x-auth-token"]) {
      const refreshedAuth = await tryRefreshAuth();
      if (refreshedAuth) {
        auth.setAuth(refreshedAuth);
        return true;
      }
      auth.clearAuth();
      core.setRoute("/login");
      return false;
    }
    return true;
  }

  try {
    let [authResponse] = await server.GetAuthContext({});
    if (authResponse && authResponse.id > 0) {
      auth.setAuth(authResponse);
      return true;
    }

    const refreshedAuth = await tryRefreshAuth();
    if (refreshedAuth) {
      auth.setAuth(refreshedAuth);
      return true;
    }

    auth.clearAuth();
    core.setRoute("/login");
    return false;
  } catch {
    const refreshedAuth = await tryRefreshAuth();
    if (refreshedAuth) {
      auth.setAuth(refreshedAuth);
      return true;
    }

    auth.clearAuth();
    core.setRoute("/login");
    return false;
  }
}

/**
 * For public routes' fetch methods - redirects authenticated users to dashboard.
 * Returns true if should continue to public page, false if redirected.
 */
export async function ensureNoAuthInFetch(): Promise<boolean> {
  const currentAuth = auth.getAuth();
  if (currentAuth && currentAuth.id > 0) {
    core.setRoute("/dashboard");
    return false;
  }

  try {
    let [authResponse] = await server.GetAuthContext({});
    if (authResponse && authResponse.id > 0) {
      auth.setAuth(authResponse);
      core.setRoute("/dashboard");
      return false;
    }

    const refreshedAuth = await tryRefreshAuth();
    if (refreshedAuth) {
      auth.setAuth(refreshedAuth);
      core.setRoute("/dashboard");
      return false;
    }
  } catch {
    const refreshedAuth = await tryRefreshAuth();
    if (refreshedAuth) {
      auth.setAuth(refreshedAuth);
      core.setRoute("/dashboard");
      return false;
    }
  }

  return true;
}

/**
 * For protected routes' view methods - verifies auth is still valid.
 * Returns the current auth if valid, null if redirected to login.
 */
export function requireAuthInView(): auth.AuthCache | null {
  const currentAuth = auth.getAuth();
  if (!currentAuth || currentAuth.id <= 0) {
    auth.clearAuth();
    core.setRoute("/login");
    return null;
  }
  return currentAuth;
}
