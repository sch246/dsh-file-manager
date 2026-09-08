# Test maintenance scope

The user authorized removal of product-behavior tests while retaining necessary external-contract and mechanical-invariant checks. Confirmed intent belongs in STATE, not a parallel assertion suite. The shared meta-intent Agent entry carries this rule.

Removed 5 complete test files; mixed files retain only the applicable grounded checks. Unused runner entries, UI test dependencies and fixtures were removed where no retained consumer uses them. Runtime source and live profile are unchanged.

Retained evidence resources:

- `packages/dsh-file-manager/tests/transfers.host.spec.ts`: exact binary transfer, auth, overwrite and byte limits; staged-byte cleanup.
- `packages/dsh-file-manager/tests/trash.host.spec.ts`: platform/filesystem safety and fail-closed trash path selection.
- `packages/dsh-file-manager/tests/restore.host.spec.ts`: path safety, record/data atomicity and cancellation/queue invariants.
- `packages/dsh-file-manager/tests/filesystem.host.spec.ts`: filesystem metadata, race safety, trash and deletion invariants.

No tests or builds were run for this cleanup. Syntax, manifest/reference consistency and diff checks are static evidence only.
