#!/bin/bash
# copy-codegen-templates.sh

set -e

if ! command -v jq &> /dev/null
then
    echo "Error: jq is not installed" >&2
    exit 1
fi

if [ ! -f package.json ]; then
    echo "Error: No package.json file found. Are you in the auth-server-sdk directory?" >&2
    exit 1
fi

PACKAGE_NAME=$(jq -r '.name' "./package.json")

if [ "$PACKAGE_NAME" != "@schemavaults/auth-server-sdk" ]; then
    echo "Error: This script is only for @schemavaults/auth-server-sdk" >&2
    exit 1
fi

if [ ! -d dist ]; then
    echo "Error: No dist directory found. The build should run successfully before copying templates in." >&2
    exit 1
fi

CODEGEN_TEMPLATES_SOURCE_DIR="../auth-resource-server-codegen-templates/src"

if [ ! -d "$CODEGEN_TEMPLATES_SOURCE_DIR" ]; then
    echo "Error: No auth-resource-server-codegen-templates package directory found." >&2
    exit 1
fi

if [ -d dist/codegen-templates ]; then
    echo "[copy-codegen-templates.sh] Removing existing codegen-templates directory in auth-server-sdk/dist..."
    rm -rf dist/codegen-templates
fi

mkdir -p dist/codegen-templates
mkdir -p dist/codegen-templates/auth

cp -r "$CODEGEN_TEMPLATES_SOURCE_DIR"/auth/* dist/codegen-templates/auth
