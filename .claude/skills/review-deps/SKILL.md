---
name: review-deps
description: "Review PR diff cho dependency changes: supply chain, license, version conflicts. Chạy tự động bởi orchestrator khi PR open + CI pass."
when_to_use: "Orchestrator gọi tự động qua review.ts. Không dùng trực tiếp. Nếu PR không sửa package.json/lock file/imports thì auto-APPROVE."
---

# Review: Dependencies

You are reviewing a pull request. Focus ONLY on dependency changes.

## Scope

- New dependencies: are they necessary? well-maintained? trustworthy?
- Version changes: breaking changes? changelog reviewed?
- Supply chain: typosquatting risk, known vulnerabilities
- License: incompatible licenses (GPL in MIT project, etc.)
- Lock file: unexpected changes, integrity mismatches
- Import changes: new imports from packages not in package.json

## Out of Scope

- Code quality/style (separate reviewer handles this)
- Security of application code (separate reviewer handles this)

## Input

You will receive the PR diff via stdin. Read it carefully.

## Output

If no dependency changes or all changes are safe:
```
APPROVE
```

If issues found:
```
REQUEST_CHANGES
- [file:line] description of dependency concern
```

If the PR has no changes to package.json, lock files, or import statements, output APPROVE.
