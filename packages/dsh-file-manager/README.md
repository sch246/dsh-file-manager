# @dsh-external/dsh-file-manager

This Bundle provides an authenticated Web Files tree using service-process filesystem permissions. It requires sidebar and the shared user-files provider, independently of Viewer and Links. The repository [README](../../README.md) owns build, installation and platform limits; [STATE](../../.intent/state/STATE.md) owns the complete product and maintenance map.

| Config | Bundle value | Meaning |
| --- | --- | --- |
| `directoryPollIntervalMs` | `2000` | Delay after each completed loaded-directory refresh. |
| `deleteMode` | `trash` | Initial preference when browser storage has none. |
| `maxUploadBytes` | `10737418240` | Inclusive streaming upload limit per file. |
| `moveCommand` | `mv` | GNU executable supporting no-clobber/no-copy moves. |

Profile/Home overrides replace the complete config row. Viewer read/save content limits belong to user-files; `resourcePollIntervalMs` belongs to Viewer. Preserve effective values when migrating existing complete rows.

Each mounted tree contributes directory destinations to its sidebar group’s history. Sidebar >=0.0.4 owns the single stack, mouse side buttons, Alt+Left/Right and stable replay focus. Manager restores destinations and records only successful directory changes. See the repository [behavior reference](../../README.md#behavior) for history and restoration semantics.

One Session tree retains its address, loaded expansion, visible selection and filter through refresh and sidebar restoration. The v2 descriptor excludes browser preferences; v1 restoration cannot replace current preferences. The path input stays visible; directory actions float outside the scroll container at its top and retain keyboard/touch access through More. Polling reads only the current and expanded loaded directories, keeps failed listings with their errors, and stops on disposal. Filtering searches loaded names and paths only; disabling it retains its query.

File clicks persist the visible row path and call `openWorkspaceFile` with its canonical path, preview/pin intent and placement to the right of the tree. Manager's waterfall listener resolves shared metadata, handles directories, and calls `next()` for files. Metadata and accepted-handler errors propagate. Without a viewing handler, Host native opening remains available and reports its original failure. Manager imports no Viewer code, descriptors or source IDs.

The `fileManager` Remote exposes metadata, initialLocation, trashLocation, list, create, move, restore and deleteEntry. Shared `ctx.userFiles` owns Session-relative path resolution and canonical metadata; viewer content reads and its save queue remain provider-owned; manager owns the authenticated streaming upload/download route. Listing follows usable symbolic links while retaining visible paths for moving and deletion. Create is exclusive. Move refuses replacement and cross-filesystem copying. Trash receives literal paths and never falls back to permanent deletion. Root is protected; permanent deletion requires one confirmation and unlinks links without traversing targets.

Open trash browses the provider's Linux home files directory without creating it. WSL, unsupported platforms and missing/inaccessible locations fail visibly. It does not aggregate volumes or reconstruct display names. Delete anywhere under the trash root requires explicit permanent confirmation; root/files/info themselves are protected. Restore applies only to direct files children with a valid absolute original path in their own regular `.trashinfo` record; occupied destinations preserve both the item and its record. Successful restoration and permanent deletion of a direct child clean its record; cleanup errors identify the already-completed file operation. Shared user-files serializes these mutations with saves. Provider lookup failures reject deletion; unsupported platforms retain ordinary deletion behavior. Browser deletion, hidden-file and filter visibility preferences remain separate from tree restoration. Only committed sidebar close releases feature state.

| Source | Responsibility |
| --- | --- |
| `src/filesystem.ts` | Directory listing and mutations through shared canonical metadata. |
| `src/transfers.ts` | Cookie-authenticated raw streaming, exclusive upload publication and transfer cleanup. |
| `src/remote.ts` | Directory Remote and typed management failures. |
| `src/client/service.ts` | Tree state, directory polling, restoration and common opening requests. |
| `src/client/FileManagerDropOverlay.tsx` | Optional region lifecycle, readiness feedback and manager-owned upload illustration. |
| `src/client/index.ts` | Directory listener, Files launcher and tree view registration. |

When native workspace opening is unavailable for this connection, Upload and regular-file Download appear; with optional `@dsh-external/dsh-file-drop` ^0.1.0, drops on the visible manager panel upload into the displayed root. Manager owns the blurred overlay, SVG illustration, destination copy and readiness check. Missing or removed file-drop leaves button transfers and browsing available; sidebar has no file-intake responsibility. The repository [transfer reference](../../README.md#browser-transfers) owns visibility, cancellation, publication, HTTP and reverse-proxy requirements.

The Bundle registers no model-facing tool, prompt section or Session event. A private-Home composition and browser run remain separate from source and artifact tests.
