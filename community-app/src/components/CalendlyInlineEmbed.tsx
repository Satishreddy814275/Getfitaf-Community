'use client'

import Script from 'next/script'

// Calendly's own documented inline-embed pattern: a div with the
// data-url Calendly's widget.js looks for, plus their script loaded
// once. background_color/text_color/primary_color on the URL (hex,
// no '#') are the only supported theming knobs - font and layout stay
// Calendly's, so this reads as a color-matched Calendly widget, not a
// full reskin. lazyOnload since this only ever renders on /coaching,
// never something worth paying for on every other page's load.
//
// data-resize="true" is what fixes the "scrolling feels broken" bug -
// without it, this div stays a fixed height and Calendly's own content
// (which is often taller) scrolls inside its own little box, so the
// page ends up with two independent scroll regions stacked on top of
// each other. With it, widget.js reports its real content height back
// and resizes this div to match, so there's only ever one scrollbar:
// the page's own. min-height below is just a placeholder to avoid a
// layout jump before that resize message arrives, not a hard cap -
// width:100% keeps it filling the card instead of sizing to its own
// intrinsic (and slightly awkward-looking) default.
export default function CalendlyInlineEmbed({ url }: { url: string }) {
  return (
    <>
      <div
        className="calendly-inline-widget rounded-xl overflow-hidden"
        data-url={url}
        data-resize="true"
        style={{ width: '100%', minWidth: '280px', minHeight: '700px' }}
      />
      <Script src="https://assets.calendly.com/assets/external/widget.js" strategy="lazyOnload" />
    </>
  )
}
