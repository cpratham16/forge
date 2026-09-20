# @runforge/contracts — local rules

The strictest package in the repo. Read before editing anything here.

- **Zero dependencies.** No `dependencies`, no `devDependencies`, no imports of
  any kind outside this package. `dependency-cruiser` fails the build on any
  import that leaves this directory.
- **No executable code.** Types, interfaces, and type-only unions. No classes
  with bodies, no constants with runtime values, no helper functions. If you
  need a value, it belongs in `core` or an adapter.
- **This is the contract everyone else codes against.** Changing a port
  signature here is a breaking change for every adapter implementing it.
  Do not reshape a port to make one adapter more convenient — that inverts the
  dependency direction the whole architecture rests on.
- Port definitions live in `src/ports/`, domain types in `src/domain/`, error
  types in `src/errors/`. The full intended file list is in
  docs/PROJECT_OVERVIEW.md §1; the exact signatures are in §2 and §3.
- Tests here are type-level (`test/*.test-d.ts`), verifying that an implementer
  must satisfy the contract. There is nothing runtime to unit-test.
