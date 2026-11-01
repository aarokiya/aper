import type { Metadata } from 'next';
import Link from 'next/link';
import { loadStudyPage } from '@/components/study/load';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Guides' };

export default async function StudyGuidesPage({
  params,
}: {
  params: Promise<{ cid: string }>;
}) {
  const { course } = await loadStudyPage(params);
  return (
    <div className="wrap">
      <div className="vhead">
        <h2>Guides</h2>
        <p>Longer pages for {course.code}.</p>
      </div>
      <div className="sheet">
        {course.pages.length ? (
          <ul className="mlist one">
            {course.pages.map((page) => (
              <li key={page.id}>
                <Link
                  href={`/study/${course.id}/guides/${encodeURIComponent(page.id)}`}
                >
                  {page.title}
                </Link>
                {page.lead && <span>{page.lead}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="emptystate">This course has no guides.</p>
        )}
      </div>
    </div>
  );
}
