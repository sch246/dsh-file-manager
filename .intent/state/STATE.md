# File manager current intended state

Status: candidate source revision under [the resource-links cutover log](../logs/2026-09-05-resource-links-cutover.md), with [private browser observations](../logs/2026-09-05-private-repair-acceptance.md). The preceding local installation is recorded in [the deployment log](../logs/2026-09-05-resource-workbench-deployment.md); this candidate is not activated in the managed service, user-visually accepted, or represented by an accepted realization lock.

## Intent

Provide an authenticated DeepSeek Harness Web file manager for browsing and editing the service process's user-visible filesystem. The browser UI uses Host process permissions and does not inherit agent filesystem confinement, sandbox approval, or tool policy. A Session cwd selects only the initial location; users may navigate elsewhere.

## Stable behavior

- The `fileManager` Host Remote uses Node filesystem APIs and configurable GNU `mv` for no-clobber moves without copy/delete fallback. It lists directories lazily, follows symbolic links for navigation and resource identity, and retains the user-visible link path for move and deletion actions.
- The Files launcher opens one tree instance per Session in the right-sidebar workbench. Address navigation, manual refresh, hidden entries, create, move/rename, and configured deletion are available from the tree. Non-overlapping automatic polling refreshes only the current and expanded loaded directories, stops on superseding work or disposal, retains reachable expansion and selection, and exposes per-directory failures without discarding the last successful listing.
- The tree filter matches names and relative paths only in the loaded tree. Matching descendants retain their ancestors; clearing the filter does not change expansion or selection, and the UI identifies the loaded-directory scope.
- The sidebar persists a versioned tree descriptor containing the current root, expanded directories, selection, hidden-entry mode, and filter. Restoration rebuilds those loaded directories. File-manager state is released only by the sidebar's committed close notification, never by close confirmation.
- Creating and moving reject an existing target. Each row has one Delete action. The toolbar's Move to trash checkbox selects recoverable removal without confirmation or permanent removal with exactly one ordinary confirmation. This manager preference persists in browser storage across trees and reloads; Host deleteMode initializes it only when no valid preference exists. Tree restoration cannot replace it. A trash failure never falls back to deletion. Host deletion rejects filesystem root and unlinks symbolic links instead of recursively traversing their targets.
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
- `MANAGER-010`: Browser reload reconstructs the tree's current root, reachable expansion, selection, hidden-entry mode, and filter. A stale, vetoed, or superseded close attempt cannot release feature state, and late directory reads cannot checkpoint after committed removal.
- `MANAGER-011`: resolveMany accepts up to maxResolveBatchSize paths, returns separate ordered successes and failures without content reads, and rejects larger or cancelled requests.

## Non-goals

- Agent tool access, model-visible filesystem context, a bundled binary editor, streaming large files, recursive content search, filesystem ACL management, or a universal cross-process transaction protocol.
- Applying Harness patches, changing sibling plugin source, installing into a live profile, restarting a service, publishing, or claiming user acceptance from repository checks.
