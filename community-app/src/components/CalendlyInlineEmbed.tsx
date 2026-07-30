'use client'

import Script from 'next/script'

// Calendly's own documented inline-embed pattern: a div with the
// data-url Calendly's widget.js looks for, plus their script loaded
// once. background_color/text_color/primary_color on the URL (hex,
// no '#') are the only supported theming knobs - font and layout stay
// Calendly's, so this reads as a color-matched Calendly widget, not a
// full reskin. lazyOnload since this only ever renders on /coaching,
// never something worth paying for on every other page's load.
export default function CalendlyInlineEmbed({ url }: { url: string }) {
  return (
    <>
      <div
        className="calendly-inline-widget rounded-xl overflow-hidden"
        data-url={url}
        style={{ minWidth: '280px', height: '750px' }}
      />
      <Script src="https://assets.calendly.com/assets/external/widget.js" strategy="lazyOnload" />
    </>
  )
}
