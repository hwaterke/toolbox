import {loadTasks} from '../load.ts'

/** Every problem under `root`, one `file:line message` line each. */
export async function check(root: string): Promise<string[]> {
  const tasks = await loadTasks(root)
  return tasks.flatMap(({file, problems}) =>
    problems.map(({line, message}) => `${file}:${line} ${message}`)
  )
}
