# Streaming browser file transfers

The user's September 7 request adds Upload beside creation and Download immediately left of Delete when native opening is unavailable, removes the filter's loaded-folder helper, and lets the active manager group receive file drops. This candidate starts from independent-manager `e27ef08` in `/root/dsh-file-transfers/manager`; manager 0.1.1 requires sidebar >=0.0.2 for its instance-scoped drop API. Provider and Viewer remain independent.

## Ownership and behavior

Manager owns a single raw binary HTTP route at `/api/file-manager/transfer`, its browser adapter, and transfer cancellation. The existing Web Host `connection.requestRejection()` protects every method with the same Host/Origin and cookie checks used by Remote operations. Explicit Host peers and injection name `dsh-client-connection` and `dsh-host-webserver`. Shared user-files resolves Session-relative paths and serializes final publication; it gains no manager dependency or duplicate content API.

Upload selection and the sidebar's active-group drop callback share the same cancellable foreground operation and capture the displayed tree root. A private temporary directory on that filesystem holds streamed bytes until EOF; exclusive hard-link publication through the shared queue refuses even a late existing destination. Cleanup removes staging after success, failure or cancellation. Known Content-Length is checked before writing, and a byte-counting transform enforces the configurable 10 GiB default during every stream. Filesystems without hard-link support report failure. Completed files remain when a later batch file fails or the connection disappears after publication.

Download performs an authenticated HEAD preflight and then lets the browser download manager stream GET bytes under the original visible filename. It never builds a whole-file JSON/base64 payload or browser Blob. The open handle is verified as regular; the initial file size bounds the read. External in-place writes can still affect content during transfer. Host disposal unregisters the route, cancels transfers and waits for their cleanup.

Transfer visibility reuses `remote.$host.isLoopback` plus `session.canOpenWorkspacePath()`, as the Host deliverable UI does: both must be true to suppress browser transfers. Sidebar alone owns group targeting and event consumption; manager's mounted panel registers its instance, and its operation lifecycle owns cancellation. The filter helper key and CSS are removed in both locales; loaded-tree filtering is unchanged.

## Candidate evidence

The candidate uses explicit `DSH_CHECKOUT=/root/deepseek-harness`, existing provider artifacts and sidebar `89440f10f26d4a4e3a184658a277aa1b66a8f888` artifacts. Candidate-local dependency links reuse installed package contents; the added Host links target the selected Harness `packages/host/webserver` and `packages/client/connection`. The initial Host-only compile reported missing trash-library links; linking the candidate package dependency directory to the existing manager installation resolved those errors without installing or editing active dependencies.

- `DSH_CHECKOUT=/root/deepseek-harness pnpm exec tsc -p packages/dsh-file-manager/tsconfig.host.json --pretty false --noEmit`: passed after candidate dependency setup.
- `DSH_CHECKOUT=/root/deepseek-harness pnpm exec vitest run packages/dsh-file-manager/tests/transfers.host.spec.ts`: initial 2 tests passed.
- `DSH_CHECKOUT=/root/deepseek-harness pnpm run build`: passed Host compilation/bundle, Typert generation and Client compilation/bundle. Host bundle 32.52 kB; Client bundle 249.06 kB. Existing tsdown external/noExternal deprecation warnings remain.
- `DSH_CHECKOUT=/root/deepseek-harness pnpm exec vitest run packages/dsh-file-manager/tests/transfers.host.spec.ts packages/dsh-file-manager/tests/panel.client.spec.ts`: final 11 tests passed in 2 files. Three focused transfer cases exercise HTTP authentication, exact binary and empty downloads, original Unicode filenames, no-clobber upload, known/unknown-length bounds, invalid names and deterministic pipeline cancellation with staging cleanup; the existing panel cases preserve ordinary action/filter/trash behavior.
- `git diff --check` and `git diff --cached --check`: passed.

No Host/provider/Viewer/sidebar source, live profile, service, receipt or realization lock is changed by this worker. No installation, restart, push, private-Home probe, A/B or browser/GIF run is claimed. The primary agent owns composition and activation. STATE and README provide the executable transfer installation route, including the exact reverse-proxy path and matching upload bound.
