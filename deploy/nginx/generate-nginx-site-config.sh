#!/bin/sh
# Generate an nginx site config for @schemavaults/auth-server from
# deploy/nginx/templates/auth-server.conf.template.
#
# Intended for host-level nginx deployments (e.g. /etc/nginx/sites-available/)
# in front of the auth-server `production` Docker image. The containerized
# alternative (the `nginx` target of auth-server/Dockerfile) renders the same
# template itself via the stock nginx image entrypoint.
#
# Only the template's ${SERVER_NAME}, ${AUTH_SERVER_UPSTREAM}, ${STATIC_ROOT},
# and ${CLIENT_MAX_BODY_SIZE} placeholders are substituted (plain sed, no
# envsubst dependency); nginx runtime variables like $host are left alone.
#
# Usage:
#   ./generate-nginx-site-config.sh \
#     --server-name auth.example.com \
#     --upstream 127.0.0.1:3000 \
#     --static-root /var/www/schemavaults-auth \
#     --output /etc/nginx/sites-available/schemavaults-auth.conf
#
# Each option can also be provided as the environment variable named in its
# default below. With no --output, the rendered config is written to stdout.
#
# The static root must contain the _next/static/ build assets and the
# auth-server public/ files. Extract them from a built `nginx` target image:
#   docker create --name auth-static schemavaults/auth-server-nginx:local
#   docker cp auth-static:/usr/share/nginx/html/. /var/www/schemavaults-auth/
#   docker rm auth-static

set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)

TEMPLATE="${TEMPLATE:-${SCRIPT_DIR}/templates/auth-server.conf.template}"
SERVER_NAME="${SERVER_NAME:-_}"
AUTH_SERVER_UPSTREAM="${AUTH_SERVER_UPSTREAM:-127.0.0.1:3000}"
STATIC_ROOT="${STATIC_ROOT:-/var/www/schemavaults-auth}"
CLIENT_MAX_BODY_SIZE="${CLIENT_MAX_BODY_SIZE:-8m}"
OUTPUT=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options (env var fallback in parentheses):
  --server-name <name>            nginx server_name (SERVER_NAME, default: _)
  --upstream <host:port>          auth-server upstream (AUTH_SERVER_UPSTREAM,
                                  default: 127.0.0.1:3000)
  --static-root <dir>             directory with _next/static/ + public/ files
                                  (STATIC_ROOT, default: /var/www/schemavaults-auth)
  --client-max-body-size <size>   request body limit (CLIENT_MAX_BODY_SIZE,
                                  default: 8m)
  --template <file>               template path (TEMPLATE, default:
                                  templates/auth-server.conf.template)
  -o, --output <file>             write config here instead of stdout
  -h, --help                      show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --server-name) SERVER_NAME="$2"; shift 2 ;;
    --upstream) AUTH_SERVER_UPSTREAM="$2"; shift 2 ;;
    --static-root) STATIC_ROOT="$2"; shift 2 ;;
    --client-max-body-size) CLIENT_MAX_BODY_SIZE="$2"; shift 2 ;;
    --template) TEMPLATE="$2"; shift 2 ;;
    -o|--output) OUTPUT="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown argument: %s\n\n' "$1" >&2; usage >&2; exit 1 ;;
  esac
done

if [ ! -f "$TEMPLATE" ]; then
  printf 'Template not found: %s\n' "$TEMPLATE" >&2
  exit 1
fi

# Escape sed replacement metacharacters (backslash, ampersand, and the |
# delimiter used below) in a substitution value.
escape_replacement() {
  printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'
}

render() {
  sed \
    -e "s|\${SERVER_NAME}|$(escape_replacement "$SERVER_NAME")|g" \
    -e "s|\${AUTH_SERVER_UPSTREAM}|$(escape_replacement "$AUTH_SERVER_UPSTREAM")|g" \
    -e "s|\${STATIC_ROOT}|$(escape_replacement "$STATIC_ROOT")|g" \
    -e "s|\${CLIENT_MAX_BODY_SIZE}|$(escape_replacement "$CLIENT_MAX_BODY_SIZE")|g" \
    "$TEMPLATE"
}

if [ -n "$OUTPUT" ]; then
  render > "$OUTPUT"
  printf 'Wrote nginx site config to %s\n' "$OUTPUT" >&2
else
  render
fi
