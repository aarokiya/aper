import type { StudyGuidePage } from '@/lib/study/types';
import { Html } from './html';

/** A long-form guide page (artifact renderGuide). */
export function Guide({ page, math }: { page: StudyGuidePage; math: boolean }) {
  return (
    <div className="wrap">
      <div className="vhead">
        <h2>{page.title}</h2>
        {page.lead && <p>{page.lead}</p>}
      </div>
      <div className="sheet">
        <Html className="prose guide" html={page.html} math={math} />
      </div>
    </div>
  );
}
