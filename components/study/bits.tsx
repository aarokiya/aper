import type { StudyCourse, StudyWeek } from '@/lib/study/types';
import { cn } from '@/lib/utils';

const REF_KIND: Record<string, string> = { video: 'video', notes: 'notes' };

/** The textbook sections for a week, linked when the book has a URL. */
function BookLink({ course, week }: { course: StudyCourse; week: StudyWeek }) {
  // Some hubs already write the book into the sections ("Liang Ch. 6"); don't say it twice.
  const label = (
    week.secs.startsWith(course.book[0])
      ? week.secs
      : `${course.book[0]} ${week.secs}`
  ).trim();
  return course.book[1] ? (
    <a href={course.book[1]} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  ) : (
    <span>{label}</span>
  );
}

/** "Read along: Rosen §1.1, §1.2  ILA: Matrix transformations free …" */
export function ReadAlong({
  course,
  week,
}: {
  course: StudyCourse;
  week: StudyWeek;
}) {
  return (
    <div className="readalong">
      <b>Read along:</b> <BookLink course={course} week={week} />
      {week.refs.map(([label, url, kind], i) => (
        <a
          key={`${i}-${url}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {label}
          <span className="k">{REF_KIND[kind ?? ''] ?? 'free'}</span>
        </a>
      ))}
    </div>
  );
}

/** "Look it up: Lay §1.8, or ILA: Matrix transformations." */
export function Lookup({
  course,
  week,
}: {
  course: StudyCourse;
  week: StudyWeek;
}) {
  const ref = week.refs.find((item) => item[2] !== 'video');
  return (
    <div className="lookup">
      Look it up: <BookLink course={course} week={week} />
      {ref && (
        <>
          , or{' '}
          <a href={ref[1]} target="_blank" rel="noopener noreferrer">
            {ref[0]}
          </a>
        </>
      )}
      .
    </div>
  );
}

/** Serif "3/5" count; green when complete, faint when nothing is done. */
export function Tally({
  got,
  of,
  noun,
}: {
  got: number;
  of: number;
  noun: string;
}) {
  return (
    <div className={cn('tally', got === of ? 'full' : got === 0 && 'none')}>
      <span aria-hidden="true">
        {got}/{of}
      </span>
      <span className="sr">
        {got} of {of} {noun}
      </span>
    </div>
  );
}
