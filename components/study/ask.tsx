'use client';

import { useTutor } from '@/components/study/ai/tutor';

export type TutorContext = { label: string; text: string; starter: string };

/**
 * Quiet "Explain this simpler" / "Walk me through it" action that opens the
 * tutor with this item attached. Hidden when the tutor is not set up. The
 * context is built on click so long notes are only stripped when needed.
 */
export function AskButton({
  children,
  context,
}: {
  children: React.ReactNode;
  context: () => TutorContext;
}) {
  const tutor = useTutor();
  if (!tutor.enabled) return null;
  return (
    <button
      type="button"
      className="textlink"
      onClick={() => tutor.ask(context())}
    >
      {children}
    </button>
  );
}
