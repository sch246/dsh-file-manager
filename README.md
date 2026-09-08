# DeepSeek Harness File Manager

## Workspace operations

The root is a development workspace; installable packages live under `packages/`. Run these root entries with prepared repository-local dependencies. `DSH_CHECKOUT` selects compatible Host source/declarations; profile operations also require explicit `DSH_HOME` and `DSH_PROFILE`.

| Root entry | Direct command from this repository | Effect |
| --- | --- | --- |
| `build` | `bash scripts/build.sh` | Build owned package artifacts. |
| `typecheck` | `bash scripts/typecheck.sh` | Check owned Host and Client programs. |
| `setup` | `bash scripts/setup.sh` | Inspect by default; append `--install` for installation. |
| `inspect` | `bash scripts/setup.sh --check` | Inspect only. |
| `remove` | `bash scripts/uninstall.sh` | Inspect by default; append `--remove` for removal. |

Build, typecheck and existing tests call installed Node tools directly; they never install dependencies. Tool versions are TypeScript 5.9.3, tsdown 0.22.14 and Vitest 4.1.8, with pnpm 10.17.1 declared for explicit dependency preparation. Use independent dependency directories when reusing existing package contents. Installation and removal retain the existing `dsh plugin` transactions and never restart services. The `uninstall` alias, where present, has the same inspection default as `remove`.

Each repository and package keeps its own version: compatibility means satisfying declared API ranges, not equal version numbers. Optional cooperation does not make another feature a required dependency. Root and distributed package licenses are MIT, with their copyright notices retained.

`@dsh-external/dsh-file-manager` adds an authenticated Web file tree. It depends on sidebar and `@dsh-external/dsh-user-files`, and works without Viewer or Links.

## Behavior

- The Files launcher opens a Session-owned `file-manager-tree` instance in `@dsh-external/dsh-right-sidebar`.
- Session cwd is the initial directory only. The editable address accepts absolute paths anywhere the Host service process can access.
- Directory changes join the containing sidebar group’s single Back/Forward history alongside tab changes. Sidebar owns Alt+Left/Right, mouse side buttons and replay focus; manager reports committed destinations and restores directory, expansion, filter and selection. Failed or superseded directory loads do not move the cursor. Refresh, expansion and filtering do not add entries. Browser reload starts fresh group history.
- The path input stays visible; Enter navigates. New file, New folder, optional Upload, Refresh, and More float outside the scroll container, aligned with the first list row at rest, on hover or keyboard focus. Touch devices show More as the expansion target with the other actions inside it. Narrow panes progressively move Refresh, New folder, and New file into More.
- Directories load lazily. Non-overlapping polling refreshes the current and expanded loaded directories while retaining expansion, selection, filter, and the mounted scroll container; failed listings remain visible with an error.
- More contains browser-persisted Show hidden files, Move to trash when deleting, and Filter switches. Filter reveals an input only while enabled; disabling it stops filtering and retains each tree's query. The loaded-tree filter matches names and relative paths, keeps matching ancestors, and never scans unloaded directories as the user types.
- Browser reload restores each tree's current root, expanded directories, selection, and filter query. The v2 descriptor excludes browser preferences; v1 navigation remains readable without restoring its hidden-entry value. Cleanup runs only after the sidebar authoritatively removes the instance.
- Directory selections from resource locations launch or activate the tree. A file click selects the visible row while opening its canonical resource; single click requests a preview to the right of the tree, and double click requests a permanent tab through the common Host `openWorkspaceFile()` request.
- Manager handles directories in the common Host opening waterfall and delegates files. Without Viewer, unhandled files reach the native opener on the service-process machine; errors remain visible. Optional Links belongs to user-files.

This browser capability intentionally does not use `ctx.fs`: agent sandbox and approval policy do not constrain authenticated user-interface filesystem operations. Deploy the Web Host under the operating-system account whose files the user is meant to manage.

## Host configuration

The Bundle inserts:

```yaml
- id: dsh-file-manager
  name: '@dsh-external/dsh-file-manager'
  config:
    directoryPollIntervalMs: 2000
    deleteMode: trash
    moveCommand: mv
```

`directoryPollIntervalMs` delays loaded-directory refresh cycles after the previous cycle completes. `deleteMode` initializes the browser preference only when no saved preference exists. Profile and Home patches replace complete config rows, so preserve unrelated fields when overriding one.

## Filesystem ownership

