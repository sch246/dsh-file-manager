# File manager current intended state

Recorded deployment: compact source installed and activated under [the deployment log](../logs/2026-09-06-compact-ui-activation.md). This local STATE is an installation and behavior map, not the meta-intent protocol. The historical deployment establishes neither acceptance nor compatibility of a new target Host. [The compact manager log](../logs/2026-09-06-compact-manager.md) records implementation evidence.

## Intent

Provide an authenticated DeepSeek Harness Web file manager for browsing and editing the service process's user-visible filesystem. The browser UI uses Host process permissions and does not inherit agent filesystem confinement, sandbox approval, or tool policy. A Session cwd selects only the initial location; users may navigate elsewhere.

## User intent and provenance

Source: Codex task **评估网页文件查看编辑能力 (2)**, conversation `01a07134-78e5-7503-83c1-059bc388eecf`, actual user messages. Times use **Asia/Shanghai (UTC+08:00)**, converted from message UTC timestamps. The September 5 18:54 message includes pasted user/GPT dialogue; GPT proposals inside it are not independent user requirements.

- September 5 18:54, pasted user requests: “目录应该保持自动刷新”, “需要一个过滤框输入内容就过滤目录显示”, and “彻底删除只需要确认一次也不需要输入路径”. Recoverable trash should avoid confirmation. The user wants continuous browsing: the tree remains visible while selected files open to its right. Common grouping, preview tabs and dragging belong to the sidebar; the manager supplies selection and opening requests.
- September 5 20:50 asks for existing paths to be clickable and for directories/files to open manager/editor respectively. September 5 20:55: “存在的路径都能点击这个功能是很独立的”. That recognition becomes the separate resource-links consumer, rather than another manager Chat listener.
- September 5 20:52: “删除移动到回收站应该是文件管理器的一个选项，和显示隐藏文件夹是一个类型，删除一个按钮就够了”. One Delete follows a remembered preference instead of separate delete/trash buttons.
- September 5 23:04: “它唯一需要常驻的只有路径” and “新建文件，新建文件夹，刷新，更多 这四个按钮”. The icons float horizontally over the first list row, usually `..`, and appear on hover; narrow panes move actions into More. More contains Show hidden files, Move to trash when deleting, Filter and Open trash. Switches remember their state, show a check when enabled, and Filter alone controls whether its input is visible. Open trash is requested because the user does not know where the provider stores it; the implemented Linux home-directory scope below is narrower than a full recovery interface.

## Installation map

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

## Stable behavior

- The `fileManager` Host Remote uses Node filesystem APIs and configurable GNU `mv` for no-clobber moves without copy/delete fallback. It lists directories lazily, follows symbolic links for navigation and resource identity, and retains the user-visible link path for move and deletion actions.
- The Files launcher opens one tree instance per Session in the right-sidebar workbench. Address navigation, manual refresh, hidden entries, create, move/rename, and configured deletion are available from the tree. Non-overlapping automatic polling refreshes only the current and expanded loaded directories, stops on superseding work or disposal, retains reachable expansion and selection, and exposes per-directory failures without discarding the last successful listing.
- The path input stays visible and navigates on Enter. New file, New folder, Refresh, and More float over the first list row (`..` outside filesystem root) and appear on hover or keyboard focus. Touch devices keep More visible as the expansion target and place the other actions inside it. Narrow panes progressively move Refresh, New folder, and New file into More, without a separate persistent toolbar.
- More holds browser-persisted Show hidden files, Move to trash when deleting, and Filter switches plus Open trash. The filter input appears only while enabled and retains its query while disabled; disabling it stops filtering. Queries match names and relative paths only in the loaded tree. Matching descendants retain their ancestors, and changing filter visibility does not change expansion, selection, or the scroll container.
- The sidebar persists a v2 tree descriptor containing the current root, expanded directories, selection, and filter query. Restoration accepts v1 navigation without letting its hidden-entry value replace browser preferences, and rebuilds those loaded directories. File-manager state is released only by the sidebar's committed close notification, never by close confirmation.
- Creating and moving reject an existing target. Each row has one Delete action. The menu's Move to trash when deleting switch selects recoverable removal without confirmation or permanent removal with exactly one ordinary confirmation. This manager preference persists in browser storage across trees and reloads; Host deleteMode initializes it only when no valid preference exists. Tree restoration cannot replace it. Trash receives literal paths without glob expansion and never falls back to deletion. Host deletion rejects filesystem root and unlinks symbolic links instead of recursively traversing their targets.
- Open trash uses the installed Linux provider's `xdg-trashdir` resolver to navigate to its home `files` directory. It creates nothing, excludes other-volume trash, and offers neither original-name reconstruction nor restoration. The tree identifies this scope and possible generated filenames. Missing or inaccessible directories and unsupported platforms, including WSL, show explicit errors while retaining the current tree.
- The read-only resolveMany Remote preserves each input path and its order, including duplicates, with individual metadata or error results. maxResolveBatchSize limits each request before path resolution; cancellation rejects the request. Batch resolution shares single-path metadata resolution and reads no file content.
- The `filesystem` resource source exposes bounded metadata, bytes, and text without reading content during listing. Text and byte limits are configured separately. Byte reads accept arbitrary bounded regular-file bytes and exact byte saves use the guarded publisher. Text reads reject malformed UTF-8 and NUL bytes, canonicalize CRLF and CR to LF, and retain EOL metadata in the opaque revision. Saves restore the loaded EOL convention, including an exact mixed-EOL pattern for existing lines, and preserve terminal-newline presence represented by editor text.
- Revisions contain exact content SHA-256 and file stat values. Plugin writes to one canonical resource are serialized. Save stages a same-directory file and rechecks the exact loaded revision immediately before atomic rename.
- The ordinary filesystem cannot provide strict compare-and-swap against an uncooperative external writer between the final recheck and rename. `supportsConditionalSave` means guarded optimistic publication within this stated limit, not universal atomic CAS.
- Text and byte source watches poll only while subscribed, wait for each read before scheduling the next, and abort/clear their timer on disposal.
- Regular-file links from the tree route through the central resource-opening service. A tree click selects and persists the visible row path while opening the canonical resource; single click requests a preview in the group to the right of the tree, and double click requests a permanent tab. A new attempt clears the preceding open error, and superseded preview failures stay hidden. Directory selections open the tree. The independent resource-links plugin owns Chat path presentation and preview/system routing; the manager supplies metadata and the Files selector without a Chat listener or routing policy.

