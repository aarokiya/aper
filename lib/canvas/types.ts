import { z } from 'zod';

export const canvasUserSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    name: z.string().optional(),
    short_name: z.string().optional(),
    sortable_name: z.string().optional(),
  })
  .loose();
export const canvasCourseSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    name: z.string(),
    course_code: z.string().optional(),
    workflow_state: z.string().optional(),
    enrollment_state: z.string().optional(),
    start_at: z.string().nullable().optional(),
    end_at: z.string().nullable().optional(),
    time_zone: z.string().optional(),
    syllabus_body: z.string().nullable().optional(),
    term: z.object({ name: z.string().optional() }).loose().optional(),
    teachers: z
      .array(
        z
          .object({
            id: z.union([z.string(), z.number()]).optional(),
            display_name: z.string().optional(),
            avatar_image_url: z.string().nullable().optional(),
          })
          .loose(),
      )
      .optional(),
    enrollments: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .loose();
export const canvasAssignmentSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    name: z.string(),
    html_url: z.string().optional(),
    description: z.string().nullable().optional(),
    points_possible: z.number().nullable().optional(),
    due_at: z.string().nullable().optional(),
    unlock_at: z.string().nullable().optional(),
    lock_at: z.string().nullable().optional(),
    assignment_group_id: z
      .union([z.string(), z.number()])
      .nullable()
      .optional(),
    submission_types: z.array(z.string()).optional(),
    submission: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .loose();

export type CanvasCourse = z.infer<typeof canvasCourseSchema>;
export type CanvasAssignment = z.infer<typeof canvasAssignmentSchema>;
