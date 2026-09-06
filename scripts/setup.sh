#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE='@dsh-external/dsh-file-manager'
PACKAGE_DIR="$ROOT/packages/dsh-file-manager"
CHECKOUT="${DSH_CHECKOUT:?setup: set DSH_CHECKOUT to an explicit Harness checkout}"
PROFILE_HOME="${DSH_HOME:?setup: set DSH_HOME to an explicit Harness home}"
PROFILE="${DSH_PROFILE:?setup: set DSH_PROFILE to an explicit profile name}"
PROFILE_DIR="$PROFILE_HOME/profiles/$PROFILE"
MODE="${1:---check}"

if [ ! -f "$CHECKOUT/package.json" ] || ! git -C "$CHECKOUT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "setup: invalid DSH_CHECKOUT: $CHECKOUT" >&2
  exit 1
fi

run_plugin() {
  DSH_HOME="$PROFILE_HOME" pnpm --dir "$CHECKOUT" dsh plugin --profile "$PROFILE" "$@"
}

verify_install() {
  node "$ROOT/scripts/plan-user-files.mjs" verify "$PROFILE_DIR"
  run_plugin why "$PACKAGE"
  node - "$PROFILE_DIR/package.json" "$PACKAGE" <<'NODE'
const manifest = require(process.argv[2])
const name = process.argv[3]
if (typeof manifest.dependencies?.[name] !== 'string') throw new Error(`profile dependency missing: ${name}`)
const bundles = manifest.dsh?.profile?.bundles ?? []
if (bundles.filter(value => value === name).length !== 1) throw new Error(`profile bundle must contain ${name} exactly once`)
NODE
  grep -Fq "$PACKAGE" "$PROFILE_DIR/pnpm-lock.yaml"
  test "$(realpath "$PROFILE_DIR/node_modules/$PACKAGE")" = "$(realpath "$PACKAGE_DIR")"
  DSH_HOME="$PROFILE_HOME" pnpm --dir "$CHECKOUT" dsh --profile "$PROFILE" --dump-config | grep -Fq "$PACKAGE"
}

case "$MODE" in
  --check)
    if [ -f "$PROFILE_DIR/package.json" ] && run_plugin why "$PACKAGE" >/dev/null 2>&1; then
      verify_install
      echo "setup: $PACKAGE is coherently installed in $PROFILE_HOME profile $PROFILE"
    else
      echo "setup: $PACKAGE is not installed in $PROFILE_HOME profile $PROFILE"
    fi
    echo 'setup: inspection only; no source, profile, artifact, or service was changed'
    ;;
  --install)
    DSH_CHECKOUT="$CHECKOUT" bash "$ROOT/scripts/build.sh"
    PROVIDER_PLAN="$(node "$ROOT/scripts/plan-user-files.mjs" install "$PROFILE_DIR")"
    PROVIDER_ARGS=()
    if [ -n "$PROVIDER_PLAN" ]; then mapfile -t PROVIDER_ARGS <<< "$PROVIDER_PLAN"; fi
    run_plugin add "${PROVIDER_ARGS[@]}" "$PACKAGE_DIR"
    verify_install
    echo "setup: installed $PACKAGE into profile $PROFILE"
    echo 'setup: no service restart was performed; the Bundle activates at the next externally managed start'
    ;;
  *)
    echo 'usage: pnpm run setup [--check|--install]' >&2
    exit 2
    ;;
esac
