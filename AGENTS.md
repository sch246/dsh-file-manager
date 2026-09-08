<!-- meta-intent:entry:start -->
## Intent-package entry

Maintain an executable installation and maintenance map as user understanding, upstream software and environments change. The first map can be incomplete; use user feedback and checked reality to improve it, rather than making accumulated implementation debt the permanent design.

- Start with [this package's STATE](.intent/state/STATE.md) and the user's request. STATE tells an unfamiliar Agent which effects to provide, why they matter, where to find resources, and how to install, adapt, verify and remove them under applicable conditions. Keep every supported capability reachable from that map.
- Before writing, distinguish the information's role. STATE owns intended effects and reusable operational guidance. LOG owns selected actual decisions, observations and their reasons; historical implementation gaps, debt inventories and task progress belong there or in a disposable work record. Keep conditions and adaptation steps needed to act in STATE, without turning it into a status table. LOCK retains an exact purpose-bound realization, not permanent requirements. Do not turn this distinction into a mandatory document transaction for each repair.
- Inspect the target and recover relevant existing decisions before inferring new requirements. Code, tests and past installations are evidence about implementations; they do not decide user intent. Optional cooperation does not establish a required dependency. Change STATE when feedback clarifies an effect or experience improves the executable route, not merely because current code differs.
- Maintain confirmed intent in STATE, not a parallel product-behavior test suite. Do not routinely add tests to obtain confidence in an inferred interpretation. Retain useful externally grounded contract and mechanical-invariant checks; remove superseded UI/behavior expectations and unused test scaffolding within the authorized scope. A test is evidence, not a veto over clarified intent, and retained tests need not run for unrelated changes.
- Act within the user's existing authority. Read selected sources when why, scope or attribution matters; do not replay every LOG. Choose checks that resolve a real uncertainty at reasonable cost, and distinguish observed results from unperformed checks.
- This entry routes attention; it does not replace STATE or the selected protocol. Follow the package's state record for protocol/binding changes. See [meta-intent's map](../meta-intent/state/STATE.md) when maintaining this guidance or when the roles themselves are unclear.
<!-- meta-intent:entry:end -->

# Agent entry

This repository is an out-of-tree DeepSeek Harness plugin. Read the [installation and adaptation map](.intent/state/STATE.md) before installation, adaptation or filesystem/lifecycle changes. Use it to select capabilities and preserve product behavior in the actual Host environment; refine it from user feedback and observed behavior. Record implementation constraints and execution evidence in local logs.

- Build and install only against explicit `DSH_CHECKOUT`, `DSH_HOME`, and `DSH_PROFILE` values.
- The authenticated Web Host user interface uses Node filesystem APIs with service-process permissions. It never routes user file operations through agent `ctx.fs`, sandbox, or approval policy.
- Tree restoration checkpoints current navigation and expansion through the sidebar. Only the sidebar's committed `onClosed` notification releases feature state; `onClose` is reserved for veto decisions.
- Outside home trash, one row Delete action follows the browser-persisted Move to trash preference. Inside home trash it requires confirmed permanent deletion; trash root/files/info are protected. Recoverable trash is confirmation-free and never falls back; permanent deletion confirms once. Host root checks and link unlinking remain authoritative.
- Setup and uninstall inspect by default. Mutation requires an explicit flag and never restarts a service.
