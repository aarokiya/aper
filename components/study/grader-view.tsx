'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { GradeMyWork } from '@/components/study/ai/grade-my-work';
import { useTutor } from '@/components/study/ai/tutor';
import { useStudyProgress } from '@/lib/study/progress-client';
import type { StudyCourse, StudyCourseState } from '@/lib/study/types';

/** The course's free-form grader (artifact renderGraderView): any problem, graded line by line. */
export function GraderView({
  course,
  initial,
}: {
  course: StudyCourse;
  initial: StudyCourseState;
}) {
  const { state, update } = useStudyProgress(course.id, initial);
  const tutor = useTutor();
  const [worth, setWorth] = useState('10');
  const id = useId();
  const points = Math.max(1, Math.min(100, Math.round(Number(worth)) || 10));
  return (
    <div className="wrap">
      <div className="vhead">
        <h2>Grader</h2>
        <p>
          Paste any practice problem for {course.code}, then write, photograph,
          or type your answer. Each line gets marked, and you get a score.
        </p>
      </div>
      <div className="sheet">
        <div className="note">
          Use this for practice: textbook exercises, old exams, the problems in
          this hub. Don&apos;t run graded homework through it before you
          submit; check your syllabus&apos;s AI policy first.
        </div>
        {tutor.enabled ? (
          <div className="prob plain">
            <label htmlFor={`${id}-q`} className="paper-note block">
              Problem statement
            </label>
            <textarea
              id={`${id}-q`}
              className="custom-q"
              placeholder="e.g. Prove that if n² is even, then n is even."
              value={state.cq}
              onChange={(event) => {
                const value = event.target.value;
                update((draft) => {
                  draft.cq = value;
                });
              }}
            />
            <div className="inline-field">
              <label htmlFor={`${id}-pts`}>Worth</label>
              <input
                id={`${id}-pts`}
                type="number"
                min={1}
                max={100}
                value={worth}
                onChange={(event) => setWorth(event.target.value)}
              />{' '}
              points
            </div>
            <GradeMyWork
              course={course}
              gradeKey="custom"
              label="your problem"
              problem={state.cq}
              reference=""
              points={points}
              saved={state.gr.custom}
              defaultOpen
              onGraded={(grade) =>
                update((draft) => {
                  draft.gr.custom = grade;
                })
              }
            />
          </div>
        ) : (
          <p className="emptystate">
            Grading uses Groq, which isn&apos;t set up yet. Add a Groq API key
            in{' '}
            <Link
              href="/settings#groq"
              className="underline decoration-rule-2 underline-offset-[3px] hover:text-ink hover:decoration-ink"
            >
              Settings
            </Link>
            , then come back to grade your work here.
          </p>
        )}
      </div>
    </div>
  );
}
