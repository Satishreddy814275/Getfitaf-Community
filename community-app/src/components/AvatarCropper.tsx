'use client'

import { useEffect, useRef, useState } from 'react'

// Square the preview is drawn at, and the square the final exported
// image is re-rendered at. 320px is far more than the 64px this app
// ever actually displays an avatar at (even accounting for retina
// screens), and keeps the exported file small — typically well under
// 100KB as a JPEG, vs. a raw phone photo which can be several MB.
const PREVIEW_SIZE = 240
const OUTPUT_SIZE = 320

export default function AvatarCropper({
  file,
  onCancel,
  onConfirm,
}: {
  file: File
  onCancel: () => void
  onConfirm: (blob: Blob) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [ready, setReady] = useState(false)
  const [minZoom, setMinZoom] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  // Load the source image once when a file is handed in.
  useEffect(() => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      // Minimum zoom = whatever scale makes the image just cover the
      // preview square with no gaps on either dimension.
      const scale = Math.max(PREVIEW_SIZE / img.width, PREVIEW_SIZE / img.height)
      setMinZoom(scale)
      setZoom(scale)
      setOffset({ x: 0, y: 0 })
      setReady(true)
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Redraw whenever pan/zoom changes.
  useEffect(() => {
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, offset, ready])

  function clampOffset(z: number, o: { x: number; y: number }) {
    const img = imgRef.current
    if (!img) return o
    const w = img.width * z
    const h = img.height * z
    const boundX = Math.max(0, (w - PREVIEW_SIZE) / 2)
    const boundY = Math.max(0, (h - PREVIEW_SIZE) / 2)
    return {
      x: Math.min(boundX, Math.max(-boundX, o.x)),
      y: Math.min(boundY, Math.max(-boundY, o.y)),
    }
  }

  function draw() {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !ready) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = PREVIEW_SIZE
    canvas.height = PREVIEW_SIZE
    ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE)

    const w = img.width * zoom
    const h = img.height * zoom
    const x = PREVIEW_SIZE / 2 - w / 2 + offset.x
    const y = PREVIEW_SIZE / 2 - h / 2 + offset.y
    ctx.drawImage(img, x, y, w, h)
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    dragging.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
    ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setOffset((prev) => clampOffset(zoom, { x: prev.x + dx, y: prev.y + dy }))
  }

  function handlePointerUp() {
    dragging.current = false
  }

  function handleZoomChange(e: React.ChangeEvent<HTMLInputElement>) {
    const z = parseFloat(e.target.value)
    setZoom(z)
    setOffset((prev) => clampOffset(z, prev))
  }

  function handleConfirm() {
    const img = imgRef.current
    if (!img) return

    // Re-render the same crop region at full OUTPUT_SIZE resolution
    // (rather than exporting the small preview canvas directly) so the
    // saved photo looks sharp even though the on-screen preview is
    // deliberately compact.
    const outCanvas = document.createElement('canvas')
    outCanvas.width = OUTPUT_SIZE
    outCanvas.height = OUTPUT_SIZE
    const ctx = outCanvas.getContext('2d')
    if (!ctx) return

    const scaleUp = OUTPUT_SIZE / PREVIEW_SIZE
    const w = img.width * zoom * scaleUp
    const h = img.height * zoom * scaleUp
    const x = OUTPUT_SIZE / 2 - w / 2 + offset.x * scaleUp
    const y = OUTPUT_SIZE / 2 - h / 2 + offset.y * scaleUp
    ctx.drawImage(img, x, y, w, h)

    outCanvas.toBlob(
      (blob) => {
        if (blob) onConfirm(blob)
      },
      'image/jpeg',
      0.92
    )
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-5 w-full max-w-sm">
        <p className="text-sm font-semibold text-white mb-1">Position your photo</p>
        <p className="text-xs text-zinc-500 mb-4">Drag to reposition, use the slider to zoom.</p>

        <div className="flex justify-center mb-4">
          <canvas
            ref={canvasRef}
            width={PREVIEW_SIZE}
            height={PREVIEW_SIZE}
            className="rounded-full cursor-grab active:cursor-grabbing touch-none bg-zinc-900"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </div>

        <input
          type="range"
          min={minZoom}
          max={minZoom * 4}
          step={0.001}
          value={zoom}
          onChange={handleZoomChange}
          className="w-full mb-5 accent-orange-500"
        />

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 text-sm font-medium text-zinc-400 hover:text-white border border-zinc-700 rounded-lg py-2 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!ready}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg py-2 disabled:opacity-40 transition"
          >
            Use this photo
          </button>
        </div>
      </div>
    </div>
  )
}
