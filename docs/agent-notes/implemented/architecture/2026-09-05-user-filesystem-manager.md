# Agent Note: Authenticated user filesystem manager

Status: implemented

## Problem

The Web user needs to browse and edit the filesystem visible to the Host service process. Agent filesystem policy cannot own this access because a Session workspace is only a convenient starting location for the user interface, not its authorization limit.

The resource workbench needs one filesystem source with metadata, independent text and byte operations, guarded saving, and external-change observation. Directory operations, filesystem authority, and Chat routing need one owner so multiple plugins do not register competing filesystem sources or file-open listeners.

## Decision

The file-manager Bundle owns the `fileManager` Typert namespace, right-sidebar Files launcher and tree view, `filesystem` resource source, polling lifetimes, and Chat file-link routing. Its Host Remote uses Node filesystem APIs with service-process permissions and treats a Session cwd only as the first browser location. Regular files enter the central resource-opening service, which owns handler and workbench placement decisions; the tree persists the visible selected row and requests preview or permanent opening of its canonical resource beside its own instance.

Metadata uses stat information and filename MIME lookup without reading content. Byte reads accept arbitrary bounded regular-file content and cross the JSON Remote as canonical base64. Text reads alone apply UTF-8, NUL, and EOL rules. Text and byte saves serialize plugin writes per canonical path, stage bytes in the target directory, compare content SHA-256 and stat fields to the loaded opaque revision immediately before rename, and atomically replace the file. These checks detect external changes up to that last comparison. Portable filesystem operations cannot prevent an uncooperative external process from writing between the comparison and rename, so the source promises optimistic conditional writes rather than universal atomic compare-and-swap.

Recoverable removal sends a file, link, or directory to operating-system trash without confirmation and never falls back when trash fails. Each row exposes one Delete action governed by the toolbar's Move to trash preference; unchecked means permanent removal with one ordinary confirmation. Browser storage owns this manager-wide preference because restoring an individual Session tree must not reset the user's current deletion choice. Host deleteMode initializes absent preferences. The Host rejects filesystem root and unlinks a symbolic link rather than recursively traversing its target.

Metadata consumers use bounded resolveMany requests with one ordered result per input path. Sharing the single-path resolver keeps Session-relative resolution, symlink identities, and metadata failures consistent. Individual failures remain results so one inaccessible path cannot suppress usable links, while cancellation and configured batch limits apply to the complete request. Metadata resolution never reads file content.

Directory polling schedules a new cycle only after the preceding cycle and reads only the current and expanded loaded directories. A superseding operation or disposal aborts the polling lifetime. Successful results update existing tree state in place; failed directories retain their last listing and expose the failure. The filter traverses only these loaded snapshots in memory and retains ancestors of matching names or relative paths.

The sidebar persists a versioned tree descriptor with the current root, expanded paths, selection, hidden-entry mode, and filter. Its restorer reconstructs this state before marking the instance ready. Close confirmation makes no feature mutation; only the authoritative close notification releases tree state and cancels reads. The deletion Remote uses `deleteEntry` because Cordis Service owns the lifecycle method named `remove`.

## Alternatives considered

**Use `ctx.fs` and Session workspace containment.** This would apply agent sandbox and approval policy to an authenticated user action and prevent the required navigation beyond Session cwd.

**Keep the filesystem Remote and source in the editor package.** This would give a source-neutral editor filesystem authority and split tree operations from their owning source and routing lifecycle.

**Use Node file watchers.** A new watcher transport would add Host resource lifetime and cross-platform event semantics. Serialized Client polling reuses bounded Remote reads and directory listings, exists only while a resource or tree subscribes, and exposes separate intervals as Host configuration.

**Fall back from failed trash to permanent deletion.** This would turn an unavailable recovery facility into silent data loss. Permanent deletion therefore remains a separate confirmed request.

**Claim strict cross-process compare-and-swap.** Portable ordinary filesystem APIs do not supply a no-race conditional rename against arbitrary writers. The narrower promise states the actual last-check timing and preserves automatic saving without presenting it as a universal transaction.

## Consequences

The Web Host account defines the user's filesystem reach, so deployment permissions become a product security decision. Symbolic-link navigation and reads follow operating-system semantics and use canonical resource identities; move and trash retain the visible link path so those operations act on the link itself.

Polling performs bounded complete reads, hashes, and loaded-directory listings, so separate text, byte, resource-poll, and directory-poll settings control its resource cost. The implementation gains deterministic teardown and avoids watcher transport state, but it observes changes only after a poll completes. Loaded-tree filtering cannot find content under a directory that has not been expanded.

Repository tests exercise fixture-local real filesystem operations and replace trash with fixture-local renames. A composed private-Home browser run remains necessary to verify the sibling Bundle graph and visible workflow.
