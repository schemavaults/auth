#!/bin/bash
# Script to check if a package needs to be published
# Usage: ./check-package-version.sh <package-path>
# Example: ./check-package-version.sh packages/auth-common
#
# Outputs:
#   NEEDS_PUBLISH=true|false
#   LOCAL_VERSION=x.x.x
#   PUBLISHED_VERSION=x.x.x (or "not-published" if not on npm)

set -e

PACKAGE_PATH="$1"

if [ -z "$PACKAGE_PATH" ]; then
  echo "Error: Package path is required"
  echo "Usage: $0 <package-path>"
  exit 1
fi

PACKAGE_JSON="$PACKAGE_PATH/package.json"

if [ ! -f "$PACKAGE_JSON" ]; then
  echo "Error: package.json not found at $PACKAGE_JSON"
  exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
  echo "Error: jq is not installed or not found in PATH"
  echo "Please install jq to continue"
  exit 1
fi

# Extract package name and version from package.json
PACKAGE_NAME=$(jq -r '.name' "$PACKAGE_JSON")
LOCAL_VERSION=$(jq -r '.version' "$PACKAGE_JSON")
IS_PRIVATE=$(jq -r 'if .private == true then "true" else "false" end' "$PACKAGE_JSON")

if [ "$IS_PRIVATE" = "true" ]; then
  echo "Package $PACKAGE_NAME is private, skipping publish check"
  echo "NEEDS_PUBLISH=false"
  echo "LOCAL_VERSION=$LOCAL_VERSION"
  echo "PUBLISHED_VERSION=private"
  exit 0
fi

echo "Checking package: $PACKAGE_NAME"
echo "Local version: $LOCAL_VERSION"

# Get the published version from npm registry
# Use --json to get structured output, suppress errors for unpublished packages
PUBLISHED_VERSION=$(npm view "$PACKAGE_NAME" version 2>/dev/null || echo "not-published")

echo "Published version: $PUBLISHED_VERSION"

# Compare versions
if [ "$PUBLISHED_VERSION" = "not-published" ]; then
  echo "Package has never been published to npm"
  NEEDS_PUBLISH=true
elif [ "$LOCAL_VERSION" = "$PUBLISHED_VERSION" ]; then
  echo "Versions match - no publish needed"
  NEEDS_PUBLISH=false
else
  # Compare semantic versions to determine if local is newer
  # Using sort -V for version comparison
  HIGHER_VERSION=$(echo -e "$LOCAL_VERSION\n$PUBLISHED_VERSION" | sort -V | tail -n1)

  if [ "$HIGHER_VERSION" = "$LOCAL_VERSION" ] && [ "$LOCAL_VERSION" != "$PUBLISHED_VERSION" ]; then
    echo "Local version is newer - publish needed"
    NEEDS_PUBLISH=true
  else
    echo "Published version is same or newer - no publish needed"
    NEEDS_PUBLISH=false
  fi
fi

# Output for GitHub Actions
echo ""
echo "=== Output ==="
echo "NEEDS_PUBLISH=$NEEDS_PUBLISH"
echo "LOCAL_VERSION=$LOCAL_VERSION"
echo "PUBLISHED_VERSION=$PUBLISHED_VERSION"
echo "PACKAGE_NAME=$PACKAGE_NAME"

# If running in GitHub Actions, set outputs
if [ -n "$GITHUB_OUTPUT" ]; then
  echo "needs_publish=$NEEDS_PUBLISH" >> "$GITHUB_OUTPUT"
  echo "local_version=$LOCAL_VERSION" >> "$GITHUB_OUTPUT"
  echo "published_version=$PUBLISHED_VERSION" >> "$GITHUB_OUTPUT"
  echo "package_name=$PACKAGE_NAME" >> "$GITHUB_OUTPUT"
fi
