---
name: rework
version: 1
---
Linear issue: {{ issue.identifier }} — {{ issue.title }} (REWORK)

{{ issue.description | default: "(no description)" }}

This issue was previously implemented but the PR was rejected by a reviewer.

{% if attempt and attempt > 1 %}
This is rework attempt #{{ attempt }}. Previous attempt(s) failed — check the git log and error output before retrying the same approach.
{% endif %}

You are running autonomously — do not ask for confirmation.
Steps:
1. Read CLAUDE.md and GOTCHAS.md
2. Find the existing PR for this issue using `gh pr list --head agent/{{ issue.identifier }}`
3. Read ALL review comments and requested changes on the PR using `gh pr view <number> --comments`
4. Close the old PR with `gh pr close <number>`
5. Create a fresh branch from origin/main — do NOT reuse the old branch
6. Implement the task from scratch, addressing ALL review feedback
7. Verify EVERY acceptance criterion in the issue description — do not skip any
8. Run pnpm typecheck — must pass
9. git add + commit + push
10. Create a new PR with gh pr create — reference the old PR and list which review comments are addressed
