import { PageFrame } from '@/components/page-frame';
import { SearchClient } from '@/components/search-client';
import { getDashboardData } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default function SearchPage() {
  const courses = getDashboardData().courses.map(({ id, code }) => ({
    id,
    code,
  }));
  return (
    <PageFrame title="Search" eyebrow="Full-text, on this computer">
      <SearchClient courses={courses} />
    </PageFrame>
  );
}
