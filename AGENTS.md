# Agent entry

This repository is an out-of-tree DeepSeek Harness plugin. Read the [installation and adaptation map](.intent/state/STATE.md) before installation, adaptation or filesystem/lifecycle changes. Use it to select capabilities and preserve product behavior in the actual Host environment; refine it from user feedback and observed behavior. Record implementation constraints and execution evidence in local logs.

- Build and install only against explicit `DSH_CHECKOUT`, `DSH_HOME`, and `DSH_PROFILE` values.
- The authenticated Web Host user interface uses Node filesystem APIs with service-process permissions. It never routes user file operations through agent `ctx.fs`, sandbox, or approval policy.
- Tree restoration checkpoints current navigation and expansion through the sidebar. Only the sidebar's committed `onClosed` notification releases feature state; `onClose` is reserved for veto decisions.
- One row Delete action follows the browser-persisted Move to trash preference. Recoverable trash is confirmation-free and never falls back; permanent deletion confirms once. Host root checks and link unlinking remain authoritative.
- Setup and uninstall inspect by default. Mutation requires an explicit flag and never restarts a service.
