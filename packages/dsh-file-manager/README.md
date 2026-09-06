# @dsh-external/dsh-file-manager

This Bundle provides an authenticated Web Files tree using service-process filesystem permissions. It requires sidebar and the shared user-files provider, independently of Viewer and Links. The repository [README](../../README.md) owns build, installation and platform limits; [STATE](../../.intent/state/STATE.md) owns the complete product and maintenance map.

| Config | Bundle value | Meaning |
| --- | --- | --- |
| `directoryPollIntervalMs` | `2000` | Delay after each completed loaded-directory refresh. |
| `deleteMode` | `trash` | Initial preference when browser storage has none. |
| `moveCommand` | `mv` | GNU executable supporting no-clobber/no-copy moves. |

Profile/Home overrides replace the complete config row. Content limits belong to user-files; `resourcePollIntervalMs` belongs to Viewer. Preserve effective values when migrating existing complete rows.

One Session tree retains its address, loaded expansion, visible selection and filter through refresh and sidebar restoration. The v2 descriptor excludes browser preferences; v1 restoration cannot replace current preferences. The path input stays visible; compact row actions and More retain keyboard/touch access. Polling reads only the current and expanded loaded directories, keeps failed listings with their errors, and stops on disposal. Filtering searches loaded names and paths only; disabling it retains its query.

File clicks persist the visible row path and call `openWorkspaceFile` with its canonical path, preview/pin intent and placement to the right of the tree. Manager's waterfall listener resolves shared metadata, handles directories, and calls `next()` for files. Metadata and accepted-handler errors propagate. Without a viewing handler, Host native opening remains available and reports its original failure. Manager imports no Viewer code, descriptors or source IDs.

The `fileManager` Remote exposes metadata, initialLocation, trashLocation, list, create, move and deleteEntry. Shared `ctx.userFiles` owns Session-relative path resolution and canonical metadata; no content reader or save queue exists in manager. Listing follows usable symbolic links while retaining visible paths for moving and deletion. Create is exclusive. Move refuses replacement and cross-filesystem copying. Trash receives literal paths and never falls back to permanent deletion. Root is protected; permanent deletion requires one confirmation and unlinks links without traversing targets.

Open trash browses the provider's Linux home files directory without creating it. WSL, unsupported platforms and missing/inaccessible locations fail visibly. It does not aggregate volumes, reconstruct original names or restore entries. Browser deletion, hidden-file and filter visibility preferences remain separate from tree restoration. Only committed sidebar close releases feature state.

| Source | Responsibility |
| --- | --- |
| `src/filesystem.ts` | Directory listing and mutations through shared canonical metadata. |
| `src/remote.ts` | Directory Remote and typed management failures. |
| `src/client/service.ts` | Tree state, directory polling, restoration and common opening requests. |
| `src/client/index.ts` | Directory listener, Files launcher and tree view registration. |

The Bundle registers no model-facing tool, prompt section or Session event. A private-Home composition and browser run remain separate from source and artifact tests.
