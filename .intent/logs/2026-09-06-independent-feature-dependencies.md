# Dependency and installation-map observations

The September 6, 2026 user instruction “可联动不意味着必依赖” requires independent feature installation. A subsequent correction establishes STATE as the detailed executable installation prompt, refined through feedback and actual environment observations. STATE therefore owns installation goals and adaptation instructions; this log owns recorded implementation constraints, migration work and evidence. A shared package in the manager repository is an implementation option, not an immutable user requirement.

## Recorded deployment

Recorded deployment: compact source installed and activated under [the deployment log](../logs/2026-09-06-compact-ui-activation.md). This local STATE is an installation and behavior map, not the meta-intent protocol. The historical deployment establishes neither acceptance nor compatibility of a new target Host. [The compact manager log](../logs/2026-09-06-compact-manager.md) records implementation evidence.

## Observed implementation and scripts

The following map was recorded before the installation-prompt correction. It describes the supplied implementation, not required installation behavior. In particular, its cross-feature dependencies and removal order must not override the [installation map](../state/STATE.md#installation-map).

### Dependencies and owners

| Owner | Required contribution and location |
| --- | --- |
| Harness Web Host | Authenticated Remote access and Session workspace metadata; process permissions authorize user filesystem operations. The package targets `0.1.2-alpha.2`. Build its Typert generator with `externalProjectReferences` support before this package. |
| `@dsh-external/dsh-right-sidebar` | Build and compose first. Owns tree placement, groups, previews, dragging, tab layout and persistence. |
| `@dsh-external/dsh-file-viewer` plus editor | Build and install through the viewer's joint transaction before manager. Owns generic resource opening, handler choice and shared document synchronization; editor remains a plain dependency. |
| Manager Bundle | [Package manifest](../../packages/dsh-file-manager/package.json) and [Bundle patch](../../packages/dsh-file-manager/cordis.patch.yml) identify the Host/Client contribution. [Filesystem implementation](../../packages/dsh-file-manager/src/filesystem.ts) owns metadata and mutation; [Client registration](../../packages/dsh-file-manager/src/client/index.ts) supplies the filesystem source, Files launcher and tree renderer. |
| Optional `@dsh-external/dsh-resource-links` | Install after the three providers above. Owns Chat recognition and `preview\|system` policy; consumes manager metadata and Files selection. Manager has no dependency on this consumer. |

### Build, install and removal

The [repository guide](../../README.md#build-and-test) owns commands, Host configuration and platform limits. Development links expect viewer and sidebar sibling checkouts; satisfy these links and build dependencies before compiling the manager. Builds generate Host declarations and bundles, project the Typert Remote, then compile and bundle the Client.

All profile commands require explicit `DSH_CHECKOUT`, `DSH_HOME` and `DSH_PROFILE`. [Setup](../../scripts/setup.sh) defaults to `--check`; `pnpm run setup --install` builds the package, adds its package directory with `dsh plugin add`, then checks manifest, lock, exact installed path and composed rows. [Uninstall](../../scripts/uninstall.sh) defaults to `--check`; `pnpm run uninstall --remove` removes this Bundle only. Pass flags directly after the script name, without an extra `--`. Neither command installs sibling providers, applies Harness patches or restarts services.

Remove resource-links and any other manager consumers before manager; viewer/editor and sidebar may remain for other resources. Inspect the profile manifest, lockfile, actual package target, Bundle membership and composed rows after a transaction. Current manager removal checks only whether `dsh plugin why` still resolves the package, so a successful return alone does not prove residual symlinks or generated browser entries are absent. Manager removal has no general residual-link cleanup or Host receipt transfer. Browser preferences remain browser-owned, and uninstall does not delete user filesystem content.

### Host adaptation and operational limits

Manager uses public Host Remote and sidebar/workbench APIs and owns no Harness source patch. Its native-open capability delegates an explicit source action to the Session Controller; it does not choose Chat opening policy. The [Chat cutover evidence](../logs/2026-09-05-resource-links-cutover.md) records removal of the manager Chat listener and `openMode` configuration. Installing an older manager with those responsibilities would duplicate the independent links owner.

The viewer repository retains a historical Chat waterfall patch. Resource-links carries an incremental Host adapter over that baseline and an exact ownership receipt; current manager scripts do not adopt or reverse either contribution. The [resource-links baseline preparation map](https://github.com/sch246/dsh-resource-links/blob/main/.intent/state/STATE.md#preparing-a-host-that-lacks-the-baseline) identifies the initial Chat symbols, separately owned Typert support and the adaptation/ownership record needed before installation on a new Host. An integrator must resolve overlapping historical Host changes with their recorded owners, not assign them to manager merely because it provides filesystem data. After a Host upgrade, rebuild against the selected declarations, check the Remote and Client registrations and verify the composed tree/resource flow. A package build alone does not establish Host-adapter compatibility or a functioning browser.

## Outstanding implementation work

Shared-provider extraction, viewer-owned filesystem source and resource polling, a common Host opening entry and optional Links ownership still require runtime implementation. Manager's required viewer/workbench injection, direct viewer opening and filesystem source registration must be replaced rather than treated as necessary product dependencies. Configuration adaptation must preserve effective values and complete rows; installation scripts and artifact consumption must follow the independent feature graph. The documentation commits perform none of these runtime changes.

Source evidence: the [manager manifest](../../packages/dsh-file-manager/package.json) declares viewer; [Client registration](../../packages/dsh-file-manager/src/client/index.ts) constructs `FilesystemResourceSource`, reads `resourcePollIntervalMs` and requires `resourceWorkbench`; the [Host configuration](../../packages/dsh-file-manager/src/index.ts) owns that field and [source adapter](../../packages/dsh-file-manager/src/client/source.ts) imports viewer types.

## Evidence and documentation checks

The compact implementation and activation logs linked above retain their actual commands and observations. They do not prove every platform, touch layout, extreme pane width or user mutation flow; home-trash browsing excludes other volumes and restoration. This documentation update changes no runtime, profile or service and does not repeat historical browser or filesystem checks.

The initial dependency-map commit and this installation-prompt correction modify only STATE, AGENTS and this log in isolated worktrees. `git diff --check`, `git diff --cached --check` and local Markdown target/fragment checks passed for the initial commit. The correction is checked with `git diff --check` and local Markdown target/fragment checks. No runtime tests, profile operations, installations or service activations are performed for these documentation changes; historical logs and frozen records remain untouched.

## Isolated implementation of independent manager

Manager now depends on sidebar and the shared user-files provider. Viewer imports, resource descriptors/source registration, content endpoints and resource polling configuration are removed. The directory listener uses shared metadata and delegates files to the common Host opening chain. The manager-only Client test exposed missing Session injection for native fallback; `sessions` and `remote.session` are now explicit runtime dependencies.

The shared provider owns Session path resolution and one mutation queue used by saves and management operations. Deletion-before-save cannot republish the removed path, and cancelled queued creation does not touch disk. Manager keeps directory polling, tree state and deletion/move behavior. Existing tree/panel/management tests passed 36 cases before the final queue change; the final filesystem/Remote/manager-only Client check passed 10 tests across 3 files, and final build/typecheck passed.

The stale lockfile describing sibling Viewer links is removed deliberately. This unpublished candidate uses explicit `install:local` package-directory or tarball inputs, pinned local tools and ordinary compatible manifest ranges; it makes no frozen-lock reproducibility claim until independently released artifacts are available. Setup validates actual shared/sidebar versions and reuses compatible providers; uninstall retains them. No live profile, receipt or service was changed.
