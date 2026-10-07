/** `tasks --help`: what the tool is for and every command in one screen. */
export const OVERVIEW = `usage: tasks <command> [args]

Tasks are Markdown files in tasks/, named TASK-n.md, with a title and a status:
idea, todo, doing, done or dropped. Open means idea, todo or doing.

commands:
  new "title" [--status s] [-]   create the next task and print its path
  list [filter]                  list tasks, todo and doing by default
  find word…                     search the titles and bodies of every task
  deps TASK-n                    show what a task needs and what it blocks
  check [files…]                 check every task, and the task ids in files

Run tasks <command> --help for a command's options.`

/** `tasks <command> --help`, by command. */
export const COMMAND_HELP: Record<string, string> = {
  new: `usage: tasks new "title" [--status s] [-]

Creates the task with the next free id and prints its path. The id is free in
the working tree, in every worktree and on every local branch.

  --status s   idea, todo, doing, done or dropped (default: idea)
  -            read the body from stdin; empty sections are not written`,

  list: `usage: tasks list [--all | --open | --status s… | --ready]

Prints one "TASK-54 todo <title>" line per task, by id. With no filter, lists
the todo and doing tasks. The filters do not combine.

  --all        every status
  --open       idea, todo and doing: everything not done or dropped
  --status s   the given status; repeat it for more
  --ready      the todo tasks whose dependencies are all done`,

  find: `usage: tasks find word…

Searches the titles and bodies of every task for any of the words, ignoring
case. Open tasks come first, then the tasks that match the most words. Prints
the same lines as list.`,

  deps: `usage: tasks deps TASK-n

Prints one line per link: "needs TASK-60 done <title>" for each dependency,
then "blocks TASK-70 idea <title>" for each task that depends on this one.`,

  check: `usage: tasks check [files…]

Checks the frontmatter, dependencies and body of every task, and the task ids
in the tasks and in the given files or folders. Prints one
"tasks/TASK-54.md:3 <message>" line per problem, and exits 1 if there is any.`,
}
