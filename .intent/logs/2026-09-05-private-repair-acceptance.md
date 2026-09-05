# Private repair acceptance

Main tested manager `a9eeff8386aaab046e14fa73f9f0af5671110ca5` with the complete isolated Web profile. Each row exposed one Delete button. With Move to trash disabled, cancel showed one confirmation and retained the disposable file; confirm showed one confirmation and removed it. With Move to trash enabled, deletion showed no confirmation and produced a recovery record. The two removed files were newly created test fixtures, not user data.

The recoverable fixture is retained at `/root/.local/share/Trash/files/bac6c97d-5df0-491f-bef5-93ee636a23d9`, with its original path in the matching `.trashinfo` record. The permanent fixture cannot be recovered through the plugin. Product page/console errors were empty. Screenshots are under `/root/dsh-resource-workbench-candidate/repair-controls-wide.png` and `repair-controls.png`.

The resource-links integration verified a single metadata request containing eight message path candidates, directory navigation into this plugin, generic file and image opening, and failure/retry without native fallback. The manager no longer registers a Chat routing listener. Its 39 retained tests, typecheck and build evidence are recorded in the cutover log.

The managed profile, original linked manager checkout and service remain unchanged. These are private-browser observations, not managed activation, user visual acceptance or an accepted realization lock.
