---
name: default
version: 1
---
Linear issue: {{ issue.identifier }} — {{ issue.title }}

{{ issue.description | default: "(no description)" }}

{% if attempt and attempt > 1 %}
This is attempt #{{ attempt }}. Previous attempt(s) failed — check the git log and error output before retrying the same approach.
{% endif %}

You are running autonomously — do not ask for confirmation.
Steps:
1. Read CLAUDE.md and GOTCHAS.md
2. Implement the task
3. Verify EVERY acceptance criterion in the issue description — do not skip any
4. Run pnpm typecheck — must pass
5. git add + commit + push
6. Create PR with gh pr create — list which acceptance criteria are met in the PR body
