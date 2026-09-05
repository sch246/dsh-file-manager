# File manager contribution to the resource workbench

Date: 2026-09-05. Classification: authorized intent revision and realization work. Scope: the out-of-tree `dsh-file-manager` repository only.

## Authority and desired effects

The user authorized the complete resource-workbench plan at `/root/RESOURCE-WORKBENCH-PLAN.md` and assigned this repository the filesystem source, tree interaction, directory-refresh, filtering, deletion, and Chat-routing slice. The assignment explicitly retains Host-process operating-system permissions and excludes agent `ctx.fs`, Harness source, sibling source, live setup, restart, and publication.

The tree remains a workbench view. Selecting a regular file routes a generic resource descriptor through the central resource-opening service: single click requests a preview in the group to the right of the tree and double click requests a permanent tab. Directory selections stay in the tree. Chat preserves the existing `preview`, `system`, and `preview-or-system` policies but uses the same central resource-opening service for regular files.

The filesystem source provides bounded metadata, exact bytes, and canonical LF text as distinct operations. Listing and metadata inspection do not load file content. Byte reads accept arbitrary bounded regular-file bytes; only text reads reject NUL bytes or malformed UTF-8. Text and byte saves share revision comparison and serialized staged publication. Existing EOL restoration remains text-only, and the documented ordinary-filesystem race limit applies to both save forms.

Displayed directory listings refresh automatically without overlapping polling cycles. Polling is limited to the current and expanded loaded directories, is cancelled on superseding work and disposal, preserves reachable expansion, selection, filtering, and the mounted scroll container, and exposes per-directory failures while retaining the last successful listing. Filtering is an in-memory name and relative-path filter over the loaded tree; matching descendants keep their ancestors visible, and the UI states that unloaded directories are outside its scope.

Deletion configuration states whether recoverable trash is available as the default action. Trash performs no confirmation. Permanent deletion remains an explicit action and performs exactly one ordinary confirmation that names the target and irreversibility, without typed-path confirmation. A trash failure never falls back to permanent deletion. Both modes reject filesystem roots; permanent deletion unlinks a symbolic link rather than recursively traversing its target. Existing exclusive creation and GNU no-clobber move behavior remain.

Deployment-varying complete-read sizes, resource-source polling interval, directory polling interval, Chat routing mode, deletion mode, and move executable remain validated configuration fields. Patch layers must supply the complete configuration row.

## Interface coordination

The sibling resource-workbench owner established `ResourceDescriptor`, `ResourceSource`, and `ctx.resourceWorkbench`, with `readText`, `readBytes`, guarded `saveText` and `saveBytes`, text and byte watches, location selector, and external-open capabilities. Its open request accepts a sidebar target and preview intent. The sibling sidebar owner established relative targets by source instance; `{ fromInstanceId: treeInstanceId, direction: 'right' }` centrally resolves or creates the stable adjacent group. These public services, not this file manager, own handler selection, preview replacement, pinning, and layout.

## Candidate evidence

The focused suite passes 33 tests covering filesystem metadata and mutations, trash and permanent deletion, text and byte reads and saves, the Cordis Remote receiver, source polling, loaded-directory polling and filtering, rapid preview supersession, panel confirmation count, and Chat routing. Type checking and the ordered Host, Typert, and Client build pass against `/root/dsh-resource-workbench-candidate/harness`. Generated Host and Client Remote descriptors contain bounded base64 byte-read and byte-save schemas and omit the retired standalone revision method.

## Evidence limits

This record authorizes and describes a tested candidate implementation. It does not claim that a profile is installed, a service is restarted, the composed Web client is exercised, or the user accepts the result.