The shared user-files provider owns Session cwd resolution, canonical metadata, bounded text/byte reads and one guarded publication queue. Viewer owns the filesystem source and its resource polling. Manager owns directory listings, creation, moving, deletion and browser transfer controls; it uses shared canonical metadata while retaining the visible link path for mutation. See the provider's package reference for revision, EOL and content limits.

Create operations use exclusive filesystem creation. Moves use the configured GNU `moveCommand` with `--no-clobber`, `--no-copy`, and `--no-target-directory`; a late destination cannot be replaced on the current Linux filesystem's no-replace rename path. Cross-filesystem moves and hosts without these GNU options fail without a copy/delete fallback. The default command is `mv`; configure its executable path when needed. See [GNU mv](https://www.gnu.org/s/coreutils/manual/html_node/mv-invocation.html).

## Browser transfers

Upload, per-file Download and the Parallel download checkbox appear on all connections, including local access and SSH forwarding. Loopback detection and native opener availability do not hide transfer controls or optional manager drop-upload regions. Upload sits alongside the creation actions and moves into More in narrow panes; Download sits immediately left of Delete for regular files. The filter has no loaded-folder helper text; filtering still searches loaded entries only.

Upload accepts multiple selected files. With the optional `@dsh-external/dsh-file-drop` plugin, it also accepts files dropped on the visible manager panel. It captures the displayed root directory, streams files sequentially, and creates each original filename exclusively. Expanded folders do not change the destination. Navigation, superseding operations and committed tree close cancel unfinished uploads; files already published remain. The first failed file stops the batch and appears in the tree error area. The optional plugin owns native-file event routing; manager owns its panel region, acceptance, upload behavior and visual feedback.

The manager panel covers only its group content, excluding sidebar tabs. During a targeted drag it shows a translucent blurred layer, an SVG file/folder upload illustration, and the displayed destination path. A busy or unready directory shows a blocked invitation and rejects the drop. Pointer events continue to reach the region beneath the decoration. The plugin routes the deepest matching region exclusively; other groups and Chat do not receive that drop.

File-drop is an optional peer (`^0.1.0`), absent from manager's Bundle and required Client injection list. Install its independent Bundle only when drag upload is wanted. Manager uses an unawaited optional service subscription for each mounted panel, so a missing, later-loaded or removed provider never disables browsing, button upload or download. Removing the provider clears the overlay and unregisters its regions; removing manager retains the standalone plugin for other consumers. The standalone plugin depends on no manager, sidebar or Viewer feature.

Manager uses the browser-safe `@dsh-external/dsh-user-files/transfer` URL helper for the provider-owned `/api/user-files/transfer` endpoint. It retains upload batches, destination selection, cancellation and browser download handoff; the provider owns authentication, streaming and exclusive publication. Download uses the existing row button. The More menu has one browser-persisted Parallel download checkbox, unchecked by default: unchecked uses ordinary browser download; checked selects a local file and uses bounded parallel ranges with a black progress bar below the address. Unsupported direct-writing browsers use ordinary handoff. Errors remain in the tree, and navigation or superseding tree operations cancel unfinished custom downloads. Native handoff retains browser-owned progress and cancellation.

Install user-files ^0.1.13 with the Web composition's `connection` and `webServer` services. Preserve the effective old manager `maxUploadBytes` value in the complete user-files config row, then remove that field from manager. The provider default is 10 GiB per file. Migrate any exact reverse-proxy location from `/api/file-manager/transfer` to `/api/user-files/transfer`, retaining upstream headers, cookie policy, matching request limits, disabled request/response buffering and appropriate timeouts. The provider package reference owns the HTTP protocol and streaming limitations.

## Removal safety

Outside the home trash, the More menu's Move to trash when deleting switch governs each row's single Delete button: checked sends files, links, empty directories, or non-empty directories to operating-system trash without confirmation; unchecked asks once for permanent deletion, names the target and irreversibility, and does not require typing the path. Failure is visible and never invokes another deletion mode. Trash receives literal paths with glob expansion disabled. The preference applies to every manager tree and persists across browser reloads independently of tree restoration; if browser storage is unavailable, it lasts for the current page. The Host rejects filesystem root and unlinks a symbolic link instead of recursively traversing its target.

