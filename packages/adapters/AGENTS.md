# @forge/adapters — local rules

Where the outside world is allowed in.

- May import `@forge/contracts` and `@forge/core`. May import vendor SDKs and
  node builtins — that is this package's entire job.
- **Every adapter passes the same contract test suite as the mock.** The suite
  lives with the port it implements (`test/<port>/contract.test.ts`). A new
  adapter is not done when it works; it is done when it passes the identical
  behavioral tests the mock passes.
- Write the mock adapter **first**, run the contract tests against it, and only
  then build the real one. If the real adapter needs the contract to change,
  that is a signal the port was designed wrong — fix the port deliberately, do
  not special-case the adapter.
- Keep vendor specifics inside the adapter. Nothing vendor-shaped should appear
  in a return type — that leaks back into core through the contract.
- `policy/capability-isolation.ts` carries real security weight: the agent's
  execution environment must not have network access to the harness control plane.
