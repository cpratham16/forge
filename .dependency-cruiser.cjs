/**
 * Mechanical enforcement of the dependency rule in docs/PROJECT_OVERVIEW.md §4
 * and docs/PHASED_PLAN.md Phase 0.
 *
 *   contracts  -> (nothing)
 *   core       -> contracts
 *   adapters   -> contracts, core
 *   cli        -> core, adapters, contracts
 *
 * Forbidden: core -> adapters, core -> any external SDK or node builtin,
 * contracts -> anything at all.
 *
 * This file is the reason the architecture survives contact with an agent
 * working unattended. Do not weaken a rule here to make a build pass — that
 * is exactly the "silently downgrading a requirement" failure AGENTS.md §10
 * forbids. If a rule is genuinely wrong, change it in a dedicated PR that
 * says so in the title.
 */
module.exports = {
  forbidden: [
    {
      name: 'contracts-is-pure',
      comment:
        'packages/contracts must have zero dependencies — pure types only (PRD §5, PHASED_PLAN Phase 1).',
      severity: 'error',
      from: { path: '^packages/contracts' },
      to: {
        pathNot: '^packages/contracts',
      },
    },
    {
      name: 'core-must-not-import-adapters',
      comment:
        'The core domain must never depend on a concrete adapter. Inject the port instead (PRD §5).',
      severity: 'error',
      from: { path: '^packages/core' },
      to: { path: '^packages/adapters' },
    },
    {
      name: 'core-must-not-import-cli',
      comment: 'The core domain must not depend on its consumer.',
      severity: 'error',
      from: { path: '^packages/core' },
      to: { path: '^packages/cli' },
    },
    {
      name: 'core-must-not-import-external-sdks',
      comment:
        'core has zero external imports. No vendor SDKs, no HTTP clients (PRD §5, PROJECT_OVERVIEW §4).',
      severity: 'error',
      from: { path: '^packages/core' },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer'] },
    },
    {
      name: 'core-must-not-import-node-builtins',
      comment:
        'core must not touch the filesystem, network, or child processes directly — those are adapter concerns (PROJECT_OVERVIEW §4).',
      severity: 'error',
      from: { path: '^packages/core' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'adapters-must-not-import-cli',
      comment: 'Adapters must not depend on the CLI.',
      severity: 'error',
      from: { path: '^packages/adapters' },
      to: { path: '^packages/cli' },
    },
    {
      name: 'no-circular',
      comment: 'Circular dependencies make the hexagon meaningless.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'Dead modules — delete them or wire them up.',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$',
          '\\.d\\.ts$',
          '(^|/)tsconfig\\.json$',
          '(^|/)package\\.json$',
        ],
      },
      to: {},
    },
    {
      name: 'not-to-dev-dep',
      comment: 'Production code must not import a devDependency.',
      severity: 'error',
      from: { path: '^packages', pathNot: '\\.(spec|test)\\.(js|mjs|cjs|ts)$' },
      to: { dependencyTypes: ['npm-dev'] },
    },
  ],

  options: {
    doNotFollow: { path: ['node_modules', 'dist'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      dot: { collapsePattern: 'node_modules/(?:@[^/]+/[^/]+|[^/]+)' },
      text: { highlightFocused: true },
    },
  },
};
