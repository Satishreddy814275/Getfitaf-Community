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
// (confirmed working - it correctly set an explicit height a second or
// so after load) and resizes this div to match, so there's only ever
// one scrollbar: the page's own.
//
// minHeight is genuinely just a pre-resize placeholder, sized small on
// purpose: CSS min-height always wins over a *smaller* explicit height,
// so setting this too tall (700px was) silently overrides the correct,
// smaller height data-resize computes, leaving dead space at the
// bottom that shows Calendly's own unpainted white canvas underneath -
// confirmed live (data-resize set height:602px, min-height:700px still
// forced the box to 700, leaving a 98px white gap). 300px comfortably
// clears the "0-height flash before JS loads" case without ever being
// taller than real content.
//
// The outer wrapper + negative margin-bottom on the widget div is a
// deliberate crop: there's a thin fixed-color line Calendly renders at
// the very bottom of its own page (below the time zone selector, past
// where anything else useful lives) that isn't something the embed
// params can turn off. Can't reach in and restyle it directly - it's
// inside Calendly's own cross-origin iframe - so instead the wrapper
// clips the last few px of the *rendered* widget via overflow:hidden,
// while the widget div's own margin-bottom shrinks how much height it
// contributes to the wrapper's auto-height by that same amount. Kept
// small on purpose so the crop lands just past the time zone row with
// a bit of breathing room, not into it.
export default function CalendlyInlineEmbed({ url }: { url: string }) {
  return (
    <>
      <div className="rounded-xl overflow-hidden">
        <div
          className="calendly-inline-widget"
          data-url={url}
          data-resize="true"
          style={{ width: '100%', minWidth: '280px', minHeight: '300px', marginBottom: '-10px' }}
        />
      </div>
      <Script src="https://assets.calendly.com/assets/external/widget.js" strategy="lazyOnload" />
    </>
  )
}
