import Image from 'next/image'

// Shared avatar rendering — shows the real uploaded photo when one
// exists, falling back to the existing orange-initial circle otherwise.
// Used anywhere a member's avatar appears (post author, comments, admin
// panel, profile page) so all of them update together.
export default function Avatar({
  avatarUrl,
  name,
  size = 40,
}: {
  avatarUrl?: string | null
  name?: string | null
  size?: number
}) {
  const initial = name?.[0]?.toUpperCase() || '?'

  if (avatarUrl) {
    return (
      // Always a fixed, known square size at every call site (see
      // callers), so next/image's required width/height fit naturally
      // here - unlike the variable-aspect post media images, which
      // don't have a safe fixed size to give it.
      <Image
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
      />
    )
  }

  return (
    <div
      className="rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.4)) }}
    >
      {initial}
    </div>
  )
}
