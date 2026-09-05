# File manager current intended state

Status: source-defined implementation under `../logs/2026-09-05-user-filesystem-manager.md`, locally installed as recorded in [the deployment log](../logs/2026-09-05-live-workbench.md). No accepted realization lock or user visual acceptance is claimed.

## Intent

Provide an authenticated DeepSeek Harness Web file manager for browsing and editing the service process's user-visible filesystem. The browser UI uses Host process permissions and does not inherit agent filesystem confinement, sandbox approval, or tool policy. A Session cwd selects only the initial location; users may navigate elsewhere.

## Stable behavior

- The `fileManager` Host Remote uses Node filesystem APIs and configurable GNU `mv` for no-clobber moves without copy/delete fallback. It lists directories lazily, follows symbolic links for navigation and text-resource identity, and retains the user-visible link path for move and trash actions.
- The Files launcher opens one tree instance per Session in the right-sidebar workbench. Address navigation, refresh, hidden entries, create, move/rename, and recoverable trash are available from the tree.
- Creating and moving reject an existing target. Trash rejects filesystem root and requires the exact normalized path as confirmation. Production deletion uses the operating system's recoverable trash mechanism; the plugin performs no recursive permanent deletion.
- The `filesystem` viewer source accepts regular bounded UTF-8 files without NUL bytes. Loads canonicalize CRLF and CR to LF and retain EOL metadata in the opaque revision. Saves restore the loaded EOL convention, including an exact mixed-EOL pattern for existing lines, and preserve terminal-newline presence represented by editor text.
- Revisions contain exact content SHA-256 and file stat values. Plugin writes to one canonical resource are serialized. Save stages a same-directory file and rechecks the exact loaded revision immediately before atomic rename.
- The ordinary filesystem cannot provide strict compare-and-swap against an uncooperative external writer between the final recheck and rename. `supportsConditionalSave` means guarded optimistic publication within this stated limit, not universal atomic CAS.
- Source watches poll only while subscribed, wait for each read before scheduling the next, and abort/clear their timer on disposal.
- Chat file links preserve the existing waterfall: `preview` handles, `system` delegates, and `preview-or-system` delegates only when filesystem preview fails.

## Acceptance criteria

- `MANAGER-001`: Session cwd opens as the initial canonical directory, while absolute navigation outside it remains available.
- `MANAGER-002`: Tree listing follows usable symlinks, supports hidden filtering and lazy expansion, and routes regular files to the `filesystem` viewer source.
- `MANAGER-003`: File and directory creation plus move/rename reject existing targets; file, empty-directory, and non-empty-directory removal require exact confirmation and use recoverable trash.
- `MANAGER-004`: Text loading rejects excessive, NUL-bearing, malformed UTF-8, and non-regular content; EOL and terminal-newline semantics survive an unchanged save.
- `MANAGER-005`: A changed external revision and a second plugin save from the same base fail without clobbering the current file.
- `MANAGER-006`: Polling never overlaps, stops after source disposal, and emits changed snapshots or invalidation.
- `MANAGER-007`: Build emits Host, Remote, declarations, and browser Client artifacts; setup requires explicit checkout/home/profile and never restarts a service.

## Non-goals

- Agent tool access, model-visible filesystem context, binary editing, streaming large files, filesystem ACL management, or a universal cross-process transaction protocol.
- Applying Harness patches, changing sibling plugin source, installing into a live profile, restarting a service, publishing, or claiming user acceptance from repository checks.
