#!/bin/bash
# Usage: /bin/bash ./scripts/prepare-package-tarball.sh <package_path>
# Example: /bin/bash ./scripts/prepare-package-tarball.sh packages/app-definitions

set -e

PACKAGE_PATH="$1"

if [ -z "$PACKAGE_PATH" ]; then
  echo "Error: Package path is required"
  echo "Usage: $0 <package-path>"
  echo "Example Usage: $0 packages/app-definitions"
  exit 1
fi

MONOREPO_ROOT="$(pwd)"
if [ ! -f "$MONOREPO_ROOT/package.json" ]; then
  echo "Error: Expected there to be a package.json file at monorepo root. Run this script from monorepo root."
  exit 1
fi
if [ ! -d "$MONOREPO_ROOT/scripts" ]; then
  echo "Error: Expected there to be a scripts/ directory at monorepo root. Run this script from monorepo root."
  exit 1
fi
if [ ! -d "$MONOREPO_ROOT/$PACKAGE_PATH" ]; then
  echo "Error: Failed to resolve package directory from monorepo root!"
  exit 1
fi
PACKAGE_DOT_JSON_PATH="$MONOREPO_ROOT/$PACKAGE_PATH/package.json"
if [ ! -f "$PACKAGE_DOT_JSON_PATH" ]; then
  echo "Error: Failed to resolve package.json for package to export!"
  exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
  echo "Error: jq is not installed or not found in PATH"
  echo "Please install jq to continue"
  exit 1
fi

PACKAGE_NAME=$(jq -r '.name' "$PACKAGE_DOT_JSON_PATH")
if [ -z $PACKAGE_NAME ]; then
  echo "Error: Failed to extract package name field from package.json!"
  exit 1
fi

PACKAGE_NAME_WITHOUT_SCOPE=$(/bin/bash $MONOREPO_ROOT/scripts/extract-schemavaults-package-name.sh $PACKAGE_NAME)
if [ -z $PACKAGE_NAME_WITHOUT_SCOPE ]; then
  echo "Error: Failed to extract name field from package.json and then remove org scope!"
  exit 1
fi

TARBALL_NAME="$PACKAGE_NAME_WITHOUT_SCOPE.tgz"

# Check if bun is installed
if ! command -v bun &> /dev/null; then
  echo "Error: bun is not installed or not found in PATH"
  echo "Please install bun to continue"
  exit 1
fi

bun run build --filter $PACKAGE_NAME

cd $PACKAGE_PATH

TARBALL_FILEPATH="$MONOREPO_ROOT/$PACKAGE_PATH/$TARBALL_NAME"
if [ -f "$TARBALL_FILEPATH" ]; then
  echo "Warning: Tarball already exists at path $TARBALL_FILEPATH. Deleting..."
  rm -rf $TARBALL_FILEPATH
fi

bun pm pack --filename $TARBALL_FILEPATH --gzip-level 9

echo "Wrote tarball to \"$TARBALL_FILEPATH\""
