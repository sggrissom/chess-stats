export interface AuthCache {
  id: number;
  name: string;
  email: string;
  isAdmin: boolean;
}

let _auth: AuthCache | null = (() => {
  try {
    return JSON.parse(localStorage.getItem("auth-cache")!) as AuthCache;
  } catch {
    return null;
  }
})();

export function getAuth(): AuthCache | null {
  return _auth;
}

export function setAuth(a: AuthCache) {
  _auth = a;
  localStorage.setItem("auth-cache", JSON.stringify(a));
}

export function clearAuth() {
  _auth = null;
  localStorage.removeItem("auth-cache");
}

export async function logout() {
  try {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Continue with logout even if backend call fails
  }

  clearAuth();
  if (typeof window !== "undefined") {
    window.location.href = "/";
  }
}
