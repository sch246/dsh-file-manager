---
description: "Authenticated filesystem tree, guarded text source, and Chat file routing for Web profiles that compose the external file workbench."
kind: "package-bundle"
---

# @dsh-external/dsh-file-manager

## Summary

This Bundle adds a Files launcher for browsing the filesystem available to the Web Host account. Users can navigate beyond a Session cwd, manage directory entries, and open regular text files in `@dsh-external/dsh-file-viewer`. Recoverable trash and guarded text saves protect ordinary mutation paths, while the Host service account remains the filesystem authorization owner. The repository [README](../../README.md) owns build and private-Home setup instructions.

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
| `maxReadBytes` | `1048576` | Inclusive complete UTF-8 read and encoded-save byte limit. |
| `pollIntervalMs` | `2000` | Delay after each completed source poll; polls never overlap. |
| `openMode` | `preview-or-system` | Chat file-link behavior: `preview`, `system`, or `preview-or-system`. |

Profile and Home patch layers replace the row's complete `config`. Preserve every field when overriding one.

### What you get

The Files launcher opens one Session-owned tree instance. Its editable address, hidden-entry toggle, lazy directories, refresh, empty file/folder creation, move/rename, and recoverable trash actions use Host process permissions. File rows open the `filesystem` viewer source; viewer location segments route back to the tree through `selectorId: 'file-manager'`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The Bundle keeps filesystem authority and all registrations in one lifecycle so unloading it removes the tree, source, polling, and Chat listener together.

<details>
<summary>Implementation internals — click to expand</summary>

The `fileManager` Typert namespace uses Node filesystem operations rather than agent `ctx.fs`. Session cwd resolves relative requests and the initial location but does not contain absolute navigation. Symlink navigation and reads publish canonical resource identities; move and trash act on the visible link path.

The `filesystem` source canonicalizes line endings for the editor and restores the loaded convention during save. Per-resource plugin writes serialize, stage in the target directory, compare content SHA-256 and stat fields immediately before rename, and then replace atomically. Permission bits are restored, but inode replacement does not promise ownership, access-control entry, extended-attribute, or other filesystem-specific metadata preservation. Source polling starts only for a viewer subscription, schedules after the preceding read completes, and aborts on disposal.

| Source | Responsibility |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Bundle row and configurable deployment values. |
| [`src/filesystem.ts`](src/filesystem.ts) | Node filesystem reads, mutations, revisions, staging, and trash adapter. |
| [`src/remote.ts`](src/remote.ts) | Session-relative resolution and typed Remote failures. |
| [`src/client/`](src/client/) | Tree state/UI, viewer source, polling, sidebar, and Chat registrations. |

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

- Text operations require complete bounded UTF-8 regular files without NUL bytes; binary and streaming editing are unavailable.
- Portable filesystem APIs cannot prevent an external writer from racing between the last revision check and rename, and cannot guarantee a no-replace move against an external destination race. The plugin never intentionally overwrites an observed destination.
- Polling observes a source change only after a configured interval and complete bounded read.
- A composed private-Home browser run owns verification of the sibling Bundle graph and visible workflow.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
