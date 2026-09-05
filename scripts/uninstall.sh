#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE='@dsh-external/dsh-file-manager'
CHECKOUT="${DSH_CHECKOUT:?uninstall: set DSH_CHECKOUT to an explicit Harness checkout}"
PROFILE_HOME="${DSH_HOME:?uninstall: set DSH_HOME to an explicit Harness home}"
PROFILE="${DSH_PROFILE:?uninstall: set DSH_PROFILE to an explicit profile name}"
MODE="${1:---check}"

run_plugin() {
  DSH_HOME="$PROFILE_HOME" pnpm --dir "$CHECKOUT" dsh plugin --profile "$PROFILE" "$@"
}

case "$MODE" in
  --check)
    run_plugin why "$PACKAGE"
    echo 'uninstall: inspection only; no profile, artifact, source, or service was changed'
    ;;
  --remove)
    run_plugin remove "$PACKAGE"
    if run_plugin why "$PACKAGE" >/dev/null 2>&1; then
      echo "uninstall: $PACKAGE remains resolved after removal" >&2
      exit 1
    fi
    echo "uninstall: removed $PACKAGE from profile $PROFILE"
    echo 'uninstall: no service restart was performed'
    ;;
  *)
    echo 'usage: pnpm run uninstall [--check|--remove]' >&2
    exit 2
    ;;
esac
