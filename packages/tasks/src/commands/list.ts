import {isTask, type Task, type TaskFile} from '../load.ts'
import {isOpen, parseStatus, STATUSES, type Status} from '../schema.ts'

export type ListOptions = {
  all?: boolean
  open?: boolean
  status?: string[]
  ready?: boolean
}

const DEFAULT: readonly Status[] = ['todo', 'doing']

/**
 * One line per task, by id: `todo` and `doing` by default, every status with
 * `all`, `idea`, `todo` and `doing` with `open`, the given ones with `status`,
 * or with `ready` the `todo` tasks whose dependencies are all `done`. Invalid
 * task files are left to `check`.
 */
export function list(files: TaskFile[], options: ListOptions = {}): string[] {
  const {all, open, status, ready} = options
  if (
    [all, open, status, ready].filter((flag) => flag !== undefined).length > 1
  ) {
    throw new Error('use one of --all, --open, --status, --ready')
  }
  const tasks = files.filter(isTask)
  if (ready) {
    const byId = new Map(tasks.map((task) => [task.id, task]))
    return tasks
      .filter(
        ({frontmatter}) =>
          frontmatter.status === 'todo' &&
          (frontmatter.depends ?? []).every(
            (id) => byId.get(id)?.frontmatter.status === 'done'
          )
      )
      .map(taskLine)
  }
  const statuses =
    status?.map(parseStatus) ??
    (all ? STATUSES : open ? STATUSES.filter(isOpen) : DEFAULT)
  return tasks
    .filter(({frontmatter}) => statuses.includes(frontmatter.status))
    .map(taskLine)
}

/** `TASK-54 todo <full title>`: the title is never cut, it is the search words. */
export const taskLine = ({id, frontmatter}: Task) =>
  `${id} ${frontmatter.status} ${frontmatter.title}`
