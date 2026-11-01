import type { Metadata } from 'next';
import { Guide } from '@/components/study/guide';
import { Html } from '@/components/study/html';
import { loadStudyPage } from '@/components/study/load';
import { getStudyCourse } from '@/lib/study/hub';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ cid: string }>;
}): Promise<Metadata> {
  const course = getStudyCourse((await params).cid);
  return { title: course?.formulas.length ? 'Formula sheet' : 'Cheat sheet' };
}

/** Formula sheet; courses without one show their `cheatsheet` guide instead (artifact renderFormulas). */
export default async function StudyFormulasPage({
  params,
}: {
  params: Promise<{ cid: string }>;
}) {
  const { course } = await loadStudyPage(params);
  if (!course.formulas.length) {
    const cheatsheet = course.pages.find((page) => page.id === 'cheatsheet');
    if (cheatsheet) return <Guide page={cheatsheet} math={course.math} />;
    return (
      <div className="wrap">
        <div className="vhead">
          <h2>Cheat sheet</h2>
          <p>
            This course has no formula sheet or cheat sheet in the Study Hub.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="wrap">
      <div className="vhead">
        <h2>Formula sheet</h2>
        <p>
          Everything you should be able to write from memory. Cover the right
          column and quiz yourself, or use Flashcards.
        </p>
      </div>
      <div className="sheet">
        <div className={course.formulas.length === 1 ? 'fs one' : 'fs'}>
          {course.formulas.map((group, gi) => (
            <section key={`${gi}-${group.h}`}>
              <h3>{group.h}</h3>
              <table>
                <tbody>
                  {group.rows.map(([term, formula], ri) => (
                    <tr key={ri}>
                      <Html as="td" html={term} math={course.math} />
                      <Html as="td" html={formula} math={course.math} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
