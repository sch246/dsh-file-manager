# Directory opens carry source and destination intent

The user asked for one navigation behavior across session links, the path bar, the file manager, Markdown links and group Back/Forward. The manager's share is that a directory destination now reaches the right tree and the right group instead of always opening into the active group.

`FileManagerService.open()` accepts `{ target, preview, sourceInstanceId }`. When the request names this tree as its source, the tree navigates in place and the sidebar group commits that one destination; otherwise the tree opens or activates in the requested group. `openFile()` now sends `replace: 'current'` and `sourceInstanceId: instanceId` on the shared opening entry, so a directory row or a directory link inside the tree moves the tree, while the tree's own file rows still request a preview or permanent tab in the group to the right. `openInstance` receives a commit callback for the already-open case, which keeps the tree's descriptor and history update in one sidebar step.

The directory handler in the plugin entry passes the request's target and source instance through, and imports the shared provider's file-location declarations so the request type carries them. The removed behavior is the unconditional open into the active group.

Verification: `DSH_CHECKOUT=/root/deepseek-harness bash scripts/typecheck.sh` and `bash scripts/build.sh` pass. The manager suite fails the same seven pre-existing tests as its unmodified baseline. No browser automation was run.
