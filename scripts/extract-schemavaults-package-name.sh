#!/bin/bash
# Extracts the package name from a @schemavaults scoped package
# Usage: ./extract-schemavaults-package-name.sh <package-name>
# Example: ./extract-schemavaults-package-name.sh @schemavaults/auth-common
# Output: auth-common

set -e

FULL_NAME="$1"

if [ -z "$FULL_NAME" ]; then
  echo "Error: Package name is required"
  echo "Usage: $0 <package-name>"
  exit 1
fi

# Remove the @schemavaults/ prefix
echo "${FULL_NAME#@schemavaults/}"
