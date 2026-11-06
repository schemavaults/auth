#!/usr/bin/env bash
# Packs @schemavaults/sandbox-management-sdk from a local checkout into vendor/,
# the way npm would serve it, until the SDK is published. See vendor/README.md.
#
# Usage: scripts/vendor-sandbox-management-sdk.sh [path to the SDK checkout]
#        (default: ../sandbox-management-sdk next to this repository)
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
sdk_dir="$(cd "${1:-$repo_root/../sandbox-management-sdk}" && pwd)"
vendor_dir="$repo_root/vendor"

if [ "$(jq -r .name "$sdk_dir/package.json")" != "@schemavaults/sandbox-management-sdk" ]; then
  echo "error: $sdk_dir is not a checkout of @schemavaults/sandbox-management-sdk" >&2
  exit 1
fi

(
  cd "$sdk_dir"
  bun install --frozen-lockfile
  bun run build
  rm -f "$vendor_dir"/schemavaults-sandbox-management-sdk-*.tgz
  bun pm pack --destination "$vendor_dir"
)

echo "Packed from $(git -C "$sdk_dir" rev-parse --short HEAD) ($(git -C "$sdk_dir" rev-parse --abbrev-ref HEAD))."
echo "Update the commit and sha1 in vendor/README.md, then run 'bun install' to refresh bun.lock."
