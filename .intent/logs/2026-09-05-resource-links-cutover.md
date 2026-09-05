# Resource-links ownership cutover

The integrating agent reports that the independent resource-links plugin passes its real Cordis wiring and 17 behavior tests and authorizes direct candidate cutover. The manager retires its Chat file-open listener, exported listener factory, Chat dependency, and openMode configuration. The independent `@dsh-external/dsh-resource-links` plugin owns Chat path presentation and preview/system routing. The manager retains its read-only metadata Remote, filesystem source, Files launcher, tree selection, and deletion preference.

The assigned candidate is used by a private Web probe, so rebuilding may refresh that probe's Client. This operation does not change the live linked checkout, profile, or managed service. The manager adds no dependency on the resource-links consumer.

## Candidate verification

- `DSH_CHECKOUT=/root/dsh-resource-workbench-candidate/harness pnpm test`: 39 tests passed. The two retired Chat-policy tests and their unused generated-Remote fixture are removed; deletion preference, React actions, bounded batch resolution, tree lifecycle, source operations, root protection, and symlink deletion checks remain passing.
- `DSH_CHECKOUT=/root/dsh-resource-workbench-candidate/harness pnpm typecheck`: passed.
- `DSH_CHECKOUT=/root/dsh-resource-workbench-candidate/harness pnpm build`: passed Host compilation, Host bundle, Typert generation, Client compilation, and Client bundle.
- Source and rebuilt artifact scans contain no createFileManagerChatListener, chat/open-workspace-file, preview-or-system, or openMode. Generated Remote declarations retain resolveMany and deleteEntry.
- `git diff --check`: passed.

The independent plugin's wiring evidence belongs to its owner; this manager revision does not claim a composed-browser or live-service acceptance run.
