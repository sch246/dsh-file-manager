# Agent entry

This repository is an out-of-tree DeepSeek Harness plugin. Read `.intent/state/STATE.md` before changing lifecycle or filesystem behavior. That local current-state record is not the meta-intent protocol and establishes no accepted realization lock or installation claim.

- Build and install only against explicit `DSH_CHECKOUT`, `DSH_HOME`, and `DSH_PROFILE` values.
- The authenticated Web Host user interface uses Node filesystem APIs with service-process permissions. It never routes user file operations through agent `ctx.fs`, sandbox, or approval policy.
- `FileManagerFilesystem` owns directory mutations and guarded filesystem-source writes. The Client owns tree state, polling lifetime, routing to the viewer, and right-sidebar registrations.
- Setup and uninstall inspect by default. Mutation requires an explicit flag and never restarts a service.
