// Feed photos are resized/re-encoded client-side before upload, the
// same idea as AvatarCropper's canvas export but for arbitrary-aspect
// feed images instead of a fixed square crop.
//
// 1920px covers every screen this app renders a post image at (the
// feed never displays wider than ~600px, even accounting for retina),
// while still looking "full quality" if someone opens the file
// directly. A raw phone photo can be 3-8MB; resized + re-encoded here
// it typically lands well under 500KB.
const MAX_DIMENSION = 1920
const JPEG_QUALITY = 0.82
// Skip files that are already small — nothing meaningful to gain, and
// re-encoding a small/already-compressed file can occasionally make
// it bigger rather than smaller.
const SKIP_BELOW_BYTES = 300 * 1024

export async function compressImage(file: File): Promise<File> {
  // GIFs would lose animation if re-encoded as a static JPEG, and
  // non-image files (video) aren't handled here at all.
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  if (file.size < SKIP_BELOW_BYTES) return file

  try {
    // createImageBitmap decodes the file (applying EXIF orientation in
    // supporting browsers) without needing an <img> load round-trip.
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    )
    // If re-encoding didn't actually shrink it, just keep the
    // original rather than forcing a format change for no benefit.
    if (!blob || blob.size >= file.size) return file

    const newName = file.name.replace(/\.[^./]+$/, '') + '.jpg'
    return new File([blob], newName, { type: 'image/jpeg' })
  } catch {
    // Any failure here (unsupported format, decode error, browser
    // quirk, etc.) should never block a post — fall back to
    // uploading the original file untouched.
    return file
  }
}
