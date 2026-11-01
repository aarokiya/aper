import type {
  StudyCourse,
  StudyCourseState,
  StudyWeek,
} from '@/lib/study/types';

/** What every week-page tab pane receives. */
export type PaneProps = {
  course: StudyCourse;
  week: StudyWeek;
  state: StudyCourseState;
  update: (mutate: (draft: StudyCourseState) => void) => void;
  /** switch to another tab of this week */
  onTab: (id: string) => void;
};
