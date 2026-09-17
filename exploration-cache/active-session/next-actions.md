# Next Actions

> Updated: 2026-09-17

1. Fred validates S2.5 locally on `sprint-2/catalogue-foundation` using the recorded shared/server/db gate.
2. If any command fails: diagnose exact output, apply the smallest fix, commit, and retest only the affected gate plus required regression checks.
3. If all commands are green:
   - mark S2.5 validated/closed in repo state;
   - update `changelog.md` with validated S2.5 changes;
   - set the S2.5 Notion backlog task to `Terminé` and update Sprint 2/dashboard notes;
   - fast-forward `main` to the validated Sprint 2 branch head.
4. After S2.5 closure, decide the next slice: admin capacity/waitlist UI or prospect request/contact workflow, according to Sprint 2 dependency/business priority.
