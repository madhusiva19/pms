export function useCurrentUser() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("pms_user");
  if (!raw) return null;
  return JSON.parse(raw);
}