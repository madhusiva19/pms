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
  console.log("[push] setupPushNotifications called", { employeeId });
  if (typeof window === "undefined") return;
  const API = process.env.NEXT_PUBLIC_API_URL;
  if (!API || !employeeId) {
    console.log("[push] bailing: missing API or employeeId", { API, employeeId });
    return;
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    console.log("[push] bailing: browser lacks serviceWorker/PushManager/Notification support");
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    console.log("[push] service worker registered", registration);

    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
    console.log("[push] Notification.permission =", Notification.permission);
    if (Notification.permission !== "granted") return;

    let subscription = await registration.pushManager.getSubscription();
    console.log("[push] existing subscription?", subscription);
    if (!subscription) {
      const keyRes = await apiFetch(`${API}/api/push/vapid-public-key`);
      console.log("[push] vapid-public-key response ok?", keyRes.ok, keyRes.status);
      if (!keyRes.ok) return;
      const { publicKey } = await keyRes.json();
      console.log("[push] publicKey =", publicKey);
      if (!publicKey) return;

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      console.log("[push] new subscription created", subscription);
    }

    const subRes = await apiFetch(`${API}/api/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: employeeId, subscription }),
    });
    console.log("[push] subscribe POST response ok?", subRes.ok, subRes.status, await subRes.text());
  } catch (err) {
    // push notifications are non-critical — never break login or any other
    // flow over this, but still surface the reason for local debugging
    console.warn("[push] setup failed:", err);
  }
}