## Acceptance criteria

- `MANAGER-001`: Session cwd opens as the initial canonical directory, while absolute navigation outside it remains available.
- `MANAGER-002`: Tree listing follows usable symlinks, supports hidden entries and lazy expansion, and routes regular files through the central resource opener to a stable group right of the tree; single click previews and double click pins.
- `MANAGER-003`: File and directory creation plus move/rename reject existing targets. One Delete button follows the browser-persisted Move to trash preference: trash has no confirmation or fallback, and permanent deletion uses one confirmation. Restoring a tree cannot reset the preference. Both modes reject root, and permanent link deletion cannot traverse the target.
- `MANAGER-004`: Bounded byte loading accepts binary and NUL-bearing regular files. Text loading rejects NUL-bearing, malformed UTF-8, excessive, and non-regular content; EOL and terminal-newline semantics survive an unchanged save.
- `MANAGER-005`: A changed external revision and a second plugin save from the same base fail without clobbering the current file.
- `MANAGER-006`: Text and directory polling never overlap within their lifecycle, stop after disposal, and cannot publish late results. Directory changes refresh the current and expanded loaded tree while retained expansion, selection, filtering, scroll container, and explicit failures remain observable.
- `MANAGER-007`: Build emits Host, Remote, declarations, and browser Client artifacts; setup requires explicit checkout/home/profile and never restarts a service.
- `MANAGER-008`: Loaded-tree filtering matches names and relative paths, retains matching ancestors, performs no recursive filesystem read on input, and clearing it restores the unfiltered loaded tree.
- `MANAGER-009`: Tree selection uses the central resource-opening service; external directory selections use the Files launcher. Chat routing belongs solely to the independent resource-links consumer.
- `MANAGER-010`: Browser reload reconstructs the tree's current root, reachable expansion, selection, and filter query while the menu preferences remain browser-owned. Legacy v1 trees remain restorable without overriding saved preferences. A stale, vetoed, or superseded close attempt cannot release feature state, and late directory reads cannot checkpoint after committed removal.
- `MANAGER-011`: resolveMany accepts up to maxResolveBatchSize paths, returns separate ordered successes and failures without content reads, and rejects larger or cancelled requests.
- `MANAGER-012`: The path input stays visible without a label or Go button; four ordered first-row icons remain available through hover, keyboard, touch, and progressive narrow-pane overflow. More remembers three checked preferences. Disabling Filter removes its input and stops filtering while preserving the query.
- `MANAGER-013`: Open trash browses the provider-selected Linux home files directory and describes its limits. Unsupported platforms, absent directories, provider failures, and superseded lookups cannot navigate to an invented path or create a directory.

## Non-goals

- Agent tool access, model-visible filesystem context, a bundled binary editor, streaming large files, recursive content search, filesystem ACL management, or a universal cross-process transaction protocol.
- Applying Harness patches, changing sibling plugin source, implicitly targeting a live profile, restarting a service, publishing, or claiming user acceptance from repository checks.

## Evidence limits

The compact implementation and activation logs linked above retain their actual commands and observations. They do not prove every platform, touch layout, extreme pane width or user mutation flow; home-trash browsing excludes other volumes and restoration. This documentation update changes no runtime, profile or service and does not repeat historical browser or filesystem checks.
