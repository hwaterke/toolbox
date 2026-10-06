import {isTask, type TaskFile} from '../load.ts'
import {isOpen} from '../schema.ts'
import {taskLine} from './list.ts'

/**
 * Tasks whose title or body holds any of `words`, as a case-insensitive
 * substring, in every status. Open tasks first, then the most words matched,
 * then by id. Same line shape as `list`.
 */
export function find(files: TaskFile[], words: readonly string[]): string[] {
  const needles = [
    ...new Set(words.map((word) => word.toLowerCase()).filter(Boolean)),
  ]
  if (needles.length === 0) throw new Error('usage: tasks find word...')

  return (
    files
      .filter(isTask)
      .map((task) => {
        const haystack = `${task.frontmatter.title}\n${task.body}`.toLowerCase()
        const open = isOpen(task.frontmatter.status)
        return {
          task,
          open,
          hits: needles.filter((n) => haystack.includes(n)).length,
        }
      })
      .filter(({hits}) => hits > 0)
      // Stable: ties keep the id order the tasks were loaded in.
      .sort((a, b) => Number(b.open) - Number(a.open) || b.hits - a.hits)
      .map(({task}) => taskLine(task))
  )
}
