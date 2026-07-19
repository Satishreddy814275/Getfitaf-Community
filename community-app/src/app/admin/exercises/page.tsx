import { redirect } from 'next/navigation'

// The standalone exercises page was folded into /admin/videos as a
// "Catalog" tab (see AdminExerciseVideosList) - Satish's call was to
// keep everything about an exercise in one place rather than a
// separate nav entry. This route stays as a redirect rather than a
// 404 for anyone with it bookmarked.
export default function AdminExercisesPage() {
  redirect('/admin/videos')
}
