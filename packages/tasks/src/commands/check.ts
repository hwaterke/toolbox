import {readdir, readFile, stat} from 'node:fs/promises'
import nodePath from 'node:path'
import {loadTasks, TASKS_DIR, type Finding} from '../load.ts'
import {bodyProblems} from '../rules/body.ts'
import {graphProblems} from '../rules/graph.ts'
import {
  referenceProblems,
  taskSource,
  type Source,
} from '../rules/references.ts'

/**
 * Every problem in the tasks under `root`, and every bad task id in `paths`
 * (files, or directories whose Markdown files are read). One
 * `file:line message` line each, tasks first, in file order.
 */
export async function check(
  root: string,
  paths: readonly string[] = [],
  cwd = root
): Promise<string[]> {
  const tasks = await loadTasks(root)
  const extra = await readSources(root, paths, cwd)
  const ids = new Set(tasks.flatMap(({id}) => (id ? [id] : [])))

  const findings: Finding[] = [
    ...tasks.flatMap(({file, problems}) =>
      problems.map((problem) => ({file, ...problem}))
    ),
    ...graphProblems(tasks),
    ...bodyProblems(tasks),
    ...referenceProblems([...tasks.map(taskSource), ...extra], ids),
  ]

  const order = new Map(
    [...tasks, ...extra].map(({file}, index) => [file, index])
  )
  findings.sort(
    (a, b) =>
      (order.get(a.file) ?? 0) - (order.get(b.file) ?? 0) || a.line - b.line
  )
  return findings.map(({file, line, message}) => `${file}:${line} ${message}`)
}

/** The files `paths` name, relative to `root`, minus the task files. */
async function readSources(
  root: string,
  paths: readonly string[],
  cwd: string
): Promise<Source[]> {
  const files: string[] = []
  for (const path of paths) {
    const absolute = nodePath.resolve(cwd, path)
    const stats = await stat(absolute).catch(() => {
      throw new Error(`no such file: ${path}`)
    })
    if (!stats.isDirectory()) {
      files.push(absolute)
      continue
    }
    const entries = await readdir(absolute, {recursive: true})
    files.push(
      ...entries
        .filter((entry) => entry.endsWith('.md'))
        .filter((entry) => !/(^|\/)(node_modules|\.git)\//.test(entry))
        .sort()
        .map((entry) => nodePath.join(absolute, entry))
    )
  }

  const tasksDir = nodePath.join(root, TASKS_DIR) + nodePath.sep
  const unique = [...new Set(files)].filter(
    (file) => !file.startsWith(tasksDir)
  )
  return Promise.all(
    unique.map(async (file) => ({
      file: nodePath.relative(root, file),
      text: await readFile(file, 'utf8'),
    }))
  )
}
