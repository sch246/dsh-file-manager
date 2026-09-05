# File manager current intended state

Status: resource-workbench candidate under `../logs/2026-09-05-resource-workbench-file-manager.md`. The previous source-defined version was locally installed as recorded in [the deployment log](../logs/2026-09-05-live-workbench.md); this candidate is not installed, activated, visually accepted, or represented by an accepted realization lock.

## Intent

Provide an authenticated DeepSeek Harness Web file manager for browsing and editing the service process's user-visible filesystem. The browser UI uses Host process permissions and does not inherit agent filesystem confinement, sandbox approval, or tool policy. A Session cwd selects only the initial location; users may navigate elsewhere.

## Stable behavior

- The `fileManager` Host Remote uses Node filesystem APIs and configurable GNU `mv` for no-clobber moves without copy/delete fallback. It lists directories lazily, follows symbolic links for navigation and resource identity, and retains the user-visible link path for move and deletion actions.
- The Files launcher opens one tree instance per Session in the right-sidebar workbench. Address navigation, manual refresh, hidden entries, create, move/rename, and configured deletion are available from the tree. Non-overlapping automatic polling refreshes only the current and expanded loaded directories, stops on superseding work or disposal, retains reachable expansion and selection, and exposes per-directory failures without discarding the last successful listing.
- The tree filter matches names and relative paths only in the loaded tree. Matching descendants retain their ancestors; clearing the filter does not change expansion or selection, and the UI identifies the loaded-directory scope.
- Creating and moving reject an existing target. Configured trash is recoverable and requires no confirmation; a trash failure never falls back to deletion. Permanent deletion remains an explicit action, requires exactly one ordinary confirmation, rejects filesystem root, and unlinks symbolic links instead of recursively traversing their targets.
- The `filesystem` resource source exposes bounded metadata, bytes, and text without reading content during listing. Text and byte limits are configured separately. Byte reads accept arbitrary bounded regular-file bytes and exact byte saves use the guarded publisher. Text reads reject malformed UTF-8 and NUL bytes, canonicalize CRLF and CR to LF, and retain EOL metadata in the opaque revision. Saves restore the loaded EOL convention, including an exact mixed-EOL pattern for existing lines, and preserve terminal-newline presence represented by editor text.
- Revisions contain exact content SHA-256 and file stat values. Plugin writes to one canonical resource are serialized. Save stages a same-directory file and rechecks the exact loaded revision immediately before atomic rename.
- The ordinary filesystem cannot provide strict compare-and-swap against an uncooperative external writer between the final recheck and rename. `supportsConditionalSave` means guarded optimistic publication within this stated limit, not universal atomic CAS.
- Text and byte source watches poll only while subscribed, wait for each read before scheduling the next, and abort/clear their timer on disposal.
- Regular-file links from the tree and Chat route through the central resource-opening service. A tree single click requests a preview in the group to the right of the tree; a double click requests a permanent tab. Directory links open the tree. Chat preserves the existing waterfall: `preview` handles, `system` delegates, and `preview-or-system` delegates only when browser resource opening fails.

## Acceptance criteria

- `MANAGER-001`: Session cwd opens as the initial canonical directory, while absolute navigation outside it remains available.
- `MANAGER-002`: Tree listing follows usable symlinks, supports hidden entries and lazy expansion, and routes regular files through the central resource opener to a stable group right of the tree; single click previews and double click pins.
- `MANAGER-003`: File and directory creation plus move/rename reject existing targets. Trash removes recoverably without confirmation and never falls back; an explicit permanent deletion uses one confirmation. Both modes reject root, and permanent link deletion cannot traverse the target.
- `MANAGER-004`: Bounded byte loading accepts binary and NUL-bearing regular files. Text loading rejects NUL-bearing, malformed UTF-8, excessive, and non-regular content; EOL and terminal-newline semantics survive an unchanged save.
- `MANAGER-005`: A changed external revision and a second plugin save from the same base fail without clobbering the current file.
- `MANAGER-006`: Text and directory polling never overlap within their lifecycle, stop after disposal, and cannot publish late results. Directory changes refresh the current and expanded loaded tree while retained expansion, selection, filtering, scroll container, and explicit failures remain observable.
- `MANAGER-007`: Build emits Host, Remote, declarations, and browser Client artifacts; setup requires explicit checkout/home/profile and never restarts a service.
- `MANAGER-008`: Loaded-tree filtering matches names and relative paths, retains matching ancestors, performs no recursive filesystem read on input, and clearing it restores the unfiltered loaded tree.
- `MANAGER-009`: Chat preview and tree selection use the central resource-opening service; directory links stay with the tree, and `system` plus `preview-or-system` delegation semantics remain unchanged.

## Non-goals

- Agent tool access, model-visible filesystem context, a bundled binary editor, streaming large files, recursive content search, filesystem ACL management, or a universal cross-process transaction protocol.
- Applying Harness patches, changing sibling plugin source, installing into a live profile, restarting a service, publishing, or claiming user acceptance from repository checks.
