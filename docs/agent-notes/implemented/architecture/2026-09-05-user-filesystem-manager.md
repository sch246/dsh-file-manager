# Agent Note: Authenticated user filesystem manager

Status: implemented

## Problem

The Web user needs to browse and edit the filesystem visible to the Host service process. Agent filesystem policy cannot own this access because a Session workspace is only a convenient starting location for the user interface, not its authorization limit.

The text editor needs one filesystem source with guarded saving and external-change observation. Directory operations, filesystem authority, and Chat routing need one owner so multiple plugins do not register competing filesystem sources or file-open listeners.

## Decision

The file-manager Bundle owns the `fileManager` Typert namespace, right-sidebar Files launcher and tree view, `filesystem` file-viewer source, polling lifetime, and Chat file-link routing. Its Host Remote uses Node filesystem APIs with service-process permissions and treats a Session cwd only as the first browser location.

Conditional saves serialize plugin writes per canonical path, stage bytes in the target directory, compare content SHA-256 and stat fields to the loaded opaque revision immediately before rename, and atomically replace the file. These checks detect external changes up to that last comparison. Portable filesystem operations cannot prevent an uncooperative external process from writing between the comparison and rename, so the source promises optimistic conditional writes rather than universal atomic compare-and-swap.

Removal sends a file, link, or directory to recoverable operating-system trash after the Host checks an exact normalized-path confirmation and rejects filesystem root. The package performs no recursive permanent removal.

## Alternatives considered

**Use `ctx.fs` and Session workspace containment.** This would apply agent sandbox and approval policy to an authenticated user action and prevent the required navigation beyond Session cwd.

**Keep the filesystem Remote and source in the editor package.** This would give a source-neutral editor filesystem authority and split tree operations from their owning source and routing lifecycle.

**Use Node file watchers.** A new watcher transport would add Host resource lifetime and cross-platform event semantics. Serialized Client polling reuses bounded Remote reads, exists only while a viewer subscribes, and exposes its interval as Host configuration.

**Permanently remove directory trees.** Recursive deletion can follow platform-specific link-shaped paths and cannot be recovered. Operating-system trash supports files and complete directory trees without a recursive deletion path in this package.

**Claim strict cross-process compare-and-swap.** Portable ordinary filesystem APIs do not supply a no-race conditional rename against arbitrary writers. The narrower promise states the actual last-check timing and preserves automatic saving without presenting it as a universal transaction.

## Consequences

The Web Host account defines the user's filesystem reach, so deployment permissions become a product security decision. Symbolic-link navigation and reads follow operating-system semantics and use canonical resource identities; move and trash retain the visible link path so those operations act on the link itself.

Polling performs bounded complete reads and hashes, so `maxReadBytes` and `pollIntervalMs` control its resource cost. The implementation gains deterministic teardown and avoids watcher transport state, but it observes changes only after a poll completes.

Repository tests exercise fixture-local real filesystem operations and replace trash with fixture-local renames. A composed private-Home browser run remains necessary to verify the sibling Bundle graph and visible workflow.