Open trash in More navigates to the Linux provider's home trash `files` directory, using the same `xdg-trashdir` resolver as the installed `trash` library. The Host does not create a missing directory for browsing. WSL and other operating systems report unsupported browsing; missing or inaccessible directories report an error while retaining the current tree. Stored filenames may be generated IDs. Browsing excludes original-name reconstruction and other-volume aggregation. Within the home trash root and its subdirectories, Delete always requires one explicit permanent-deletion confirmation, regardless of the preference. The Host rejects removal of the root, `files` and `info` directories themselves, including through parent-directory aliases; provider lookup failures reject deletion instead of disabling protection. Unsupported platforms retain ordinary deletion behavior.

Restore is available for direct children of `files` and reads that entry's regular, non-symlink `info/<name>.trashinfo` record. Its single `Path` in `[Trash Info]` must percent-decode to an absolute path outside the trash. Nested entries, absent/malformed records, missing destination parents and occupied destinations fail visibly and retain the entry and record. Restore uses the same configured no-clobber move and shared user-files mutation queue as other manager operations. A successful restore or permanent deletion of a direct child removes its matching record; if cleanup fails, the error states that the file operation completed and identifies the remaining record.

Confirmation addresses the named path, not a retained inode. An external process can replace a path between selection and the trash operation; inspect the operating-system trash when recovering it.

## Build and test

```bash
DSH_USER_FILES=/absolute/user-files-package DSH_SIDEBAR=/absolute/sidebar-package DSH_FILE_DROP=/absolute/file-drop-package pnpm run install:local
DSH_CHECKOUT=/root/deepseek-harness node node_modules/vitest/vitest.mjs run packages/dsh-file-manager/tests
DSH_CHECKOUT=/root/deepseek-harness bash scripts/typecheck.sh
DSH_CHECKOUT=/root/deepseek-harness bash scripts/build.sh
```

Repository-local tools are TypeScript 5.9.3, tsdown 0.22.14 and Vitest 4.1.8, with Vite 7.3.6 for standard decorator transformation. Normal manifests declare compatible dependency ranges. `install:local` accepts explicit package directories or versioned tarballs, including optional `DSH_FILE_DROP` for local development declarations, without recording sibling links in manifests or lockfiles. Build the shared provider and sidebar before manager; development compilation also needs the optional file-drop package declarations. Build/typecheck scripts invoke installed Node tool entrypoints directly, without a package-manager install step. Keep candidate resolver directories independent when reusing installed dependency contents. The selected Harness declarations and Typert generator must already be built with `externalProjectReferences`; `DSH_CHECKOUT` supplies those Host inputs only.

## Setup and removal

All lifecycle commands require explicit targets and inspect by default:

```bash
DSH_CHECKOUT=/root/deepseek-harness DSH_HOME=/tmp/private-dsh-home DSH_PROFILE=web pnpm run setup
DSH_CHECKOUT=/root/deepseek-harness DSH_HOME=/tmp/private-dsh-home DSH_PROFILE=web pnpm run setup --install
DSH_CHECKOUT=/root/deepseek-harness DSH_HOME=/tmp/private-dsh-home DSH_PROFILE=web pnpm run remove
DSH_CHECKOUT=/root/deepseek-harness DSH_HOME=/tmp/private-dsh-home DSH_PROFILE=web pnpm run remove --remove
```

First installation is a high-risk Bundle change. Validate it in a private Home with the intended sibling package set and cold Web boot before targeting a managed profile. Scripts call `dsh plugin` so manifest, lockfile, resolution, and Bundle membership move together; they never apply Harness patches or restart a service.

## Integration requirements

- Sidebar >=0.0.1 provides launcher, tree placement and instance lifecycle APIs.
- Optional file-drop provides DOM-region registration and native-file routing; manager owns the target overlay and intake.
- User-files provides one Host service, one Remote namespace and the common opening policy; its Bundle alone inserts the provider row.
- Harness supplies `openWorkspaceFile`, Session and authenticated Remote APIs.

Setup reuses a shared provider satisfying every installed consumer and the incoming manager's API range, or includes the missing provider in the same `dsh plugin add` transaction. An incompatible provider fails with its consumer/range. Manager removal retains sidebar and user-files. Shared-provider removal checks remaining consumer manifests. The [installation map](.intent/state/STATE.md) owns effective configuration and receipt migration.

Directory changes share the sidebar navigation request with common file-opening handlers. Resolution and listing use its cancellation signal; only a successful commit changes the tree destination and group history. Replay restores the directory, expansion, filter and selection without adding history. A Session retains one tree: external directory requests reuse its actual group, while new trees honor requested placement. Requires sidebar >=0.0.5 <0.1.0 and user-files ^0.1.10; viewer remains optional.
