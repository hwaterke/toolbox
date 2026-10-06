import {z} from 'zod'

export const STATUSES = ['idea', 'todo', 'doing', 'done', 'dropped'] as const
export type Status = (typeof STATUSES)[number]

/** Neither done nor dropped: work that may still happen. */
export const isOpen = (status: Status) =>
  status === 'idea' || status === 'todo' || status === 'doing'

export const TASK_ID = /^TASK-[1-9]\d*$/

/** The whole frontmatter. Strict: an unknown key is an error, not ignored. */
export const Frontmatter = z.strictObject({
  title: z.string().trim().min(1),
  status: z.enum(STATUSES),
  depends: z.array(z.string().regex(TASK_ID)).optional(),
  labels: z.array(z.string().min(1)).optional(),
})
export type Frontmatter = z.infer<typeof Frontmatter>
