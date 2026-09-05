# DeepSeek Harness File Manager

`@dsh-external/dsh-file-manager` adds an authenticated Web file tree and the `filesystem` resource source used by `@dsh-external/dsh-file-viewer`. It is an out-of-tree Bundle for DeepSeek Harness `0.1.2-alpha.2`.

## Behavior

- The Files launcher opens a Session-owned `file-manager-tree` instance in `@dsh-external/dsh-right-sidebar`.
- Session cwd is the initial directory only. The editable address accepts absolute paths anywhere the Host service process can access.
- The path input stays visible; Enter navigates. New file, New folder, Refresh, and More appear over the first list row on hover or keyboard focus. Touch devices show More as the expansion target with the other actions inside it. Narrow panes progressively move Refresh, New folder, and New file into More.
- Directories load lazily. Non-overlapping polling refreshes the current and expanded loaded directories while retaining expansion, selection, filter, and the mounted scroll container; failed listings remain visible with an error.
- More contains browser-persisted Show hidden files, Move to trash when deleting, and Filter switches. Filter reveals an input only while enabled; disabling it stops filtering and retains each tree's query. The loaded-tree filter matches names and relative paths, keeps matching ancestors, and never scans unloaded directories as the user types.
- Browser reload restores each tree's current root, expanded directories, selection, and filter query. The v2 descriptor excludes browser preferences; v1 navigation remains readable without restoring its hidden-entry value. Cleanup runs only after the sidebar authoritatively removes the instance.
- Directory selections from resource locations launch or activate the tree. A file click selects the visible row while opening its canonical resource; single click requests a preview to the right of the tree, and double click requests a permanent tab through `ctx.resourceWorkbench.open()`.
- The independent `@dsh-external/dsh-resource-links` plugin owns Chat path presentation and preview/system routing using this manager's metadata and Files launcher.

This browser capability intentionally does not use `ctx.fs`: agent sandbox and approval policy do not constrain authenticated user-interface filesystem operations. Deploy the Web Host under the operating-system account whose files the user is meant to manage.

## Host configuration

The Bundle inserts:

```yaml
- id: dsh-file-manager
  name: '@dsh-external/dsh-file-manager'
  config:
    maxResolveBatchSize: 128
    maxTextReadBytes: 1048576
    maxByteReadBytes: 16777216
    resourcePollIntervalMs: 2000
    directoryPollIntervalMs: 2000
    deleteMode: trash
    moveCommand: mv
```

`maxResolveBatchSize` caps metadata paths per request. `maxTextReadBytes` and `maxByteReadBytes` are separate inclusive complete-read and save limits. `resourcePollIntervalMs` delays text and byte source checks while subscribed; `directoryPollIntervalMs` delays loaded-directory refresh cycles. Polls schedule only after the preceding cycle completes. `deleteMode` initializes the browser's Move to trash preference only when no valid saved preference exists. Profile and Home patch layers replace a row's complete `config`, so preserve all fields when overriding one.

## Resource reads and save guarantees

`fileManager.resolveMany({ sessionId, paths })` resolves up to `maxResolveBatchSize` paths using the same metadata operation as `resolve`. It preserves input order and duplicates in `{ inputPath, ok: true, value }` or `{ inputPath, ok: false, error: { code, message } }` results. One missing or inaccessible path does not discard other results. Oversized batches and cancellation reject the whole request. Neither operation reads file content.

Metadata and directory listings use stat information and filename MIME lookup without reading file content. Byte reads accept arbitrary regular-file bytes within `maxByteReadBytes` and cross the JSON Remote as canonical base64 before the Client recreates `Uint8Array`. Text reads separately require UTF-8 without NUL bytes and stay within `maxTextReadBytes`. CRLF and CR are canonicalized to LF for the editor. The opaque revision retains the original EOL convention for text, an exact pattern for mixed-EOL input, content SHA-256, canonical path, and stat fields; editor text represents terminal-newline presence. Text save restores EOLs from that revision. Byte save preserves exact bytes. Both publish through the same same-directory staged writer.

The source reports `supportsConditionalTextSave` and `supportsConditionalByteSave` with a bounded guarantee: writes issued by this plugin to one canonical resource are serialized, and every save rechecks the exact loaded hash/stat revision immediately before atomic replacement. Ordinary portable filesystems do not offer universal compare-and-swap against an uncooperative external writer in the interval between the last check and rename. Such a writer can still race publication.

Create operations use exclusive filesystem creation. Moves use the configured GNU `moveCommand` with `--no-clobber`, `--no-copy`, and `--no-target-directory`; a late destination cannot be replaced on the current Linux filesystem's no-replace rename path. Cross-filesystem moves and hosts without these GNU options fail without a copy/delete fallback. The default command is `mv`; configure its executable path when needed. See [GNU mv](https://www.gnu.org/s/coreutils/manual/html_node/mv-invocation.html).

Staged saves restore permission bits. Replacing an inode can change ownership, access-control entries, extended attributes, and other filesystem-specific metadata; this editor does not promise to preserve those fields.

## Removal safety

The More menu's Move to trash when deleting switch governs each row's single Delete button: checked sends files, links, empty directories, or non-empty directories to operating-system trash without confirmation; unchecked asks once for permanent deletion, names the target and irreversibility, and does not require typing the path. Failure is visible and never invokes another deletion mode. Trash receives literal paths with glob expansion disabled. The preference applies to every manager tree and persists across browser reloads independently of tree restoration; if browser storage is unavailable, it lasts for the current page. The Host rejects filesystem root and unlinks a symbolic link instead of recursively traversing its target.

Open trash in More navigates to the Linux provider's home trash `files` directory, using the same `xdg-trashdir` resolver as the installed `trash` library. The Host does not create a missing directory for browsing. WSL and other operating systems report unsupported browsing; missing or inaccessible directories report an error while retaining the current tree. Stored filenames may be generated IDs. This is ordinary directory browsing, without original-name reconstruction, other-volume aggregation, or restoration; the tree displays that scope after opening trash.

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
DSH_CHECKOUT=/root/deepseek-harness DSH_HOME=/tmp/private-dsh-home DSH_PROFILE=web pnpm run setup --install
DSH_CHECKOUT=/root/deepseek-harness DSH_HOME=/tmp/private-dsh-home DSH_PROFILE=web pnpm run uninstall
DSH_CHECKOUT=/root/deepseek-harness DSH_HOME=/tmp/private-dsh-home DSH_PROFILE=web pnpm run uninstall --remove
```

First installation is a high-risk Bundle change. Validate it in a private Home with the intended sibling package set and cold Web boot before targeting a managed profile. Scripts call `dsh plugin` so manifest, lockfile, resolution, and Bundle membership move together; they never apply Harness patches or restart a service.

## Integration requirements

- `@dsh-external/dsh-right-sidebar/client`: launcher and `rightbar.view` multi-instance APIs.
- `@dsh-external/dsh-file-viewer/client`: `ctx.resourceWorkbench` source registration and handler-routed opening.
- Harness Session Controller Client: optional native path opening for filesystem resources.

The manager owns the filesystem Remote and source. The independent resource-links plugin consumes these APIs and owns Chat routing; the manager has no dependency on that consumer.
