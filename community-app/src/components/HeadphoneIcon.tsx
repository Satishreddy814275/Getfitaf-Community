// Replaces the plain 🎧 emoji everywhere it used to sit (lesson list
// audio badge, Audio tab, "Prefer to listen?" header). The emoji
// renders as a different glyph on every OS/browser's own emoji font -
// on the old learn.getfitaf.fitness site this exact problem was already
// solved once by switching from the emoji to the Tabler icon webfont
// ("renders identically everywhere instead of relying on the device's
// emoji font" - see lesson-nav.js), so this is that same fix, done as
// a plain SVG in the same hand-drawn style as AppNav.tsx's own TabIcon
// (rect/path primitives, not a copied icon set - no webfont dependency
// to add just for one glyph).
export default function HeadphoneIcon({ className, size = 14 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <rect x="2" y="13" width="4.5" height="7" rx="2" />
      <rect x="17.5" y="13" width="4.5" height="7" rx="2" />
    </svg>
  )
}
