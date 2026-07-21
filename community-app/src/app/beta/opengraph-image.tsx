import { ImageResponse } from 'next/og'

// Custom share-card image for /beta, generated at request time rather
// than a static upload - Next's file convention automatically wires
// this into the page's metadata as og:image/twitter:image. Without
// this, links shared to Instagram/WhatsApp (the actual likely
// distribution channel for the beta) would show a bare link or the
// site's generic favicon instead of something that looks intentional.
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(circle at 50% 40%, #2a1608 0%, #0a0a0a 70%)',
        }}
      >
        <div style={{ display: 'flex', fontSize: 96, fontWeight: 900, color: 'white', letterSpacing: -2 }}>
          GET<span style={{ color: '#f97316' }}>FIT</span>&nbsp;AF
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 30,
            color: '#f97316',
            fontWeight: 700,
            letterSpacing: 4,
            textTransform: 'uppercase',
            marginTop: 16,
          }}
        >
          Community Membership — Beta
        </div>
        <div style={{ display: 'flex', fontSize: 26, color: '#a1a1aa', marginTop: 28 }}>
          First 50 members get their first month for ₹249
        </div>
      </div>
    ),
    { ...size }
  )
}
