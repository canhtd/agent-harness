---
name: default
description: Standard agent workflow for implementing Linear issues
---
Linear issue: {{ issue.identifier }} — {{ issue.title }}

{% if issue.priority %}Priority: {{ issue.priority }}{% endif %}
{% if issue.labels.size > 0 %}Labels: {{ issue.labels | join: ", " }}{% endif %}

{{ issue.description | default: "(no description)" }}

{% if attempt %}
This is attempt #{{ attempt }}. Previous attempt(s) failed — check git log and HANDOFF.md for context before starting.
{% endif %}

Follow CLAUDE.md. You are running autonomously — do not ask for confirmation.
Steps: implement the task, run pnpm typecheck, git add + commit, git push, create PR with gh pr create.
