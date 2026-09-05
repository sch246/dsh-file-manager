# Delete preference and batch metadata resolution

The requested toolbar has a Move to trash checkbox beside Show hidden files and one Delete action per row. The browser preference applies across manager trees and reloads; Host deleteMode initializes it only when absent. Trash requires no confirmation and never falls back after failure. Unchecked deletion requires one ordinary permanent-deletion confirmation. Tree restoration cannot reset this preference.

The Host also needs resolveMany for an independent resource-links consumer: preserve input order and input paths with individual metadata or error results, cap the batch using validated configuration, and perform no content reads. Existing single-path resolution remains available. This revision retains Chat routing until the independent consumer is integrated.

Implementation and validation are confined to the assigned candidate checkout. No live profile, linked checkout, service, or accepted realization is changed.

## Candidate verification

- `DSH_CHECKOUT=/root/dsh-resource-workbench-candidate/harness pnpm test`: 41 tests passed, including the rendered React checkbox/Delete workflow, permanent-confirmation cancellation, provider failure without fallback, persistence across trees/reload, restore isolation, metadata-only batch success/errors/duplicates/limits, and cancellation before and during resolution. Existing real filesystem root and symlink deletion tests also passed.
- `DSH_CHECKOUT=/root/dsh-resource-workbench-candidate/harness pnpm typecheck`: passed.
- `DSH_CHECKOUT=/root/dsh-resource-workbench-candidate/harness pnpm build`: passed Host compilation, Host bundle, Typert generation, Client compilation, and Client bundle. Generated Remote declarations expose resolveMany.
- `git diff --check`: passed.

The first rendered-panel run exposed the fixture's classic-JSX transform; the Vitest configuration now uses the same automatic JSX transform as the Client compiler. jsdom is a development-only dependency for real React DOM event tests. No full composed-browser run, operating-system trash integration, live installation, or user acceptance is claimed.
