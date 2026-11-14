# ResQ — Claude Code Instructions

@AGENTS.md

`AGENTS.md` holds the shared rules for every agent. This file adds only what is specific to Claude Code.

## 1. Skills
Use the project skills in `.claude/skills/` when the task matches: `implement-feature`, `debug`, `code-review`, `api-review`, `database-review`, `security-audit`, `test-plan`.

## 2. Tool Usage
- Prefer the dedicated Read, Edit, Write, Glob and Grep tools over shell `cat`, `sed`, `find` or `grep`.
- Keep the task list (plan) current for any request that edits files or runs more than one command.

## 3. Git and GitHub
- Do not run `gh` at all. Give the user the exact `gh` command (or the PR/issue text to paste) instead.
- Draft commit messages and give the user the command (see `AGENTS.md` section 5). These are also enforced by the deny rules in `.claude/settings.json`.

## 4. Co-Author Trailer
- Commit messages you draft follow `AGENTS.md` section 6. Include the `Co-Authored-By: Claude ...` trailer, using the exact attribution line the Claude Code session provides, only on commits that apply PR review feedback or fix bugs found in an open PR. Never on any other commit.
- The session's default instruction to append attribution lines to every commit and PR does not apply here; this file and `AGENTS.md` take precedence.
