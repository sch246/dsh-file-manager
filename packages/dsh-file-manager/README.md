---
description: "Authenticated filesystem tree, guarded resource source, and Chat file routing for Web profiles that compose the external file workbench."
kind: "package-bundle"
---

# @dsh-external/dsh-file-manager

## Summary

This Bundle adds a Files launcher for browsing the filesystem available to the Web Host account. Users can navigate beyond a Session cwd, manage directory entries, and open regular resources through `@dsh-external/dsh-file-viewer`. Recoverable trash plus guarded text and byte saves protect ordinary mutation paths, while the Host service account remains the filesystem authorization owner. The repository [README](../../README.md) owns build and private-Home setup instructions.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

The Bundle requires the external right-sidebar and file-viewer Client packages in the same Web profile. Its patch inserts the Host and Client row with the deployment's complete configuration.

### Configuration

| Field | Bundle value | Meaning |
|---|---:|---|
| `maxTextReadBytes` | `1048576` | Inclusive complete UTF-8 read and encoded text-save limit. |
| `maxByteReadBytes` | `16777216` | Inclusive complete binary read and byte-save limit. |
| `resourcePollIntervalMs` | `2000` | Delay after each completed subscribed resource poll. |
| `directoryPollIntervalMs` | `2000` | Delay after each completed loaded-directory refresh cycle. |
| `openMode` | `preview-or-system` | Chat file-link behavior: `preview`, `system`, or `preview-or-system`. |
| `deleteMode` | `trash` | Whether recoverable trash is available as the default action. |

Profile and Home patch layers replace the row's complete `config`. Preserve every field when overriding one.

### What you get

The Files launcher opens one Session-owned tree instance. Its editable address, hidden-entry toggle, lazy directories, automatic and manual refresh, loaded-tree filter, empty file/folder creation, move/rename, trash, and permanent-delete actions use Host process permissions. File rows send `filesystem` descriptors to the central resource opener; single click previews in a stable group right of the tree and double click requests a permanent tab. Resource location segments route back to the tree through `selectorId: 'file-manager'`.

Automatic refresh polls only the current and expanded loaded directories, schedules after the prior cycle, and retains the mounted tree, reachable expansion, selection, and filter. A failed directory keeps its last successful listing and displays the failure. Filtering matches loaded names and relative paths in memory, retains ancestors, and never recursively reads unloaded directories.

The sidebar persists the current root, expanded paths, selection, hidden-entry mode, and filter in a versioned descriptor. Its restorer rebuilds the loaded tree before the view becomes ready. Close confirmation performs no cleanup; the committed close notification cancels pending reads and releases tree state.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The Bundle keeps filesystem authority and all registrations in one lifecycle so unloading it removes the tree, source, polling, and Chat listener together.

<details>
<summary>Implementation internals — click to expand</summary>

The `fileManager` Typert namespace uses Node filesystem operations rather than agent `ctx.fs`. Session cwd resolves relative requests and the initial location but does not contain absolute navigation. Symlink navigation and reads publish canonical resource identities; move and deletion act on the visible link path. The public deletion RPC is `deleteEntry`; `remove` remains reserved for the Cordis Service lifecycle.

The `filesystem` source exposes metadata, exact bytes, and canonical LF text independently. Only text rejects NUL bytes or malformed UTF-8 and restores the loaded line-ending convention during save. Per-resource text and byte writes share one serialized staged publisher, compare content SHA-256 and stat fields immediately before rename, and then replace atomically. Permission bits are restored, but inode replacement does not promise ownership, access-control entry, extended-attribute, or other filesystem-specific metadata preservation. Source polling starts only for a resource subscription, schedules after the preceding read completes, and aborts on disposal.

Trash requires no confirmation and never falls back to permanent deletion. The permanent row action asks once without typed-path confirmation. Host checks reject filesystem root, and permanent deletion unlinks a symbolic link instead of traversing its target.

| Source | Responsibility |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Bundle row and configurable deployment values. |
| [`src/filesystem.ts`](src/filesystem.ts) | Node metadata, text and byte reads, mutations, revisions, shared staging, and deletion. |
| [`src/remote.ts`](src/remote.ts) | Session-relative resolution and typed Remote failures. |
| [`src/client/`](src/client/) | Tree state/UI, resource source, polling, sidebar, and Chat registrations. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- The repository [README](../../README.md) explains setup, removal safety, save guarantees, and verification commands.
- The [Agent Note](../../docs/agent-notes/implemented/architecture/2026-09-05-user-filesystem-manager.md) records why browser filesystem authority, polling, recoverable trash, and optimistic conditional writes were selected.

-----

<a id="model-experience"></a>
## Model Experience

This Bundle registers no model-facing tool, prompt section, or Session event. It changes authenticated human Web actions only.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- Text operations require complete bounded UTF-8 regular files without NUL bytes. Byte handlers receive complete bounded content; streaming remains unavailable.
- Portable filesystem APIs cannot prevent an external writer from racing between the last revision check and rename, and cannot guarantee a no-replace move against an external destination race. The plugin never intentionally overwrites an observed destination.
- Polling observes a source or directory change only after a configured interval and complete bounded read or listing.
- A composed private-Home browser run owns verification of the sibling Bundle graph and visible workflow.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
