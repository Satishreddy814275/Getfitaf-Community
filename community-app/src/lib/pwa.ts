// Shared PWA install/display-mode helpers - used by SplashScreen (only
// render the launch splash once actually installed), InstallAppBanner,
// and the profile page's install row (only offer installing to people
// who haven't already).

// Covers both Android/desktop (the display-mode media query) and iOS
// Safari (navigator.standalone, which only Safari exposes - not in the
// standard lib.dom types, hence the cast).
export function isStandalone(): boolean {
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone === true
}

// iOS never fires `beforeinstallprompt` (see InstallAppBanner) - it's
// the one platform that needs to be told the manual Share -> Add to
// Home Screen steps instead of a one-tap Install button. Includes
// iPadOS 13+, which reports itself as a Mac in the user agent string
// but is still touch-only Safari underneath.
export function isIOS(): boolean {
  const ua = window.navigator.userAgent
  const iPadOS13Up = window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1
  return /iPad|iPhone|iPod/.test(ua) || iPadOS13Up
}

// Chrome/Edge/Android fire this before showing their own native install
// UI, and calling preventDefault() on it lets us hold onto it and
// trigger that same native prompt ourselves later from our own button -
// not a standard DOM event, hence the local type (lib.dom doesn't know
// about it).
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}
