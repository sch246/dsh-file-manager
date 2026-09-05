# User filesystem manager decision log

Date: 2026-09-05

## Input

The requested product is a browser file manager that can view and edit a filesystem tree. The user clarified that authenticated UI operations are not agent actions: they use service-process filesystem authority, take Session cwd only as an initial location, and may navigate outside it. The file viewer supplies the editor platform but must not retain a second filesystem Host implementation.

## Decisions

- One external Bundle owns the `fileManager` Host namespace, Files launcher, `file-manager-tree` renderer, filesystem viewer source, and Chat file-link listener.
- Node filesystem calls implement user operations directly. No `ctx.fs`, agent sandbox, or approval path is present.
- Symlink navigation and reads follow operating-system semantics and publish canonical resource ids. Mutations retain normalized link paths so moving or trashing a link does not silently target its referent.
- Destructive actions use the maintained `trash` package. The Host independently rejects root and mismatched confirmation; tests replace the trash adapter with fixture-local renames.
- Text revisions combine content SHA-256, stat fields, canonical path, and EOL metadata. Same-resource plugin saves serialize, stage alongside the target, recheck immediately before rename, then atomically replace. External writers remain an optimistic race because portable ordinary filesystem APIs do not expose universal compare-and-swap replacement.
- Browser watches use serialized polling rather than adding a Node watcher transport. Host configuration owns the interval and complete-text byte limit.

## Evidence boundary

Source, focused fixture tests, typechecking, and built artifacts establish repository behavior. This log records no profile installation, running-service activation, browser acceptance, meta-intent protocol adoption, or accepted realization.
