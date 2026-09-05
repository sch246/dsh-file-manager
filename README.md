# DeepSeek Harness File Manager

`@dsh-external/dsh-file-manager` adds an authenticated Web file tree and the `filesystem` resource source used by `@dsh-external/dsh-file-viewer`. It is an out-of-tree Bundle for DeepSeek Harness `0.1.2-alpha.2`.

## Behavior

- The Files launcher opens a Session-owned `file-manager-tree` instance in `@dsh-external/dsh-right-sidebar`.
- Session cwd is the initial directory only. The editable address accepts absolute paths anywhere the Host service process can access.
- Directories load lazily. Non-overlapping polling refreshes the current and expanded loaded directories while retaining expansion, selection, filter, and the mounted scroll container; failed listings remain visible with an error.
- The loaded-tree filter matches names and relative paths, keeps matching ancestors, and never scans unloaded directories as the user types.
- Directory selections from resource locations launch or activate the tree. A file single click requests a preview to the right of the tree; double click requests a permanent tab through `ctx.resourceWorkbench.open()`.
- Chat workspace file clicks use the same central resource opener under the configured `preview`, `system`, or `preview-or-system` waterfall policy.

This browser capability intentionally does not use `ctx.fs`: agent sandbox and approval policy do not constrain authenticated user-interface filesystem operations. Deploy the Web Host under the operating-system account whose files the user is meant to manage.

## Host configuration

The Bundle inserts:

```yaml
- id: dsh-file-manager
  name: '@dsh-external/dsh-file-manager'
  config:
    maxTextReadBytes: 1048576
    maxByteReadBytes: 16777216
    resourcePollIntervalMs: 2000
    directoryPollIntervalMs: 2000
    openMode: preview-or-system
    deleteMode: trash
    moveCommand: mv
```

`maxTextReadBytes` and `maxByteReadBytes` are separate inclusive complete-read and save limits. `resourcePollIntervalMs` delays text and byte source checks while subscribed; `directoryPollIntervalMs` delays loaded-directory refresh cycles. Polls schedule only after the preceding cycle completes. `openMode` controls Chat file links. `deleteMode: trash` exposes recoverable trash as the default action; `permanent` disables trash when the deployment cannot provide it. Permanent deletion remains an explicit confirmed row action in either mode. Profile and Home patch layers replace a row's complete `config`, so preserve all fields when overriding one.

## Resource reads and save guarantees

Metadata and directory listings use stat information and filename MIME lookup without reading file content. Byte reads accept arbitrary regular-file bytes within `maxByteReadBytes` and cross the JSON Remote as canonical base64 before the Client recreates `Uint8Array`. Text reads separately require UTF-8 without NUL bytes and stay within `maxTextReadBytes`. CRLF and CR are canonicalized to LF for the editor. The opaque revision retains the original EOL convention for text, an exact pattern for mixed-EOL input, content SHA-256, canonical path, and stat fields; editor text represents terminal-newline presence. Text save restores EOLs from that revision. Byte save preserves exact bytes. Both publish through the same same-directory staged writer.

The source reports `supportsConditionalTextSave` and `supportsConditionalByteSave` with a bounded guarantee: writes issued by this plugin to one canonical resource are serialized, and every save rechecks the exact loaded hash/stat revision immediately before atomic replacement. Ordinary portable filesystems do not offer universal compare-and-swap against an uncooperative external writer in the interval between the last check and rename. Such a writer can still race publication.

Create operations use exclusive filesystem creation. Moves use the configured GNU `moveCommand` with `--no-clobber`, `--no-copy`, and `--no-target-directory`; a late destination cannot be replaced on the current Linux filesystem's no-replace rename path. Cross-filesystem moves and hosts without these GNU options fail without a copy/delete fallback. The default command is `mv`; configure its executable path when needed. See [GNU mv](https://www.gnu.org/s/coreutils/manual/html_node/mv-invocation.html).

Staged saves restore permission bits. Replacing an inode can change ownership, access-control entries, extended attributes, and other filesystem-specific metadata; this editor does not promise to preserve those fields.

## Removal safety

When recoverable trash is configured, its row action sends files, links, empty directories, or non-empty directories to the operating system trash without confirmation. Failure is visible and never invokes permanent deletion. The separate permanent action asks once, names the target and irreversibility, and does not require typing the path. The Host rejects filesystem root and unlinks a symbolic link instead of recursively traversing its target.

Confirmation addresses the named path, not a retained inode. An external process can replace a path between selection and the trash operation; inspect the operating-system trash when recovering it.

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
- `@dsh-external/dsh-file-viewer/client`: `ctx.resourceWorkbench` source registration and handler-routed opening.
- Harness Session Controller Client: optional native path opening and Chat's terminal waterfall behavior.

The integrated resource-workbench package omits a workspace Host Remote, filesystem source, and Chat listener; two filesystem sources or Chat listeners would create duplicate ownership.
