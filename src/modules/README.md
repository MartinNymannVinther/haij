# Modules

Business modules land here from phase 1 onwards:

```
src/modules/{crm,time,invoicing,projects,signals,knowledge}
```

Rules (from CLAUDE.md):

- Modules communicate through the shared kernel in `src/core` (auth,
  tenancy, events, audit) — never through each other's tables.
- Every module table carries `org_id`, ships with forced RLS policies, an
  audit trigger and isolation tests (see CONTRIBUTING.md's tenancy
  checklist).
- Data access goes through `withOrgContext()`; no module talks to the
  database outside a tenant context.
