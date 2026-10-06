# tasks

A CLI for a repo's `tasks/` folder: one plain Markdown file per task, written
for coding agents first and read in few tokens.

Not published. See the [root README](../../README.md) for the symlink that puts
`tasks` on your PATH. It runs from source on Node 24, with no build step.

## Aims

- **Agent first.** It is optimised for what an agent runs, not for what a person
  sees in an editor.
- **Few tokens.** Every output is as short as it can be and still answer.
- **Few concepts.** One folder, one kind of file, one status field.
- **Plain files.** The tool creates, lists, finds and checks. People and agents
  edit the content by hand. There is no edit command.

## Why

It replaces Backlog.md. Over 30 agent sessions, agents made 70 Backlog.md calls
with 8 commands. Nearly every `list` or `search` asked "does something on X
already exist?", and then the agent grepped the files anyway. Agents searched
tasks and drafts separately, every time. `view` was mostly piped to `head -1`,
to get the file path. Nobody used scores, decisions, docs, milestones, the board
or the browser.

## Format

```markdown
---
title: Shadows that follow the time of day on outdoor maps
status: todo
depends: [TASK-53]
labels: [world]
---

## Description

Why the work is worth doing.

## Acceptance criteria

- [ ] A testable outcome, never a step.

## Plan

- [ ] 1.1 A step.
```

- **The filename is the id:** `tasks/TASK-54.md`. There is no `id:` field,
  because every way an agent reaches a task (a read, `grep -n`, `find`, a diff
  header) already shows the path. A new title never renames the file.
- **Frontmatter:** `title` and `status`, plus optional `depends` and `labels`.
  It is read with the `yaml` package and checked by a strict zod schema. That is
  the same YAML 1.2 that Obsidian, GitHub and editors read, and there is no
  parser of our own to maintain. Any YAML list is valid. Git knows the dates and
  the authors, so the file does not record them.
- **Statuses:** `idea | todo | doing | done | dropped`.
- **The body** is plain Markdown with three sections: `## Description` (why),
  `## Acceptance criteria` (`- [ ]` items) and `## Plan`. There are no section
  markers. The step format inside `## Plan` belongs to the `next-step` skill,
  and `check` does not read it.

## Commands

Each command prints one line per item, with no headers, colours, scores or blank
lines. A command that succeeds with nothing to say prints nothing. An error is
one line on stderr and exits with a non-zero code.

| Command                                     | What it does                                                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tasks new "title" [--status s] [-]`        | Creates the next free id, with status `idea` by default, and prints its path. `-` reads the body from stdin. Sections left empty are not written.                              |
| `tasks list [--all] [--status s] [--ready]` | Lists `todo` and `doing` tasks by id, one `TASK-54 todo <title>` line each. `--status` can repeat. `--ready` lists the `todo` tasks whose dependencies are all `done`.         |
| `tasks find word…`                          | Searches titles and bodies of every status for any of the words, case-insensitive. Open tasks come first, then the tasks that match the most words. Same line shape as `list`. |
| `tasks deps TASK-46`                        | Prints one line per link: `needs TASK-60 done <title>` or `blocks TASK-70 idea <title>`.                                                                                       |
| `tasks check [files…]`                      | Checks every task, and the task ids in the given files or folders. Prints one `tasks/TASK-54.md:3 <message>` line per problem, and exits 1 if there is any.                    |

Titles are never cut short, because they are the words an agent searches for.

`new` picks the next id that is free in the working tree, in every worktree and
on every local branch, so two branches never create the same id. A task created
in another worktree is not on any branch yet, which is why worktrees are read
too.

### What `check` checks

- **Frontmatter:** it parses, has no unknown key, a known status and a
  non-empty, one-line title, and the filename is `TASK-n.md`. A YAML comment is
  an error: an unquoted ` #` silently cuts a title short.
- **Graph:** every dependency exists, no task depends on itself, there is no
  cycle, a `done` task has no open dependency, and an open task does not depend
  on a `dropped` one.
- **Body:** a `done` task has every acceptance criterion ticked, and a `dropped`
  task has a body that says why.
- **References:** every task id in the tasks and in the given files names a task
  that exists. Any case counts, so `task-41` in a path or a branch name is not a
  mistake; only a missing task is an error. A `DRAFT-n` id is an error.
- **Setup:** a repo with a `.prettierrc*` file lists `tasks/` in
  `.prettierignore`.

## Setting up a repo

1. Create `tasks/`.
2. If the repo uses prettier, add `tasks/` to `.prettierignore`.
3. Run `tasks check` from pre-commit, with the docs that cite task ids, and fail
   when `tasks` is missing rather than skip the check:

   ```sh
   if git diff --cached --name-only | grep -qE '^(tasks|docs)/|^README\.md$'; then
     if ! command -v tasks >/dev/null; then
       echo "pre-commit: the tasks CLI is not on PATH" >&2
       exit 1
     fi
     tasks check docs README.md
   fi
   ```

The `tasks` skill in the skills repo teaches an agent the format and these
commands. The `next-step` skill runs a task's `## Plan` one step at a time.

## Decisions

- **The CLI lives in this toolbox.** That gives the shortest command, and the
  tool gets types, zod and tests. The cost is that it does not run in cloud
  sessions, and the skill and the CLI are two installs that can drift apart.
  `check` catches a mismatch.
  - Rejected: the CLI inside the skill. It has no dependencies and no tests, and
    every call needs a long path.
  - Rejected: a copy in each repo. The copies drift apart.
- **Generic, with no config file.** The folder is always `tasks/`, the prefix
  always `TASK-`, and the statuses always the five above. Nothing in the tool is
  specific to one repo.
- **No drafts.** An idea is a task with `status: idea`, so there is one place to
  look. Promoting an idea is a one-line edit.
- **One folder, and files never move.** Done and dropped tasks stay in `tasks/`,
  so paths and links never break. Open tasks cite done ones for their reasons.
- **`dropped` instead of an archive folder,** with a line in the body that says
  why.
- **A real YAML parser.** `new` writes flow lists, and quotes a title only when
  `yaml.stringify` must.
  - Rejected: a strict hand-written reader. It reads its own subset of YAML, so
    `title: Fix #3` is `Fix #3` to it and `Fix` to every other tool.
- **Prettier never touches `tasks/`.** With `proseWrap: always`, prettier
  re-wraps frontmatter into invalid YAML, re-wraps criteria and re-indents step
  lines. An agent's edit then misses text that moved across a line break.
- **No priority field.** Dependency order and `list --ready` say what can start
  next, and a person picks.
- **No subtasks.** A parent task `depends` on its children, and its file lists
  them. There is one id format.
- **No `--plain` flag.** The plain output is the only output.
