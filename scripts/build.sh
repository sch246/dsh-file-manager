#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE="$ROOT/packages/dsh-file-manager"
CHECKOUT="${DSH_CHECKOUT:?build: set DSH_CHECKOUT to an explicit DeepSeek Harness checkout}"

if [ ! -f "$CHECKOUT/package.json" ]; then
  echo "build: invalid DSH_CHECKOUT: $CHECKOUT" >&2
  exit 1
fi
if [ -e "$ROOT/harness" ] && [ ! -L "$ROOT/harness" ]; then
  echo "build: refusing to replace non-symlink $ROOT/harness" >&2
  exit 1
fi
rm -f "$ROOT/harness"
ln -s "$CHECKOUT" "$ROOT/harness"

rm -rf "$PACKAGE/lib"
node "$ROOT/node_modules/typescript/bin/tsc" -p "$PACKAGE/tsconfig.host.json" --pretty false
(cd "$PACKAGE" && node "$ROOT/node_modules/tsdown/dist/run.mjs" --config tsdown.host.config.ts)
node "$ROOT/scripts/generate-typert-host.mjs"
node "$ROOT/node_modules/typescript/bin/tsc" -p "$PACKAGE/tsconfig.client.json" --pretty false
(cd "$PACKAGE" && node "$ROOT/node_modules/tsdown/dist/run.mjs" --config tsdown.client.config.ts)

for artifact in index.js typert.host.js typert.host.d.ts typert.remote-client.js typert.remote-client.d.ts client.js; do
  test -f "$PACKAGE/lib/$artifact" || { echo "build: missing lib/$artifact" >&2; exit 1; }
done
