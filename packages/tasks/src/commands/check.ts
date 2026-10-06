import {loadTasks, type Finding} from '../load.ts'
import {graphProblems} from '../rules/graph.ts'

/** Every problem under `root`, one `file:line message` line each, in file order. */
export async function check(root: string): Promise<string[]> {
  const tasks = await loadTasks(root)
  const order = new Map(tasks.map((task, index) => [task.file, index]))
  const findings: Finding[] = [
    ...tasks.flatMap(({file, problems}) =>
      problems.map((problem) => ({file, ...problem}))
    ),
    ...graphProblems(tasks),
  ]
  findings.sort(
    (a, b) =>
      (order.get(a.file) ?? 0) - (order.get(b.file) ?? 0) || a.line - b.line
  )
  return findings.map(({file, line, message}) => `${file}:${line} ${message}`)
}
