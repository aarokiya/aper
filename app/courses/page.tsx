import { redirect } from 'next/navigation';

/** The Study overview lists every class (Study Hub courses and the rest of the term). */
export default function CoursesPage() {
  redirect('/study');
}
