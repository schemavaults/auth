#!/bin/bash
# Usage: /bin/bash ./scripts/prepare-all-package-tarballs.sh

set -e

MONOREPO_ROOT="$(pwd)"
if [ ! -f "$MONOREPO_ROOT/package.json" ]; then
  echo "Error: Expected there to be a package.json file at monorepo root. Run this script from monorepo root."
  exit 1
fi
if [ ! -d "$MONOREPO_ROOT/scripts" ]; then
  echo "Error: Expected there to be a scripts/ directory at monorepo root. Run this script from monorepo root."
  exit 1
fi
if [ ! -d "$MONOREPO_ROOT/packages" ]; then
  echo "Error: Expected there to be a packages/ directory at monorepo root. Run this script from monorepo root."
  exit 1
fi

for package_dir in "$MONOREPO_ROOT/packages"/*; do
  if [ -d "$package_dir" ]; then
    relative_path="${package_dir#$MONOREPO_ROOT/}"
    /bin/bash ./scripts/prepare-package-tarball.sh "$relative_path"
  fi
done
