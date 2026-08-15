// Registers the service worker and subscribes the browser to Web Push, so
// the user gets a native OS popup for new notifications even when this tab
// is backgrounded, a different app is focused, or the browser is closed.
//
// Self-contained and best-effort: any failure (unsupported browser, denied
// permission, backend unreachable) is swallowed so it can never break login
// or any other flow.

import { apiFetch } from "@/lib/apiFetch";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function setupPushNotifications(employeeId: string): Promise<void> {
  if (typeof window === "undefined") return;
  const API = process.env.NEXT_PUBLIC_API_URL;
  if (!API || !employeeId) return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");

    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
    if (Notification.permission !== "granted") return;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const keyRes = await apiFetch(`${API}/api/push/vapid-public-key`);
      if (!keyRes.ok) return;
      const { publicKey } = await keyRes.json();
      if (!publicKey) return;

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    await apiFetch(`${API}/api/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: employeeId, subscription }),
    });
  } catch {
    // push notifications are non-critical — fail silently
  }
}
