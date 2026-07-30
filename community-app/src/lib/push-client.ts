// Client-side push subscribe/unsubscribe plumbing - kept separate from
// PushNotificationsRow so the component itself only deals with UI state.

// The browser's subscribe() call needs the VAPID public key as a
// Uint8Array, not the base64url string it's generated/stored as -
// this is the standard conversion (same one every web-push tutorial
// uses), not anything GetFit AF-specific.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

// Requests OS/browser permission (must be called from a real click, not
// on page load) and, if granted, subscribes and returns the
// subscription - the caller is responsible for persisting it via
// savePushSubscription.
export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    // TS's lib.dom types want a Uint8Array<ArrayBuffer> specifically,
    // not the broader Uint8Array<ArrayBufferLike> a plain `new
    // Uint8Array(...)` produces under newer typed-array generics - a
    // real Uint8Array satisfies BufferSource at runtime regardless.
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  })
}
