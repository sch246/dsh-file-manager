# Tree navigation history

Each manager record owns directory history and its committed cursor. The shared navigation operation commits both only after canonical resolution and directory listing succeed, guarded by the current operation identity. History traversal carries its destination index through hidden-file visibility reloads; failed and superseded reads cannot commit it. A failed navigation restores the address to the retained listing before polling resumes, so later refreshes use the displayed directory.

The panel handles mouse buttons 3/4 on its own DOM region and cancels their down, up and auxiliary-click defaults; only the down event starts navigation. Alt+Left/Right bubbles through that same panel, excluding editable targets, extra modifiers and repeat navigation. Clicking blank tree content focuses the panel for subsequent keyboard navigation. The service imports no browser history, viewer or file-drop owner, and the persisted tree descriptor contains no history.

The focused history tests exercise failed listings and resolutions, branching, per-tree isolation, restoration, superseded reads, visibility reloads, event cancellation and input exclusion. DOM event checks establish handler behavior; physical side-button behavior across browsers remains an activation check.
