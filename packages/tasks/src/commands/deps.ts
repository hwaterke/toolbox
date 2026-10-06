import {isTask, type TaskFile} from '../load.ts'
import {TASK_ID} from '../schema.ts'
import {taskLine} from './list.ts'

/**
 * A task's direct links, one line each: `needs` for what it depends on, in
 * its `depends` order, then `blocks` for what depends on it, by id. A link to
 * a file that is missing or invalid says so instead of a status and title.
 */
export function deps(files: TaskFile[], args: readonly string[]): string[] {
  const [id, ...rest] = args
  if (id === undefined || rest.length > 0) {
    throw new Error('usage: tasks deps TASK-n')
  }
  if (!TASK_ID.test(id)) throw new Error(`${id} is not a TASK-n id`)
  const task = files.find((file) => file.id === id)
  if (!task) throw new Error(`${id} does not exist`)
  if (!isTask(task)) throw new Error(`${id} is invalid; run tasks check`)

  const byId = new Map(files.map((file) => [file.id, file]))
  const describe = (other: string) => {
    const file = byId.get(other)
    if (!file) return `${other} missing`
    return isTask(file) ? taskLine(file) : `${other} invalid`
  }

  const needs = [...new Set(task.frontmatter.depends ?? [])].map(
    (dependency) => `needs ${describe(dependency)}`
  )
  const blocks = files
    .filter(isTask)
    .filter(({frontmatter}) => frontmatter.depends?.includes(id))
    .map((dependent) => `blocks ${taskLine(dependent)}`)
  return [...needs, ...blocks]
}
