# DeepSeek Harness File Manager

`@dsh-external/dsh-file-manager` adds an authenticated Web file tree and the `filesystem` text source used by `@dsh-external/dsh-file-viewer`. It is an out-of-tree Bundle for DeepSeek Harness `0.1.2-alpha.2`.

## Behavior

- The Files launcher opens a Session-owned `file-manager-tree` instance in `@dsh-external/dsh-right-sidebar`.
- Session cwd is the initial directory only. The editable address accepts absolute paths anywhere the Host service process can access.
- Directories load lazily and support hidden entries, refresh, empty file/folder creation, rename/move, and recoverable trash.
- Directory selections from editor breadcrumbs launch or activate the tree. File rows open independent text-editor instances through `ctx.fileViewer.open()`.
- Chat workspace file clicks use the configured `preview`, `system`, or `preview-or-system` waterfall policy.

This browser capability intentionally does not use `ctx.fs`: agent sandbox and approval policy do not constrain authenticated user-interface filesystem operations. Deploy the Web Host under the operating-system account whose files the user is meant to manage.

## Host configuration

The Bundle inserts:

```yaml
- id: dsh-file-manager
  name: '@dsh-external/dsh-file-manager'
  config:
    maxReadBytes: 1048576
    pollIntervalMs: 2000
    openMode: preview-or-system
```

`maxReadBytes` is the inclusive complete UTF-8 load/save limit. `pollIntervalMs` is the delay after each completed viewer-source poll; polls never overlap and exist only while the source is subscribed. `openMode` controls Chat file links. Profile and Home patch layers replace a row's complete `config`, so preserve all fields when overriding one.

## Text and save guarantees

Loads accept regular UTF-8 files without NUL bytes. CRLF and CR are canonicalized to LF for the editor. The opaque revision retains the original EOL convention, an exact pattern for mixed-EOL input, content SHA-256, canonical path, and stat fields; the editor text represents terminal-newline presence. Save restores EOLs from that revision and publishes through a same-directory staged rename.

The source reports `supportsConditionalSave: true` with a bounded guarantee: writes issued by this plugin to one canonical resource are serialized, and every save rechecks the exact loaded hash/stat revision immediately before atomic replacement. Ordinary portable filesystems do not offer universal compare-and-swap against an uncooperative external writer in the interval between the last check and rename. Such a writer can still race publication.

Create and move operations reject destinations observed to exist and serialize plugin mutations. An external process can race the final existence check on platforms without a portable no-replace rename. The plugin never intentionally overwrites an observed destination.

Staged saves restore permission bits. Replacing an inode can change ownership, access-control entries, extended attributes, and other filesystem-specific metadata; this editor does not promise to preserve those fields.

## Removal safety

The UI asks the user to type the complete path. The Host requires an exact normalized match, rejects filesystem root, and sends files, links, empty directories, or non-empty directories to the operating system's recoverable trash through `trash`. It never runs recursive permanent deletion.

## Build and test

```bash
pnpm install
DSH_CHECKOUT=/root/deepseek-harness pnpm test
DSH_CHECKOUT=/root/deepseek-harness pnpm typecheck
DSH_CHECKOUT=/root/deepseek-harness pnpm build
```

The Harness Typert generator must already be built and support `externalProjectReferences`.

## Setup and uninstall

All lifecycle commands require explicit targets and inspect by default:

```bash
DSH_CHECKOUT=/root/deepseek-harness DSH_HOME=/tmp/private-dsh-home DSH_PROFILE=web pnpm run setup
DSH_CHECKOUT=/root/deepseek-harness DSH_HOME=/tmp/private-dsh-home DSH_PROFILE=web pnpm run setup -- --install
DSH_CHECKOUT=/root/deepseek-harness DSH_HOME=/tmp/private-dsh-home DSH_PROFILE=web pnpm run uninstall
DSH_CHECKOUT=/root/deepseek-harness DSH_HOME=/tmp/private-dsh-home DSH_PROFILE=web pnpm run uninstall -- --remove
```

First installation is a high-risk Bundle change. Validate it in a private Home with the intended sibling package set and cold Web boot before targeting a managed profile. Scripts call `dsh plugin` so manifest, lockfile, resolution, and Bundle membership move together; they never apply Harness patches or restart a service.

## Integration requirements

- `@dsh-external/dsh-right-sidebar/client`: launcher and `rightbar.view` multi-instance APIs.
- `@dsh-external/dsh-file-viewer/client`: `registerSource()` plus multi-instance `open()`.
- Harness Session Controller Client: optional native path opening and Chat's terminal waterfall behavior.

The integrated file-viewer package omits a workspace Host Remote, filesystem source, and Chat listener; two filesystem sources or Chat listeners would create duplicate ownership.
