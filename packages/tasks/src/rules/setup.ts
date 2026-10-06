import {readdir, readFile} from 'node:fs/promises'
import {TASKS_DIR, type Finding} from '../load.ts'

export const PRETTIER_IGNORE = '.prettierignore'

const PRETTIER_CONFIG = /^(\.prettierrc.*|prettier\.config\..+)$/
const IGNORES_TASKS = new RegExp(`^/?${TASKS_DIR}(/(\\*\\*)?)?$`)

/**
 * A repo that configures prettier lists `tasks/` in `.prettierignore`. With
 * `proseWrap: always`, prettier re-wraps frontmatter into invalid YAML and
 * moves text across lines, so an agent's next Edit misses it.
 */
export async function setupProblems(root: string): Promise<Finding[]> {
  const names = await readdir(root)
  if (!names.includes(TASKS_DIR)) return []
  if (!names.some((name) => PRETTIER_CONFIG.test(name))) return []

  const ignore = names.includes(PRETTIER_IGNORE)
    ? await readFile(`${root}/${PRETTIER_IGNORE}`, 'utf8')
    : ''
  const listed = ignore
    .split(/\r?\n/)
    .some((line) => IGNORES_TASKS.test(line.trim()))
  if (listed) return []
  return [
    {
      file: PRETTIER_IGNORE,
      line: 1,
      message: `does not list ${TASKS_DIR}/, so prettier re-wraps task files`,
    },
  ]
}
