import type { Metadata } from 'next';
import { PageFrame } from '@/components/page-frame';
import { PlannerImport } from '@/components/planner/planner-import';
import { PlannerView } from '@/components/planner/planner-view';
import { getPlan, getPlannerFile } from '@/lib/planner/store';
import { localDayKey } from '@/lib/study/model';
import {
  canvasCourseTitle,
  currentClasses,
  displayCode,
} from '@/lib/study/nav';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Planner' };

export default function PlannerPage() {
  const file = getPlannerFile();
  if (!file)
    return (
      <PageFrame title="Course planner" eyebrow="Planner" width="reading">
        <p className="max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-2">
          Plan every semester, check the plan against your degree requirements,
          and export it as a one-page PDF. Start with a planner file: a JSON
          file with your degree requirements and a starting plan. Your coding
          agent can build one from your Degree Works audit and your major’s
          catalog page by following{' '}
          <span className="font-mono">docs/planner-file.md</span>. For a sample
          file, see{' '}
          <span className="font-mono">examples/planner/plan.json</span>.
        </p>
        <p className="mt-3 text-[13px] text-ink-3">
          Or run{' '}
          <span className="font-mono">pnpm planner:import &lt;file&gt;</span>.
        </p>
        <div className="mt-6">
          <PlannerImport />
        </div>
      </PageFrame>
    );
  return (
    <PageFrame
      title="Course planner"
      eyebrow={`${file.program}, ${file.catalog} catalog. From your Degree Works audit of ${file.audit}.`}
    >
      <PlannerView
        key={file.plan.t}
        rules={{
          program: file.program,
          catalog: file.catalog,
          audit: file.audit,
          pairs: file.pairs,
          areas: file.areas,
        }}
        initialPlan={getPlan(file)}
        today={localDayKey()}
        canvasClasses={currentClasses().flatMap((item) => {
          const code = displayCode(item.code ?? item.name);
          return /^[A-Z]{2,5} \d{4}$/.test(code)
            ? [{ code, title: canvasCourseTitle(item.name) }]
            : [];
        })}
      />
    </PageFrame>
  );
}
