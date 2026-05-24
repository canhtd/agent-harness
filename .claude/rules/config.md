# Config Rules

- Secrets come from environment variables, never hardcode
- Do not modify `.env` or lockfile format without explicit approval
- Config changes that affect all agent sessions (CLAUDE.md, .claude/rules/) require careful review
- New dependencies require confirmation — do not `pnpm add` without it being in the issue description
