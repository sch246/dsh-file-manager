# Compact file-manager candidate evidence

The assigned implementation checkout is `/root/dsh-resource-workbench-candidate/dsh-file-manager`, branch `codex/resource-workbench`, based on `d829053`. All commands select `/root/dsh-resource-workbench-candidate/harness` explicitly; its inspected revision is `0a53fb55be`. No profile, service, sibling source, original plugin checkout, or realization lock is changed. The candidate's [STATE](../state/STATE.md) owns current intended behavior.

## Provider evidence and design

The installed `trash@10.1.1` Linux implementation calls `xdg-trashdir()` for the home device and stores files below the returned directory's `files` child; files use generated UUID names. Other devices may use separate directories. Its platform dispatcher detects WSL with `wsl-utils` and selects a different provider. This candidate directly declares these existing dependencies and uses their real resolver and WSL detection. Browsing is limited to the Linux home files directory and does not create a missing directory or claim recovery or multi-volume coverage.

The same inspection found `trash` defaults to glob expansion. The Host now supplies `glob: false` so a single selected filename containing metacharacters cannot expand the operation's targets. The mounted-Host regression observes the literal provider arguments and preserves a neighbouring matching filename.

The persistent toolbar and unconditional filter input are removed. Directory actions share the list's first row and scroll with it; container queries progressively move actions into More. Touch retains More as the expansion target. The preference store owns all three switches; each tree retains its own query and navigation. Version 1 descriptors are decoded into version 2 navigation without restoring their stale hidden-entry preference.

## Verification

- `DSH_CHECKOUT=/root/dsh-resource-workbench-candidate/harness pnpm install --offline --ignore-scripts` updated the candidate lockfile using cached packages. It reported existing Harness development peer warnings.
- `DSH_CHECKOUT=/root/dsh-resource-workbench-candidate/harness pnpm install --offline --frozen-lockfile --ignore-scripts` passed with the lockfile up to date.
- `DSH_CHECKOUT=/root/dsh-resource-workbench-candidate/harness pnpm test` passed 46 tests across six files. The added checks cover menu persistence, inactive-filter query retention, creation and refresh in rendered React, keyboard menu handling, scroll-container retention, legacy restoration, delayed trash lookup, preference changes during another tree's pending navigation, provider lookup errors, absent trash without directory creation, and literal trash arguments. Existing root, link, confirmation, polling, and guarded-write regressions remain included.
- `DSH_CHECKOUT=/root/dsh-resource-workbench-candidate/harness pnpm typecheck` passed after adding the new trash module to the explicit Host program. The first attempt correctly rejected its missing project inclusion.
- `DSH_CHECKOUT=/root/dsh-resource-workbench-candidate/harness pnpm build` passed Host compilation/bundling, Typert projection, and Client compilation/bundling. The emitted Remote declarations expose `fileManager.trashLocation`.
- A read-only Node invocation of the built `homeTrashDirectory()` and `stat()` returned `/root/.local/share/Trash/files` with `existing-directory`; no file was created, removed, or restored by that probe.
- `git diff --check` passed.

The parent agent owns private-Home composed-browser verification, including visual width and touch behavior. React/jsdom does not validate CSS layout or native pointer geometry. This slice does not claim a live installation, service activation, user acceptance, or a complete operating-system trash recovery workflow.
