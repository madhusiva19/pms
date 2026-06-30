// Wraps fetch() to attach the pms_token (set on login) as a Bearer token.
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = typeof window !== "undefined" ? localStorage.getItem("pms_token") : null;

  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}
