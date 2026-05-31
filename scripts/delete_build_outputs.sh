#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$REPO_ROOT/package.json" ]; then
  echo "Error: package.json not found in $REPO_ROOT" >&2
  exit 1
fi
if [ ! -d "$REPO_ROOT/packages" ]; then
  echo "Error: packages/ directory not found in $REPO_ROOT" >&2
  exit 1
fi
if [ ! -d "$REPO_ROOT/auth-server" ]; then
  echo "Error: auth-server/ directory not found in $REPO_ROOT" >&2
  exit 1
fi

dirs=(
  "$REPO_ROOT/auth-server"
  "$REPO_ROOT"/packages/*
  "$REPO_ROOT"/tests/*
)

for dir in "${dirs[@]}"; do
  dist_dir="$dir/dist"
  if [ -d "$dist_dir" ]; then
      echo "Deleting $dist_dir"
      rm -rf "$dist_dir"
  fi
  nextjs_build_dir="$dir/.next"
  if [ -d "$nextjs_build_dir" ]; then
      echo "Deleting $nextjs_build_dir"
      rm -rf "$nextjs_build_dir"
  fi
done

echo "Done."
