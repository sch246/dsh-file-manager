# Agent entry

This repository is an out-of-tree DeepSeek Harness plugin. Read `.intent/state/STATE.md` before changing lifecycle or filesystem behavior. That local current-state record is not the meta-intent protocol and establishes no accepted realization lock or installation claim.

- Build and install only against explicit `DSH_CHECKOUT`, `DSH_HOME`, and `DSH_PROFILE` values.
- The authenticated Web Host user interface uses Node filesystem APIs with service-process permissions. It never routes user file operations through agent `ctx.fs`, sandbox, or approval policy.
- `FileManagerFilesystem` owns directory mutations plus guarded text and byte writes. The Client owns loaded-tree state, non-overlapping directory and source polling lifetimes, generic resource routing, and right-sidebar registrations.
- Tree restoration checkpoints current navigation and expansion through the sidebar. Only the sidebar's committed `onClosed` notification releases feature state; `onClose` is reserved for veto decisions.
- Recoverable trash is confirmation-free and never falls back to permanent deletion. The explicit permanent action confirms once; Host root checks and link unlinking remain authoritative.
- Setup and uninstall inspect by default. Mutation requires an explicit flag and never restarts a service.
