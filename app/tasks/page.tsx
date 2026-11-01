import { PageFrame } from '@/components/page-frame';
import { lockNote } from '@/lib/tasks/lock';
import { NewLocalTaskForm } from '@/components/new-local-task-form';
import { TaskWorkspace, type WorkspaceTask } from '@/components/task-workspace';
import {
  getAllSubtasks,
  getDashboardData,
  getLocalOnlyTasks,
} from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string; due?: string }>;
}) {
  const data = getDashboardData();
  const localTasks = getLocalOnlyTasks();
  const subtasks = getAllSubtasks();
  const byTask = (localTaskId: number) =>
    subtasks.filter((item) => item.localTaskId === localTaskId);
  const tasks: WorkspaceTask[] = [
    ...data.tasks.map((task) => ({
      key: `assignment:${task.id}`,
      assignmentId: task.id,
      localTaskId: task.localTaskId,
      title: task.title,
      courseId: task.courseId,
      course: task.course,
      dueAt: task.dueAt,
      personalDueAt: task.personalDueAt,
      type: task.assignmentType,
      providerState: task.providerState,
      workflowStatus: task.workflowStatus as WorkspaceTask['workflowStatus'],
      priority: task.priority,
      estimatedMinutes: task.estimatedMinutes,
      pinned: Boolean(task.pinned),
      notes: task.notes,
      pointsPossible: task.pointsPossible,
      subtasks: byTask(task.localTaskId),
      lockNote: lockNote(task.locked, task.lockExplanation, task.unlockAt),
    })),
    ...localTasks.map((task) => ({
      key: `local:${task.id}`,
      assignmentId: null,
      localTaskId: task.id,
      title: task.title,
      courseId: task.courseId,
      course: task.course,
      dueAt: null,
      personalDueAt: task.personalDueAt,
      type: 'LOCAL_TASK',
      providerState: null,
      workflowStatus: task.workflowStatus as WorkspaceTask['workflowStatus'],
      priority: task.priority,
      estimatedMinutes: task.estimatedMinutes,
      pinned: Boolean(task.pinned),
      notes: task.notes,
      pointsPossible: null,
      subtasks: byTask(task.id),
      lockNote: null,
    })),
  ];
  const query = await searchParams;
  const selected = Number(query.task || 0) || undefined;
  const initialDue = query.due === 'fortnight' ? 'fortnight' : 'all';
  return (
    <PageFrame
      title="Tasks"
      eyebrow={`${data.tasks.length} from Canvas and Gradescope · ${localTasks.length} local`}
    >
      <div className="mb-8">
        <NewLocalTaskForm
          courses={data.courses.map(({ id, code }) => ({ id, code }))}
        />
      </div>
      <TaskWorkspace
        initialTasks={tasks}
        courses={data.courses.map(({ id, code }) => ({ id, code }))}
        initialSelectedTaskId={selected}
        initialDue={initialDue}
      />
    </PageFrame>
  );
}
