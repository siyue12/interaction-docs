#!/bin/sh
# Launch the pinned TDesign MCP server for this plugin.
#
# The server fetches component docs from tdesign.gtimg.com. Some machines
# (including machines behind a TLS-inspecting proxy) have a system CA that
# Node's bundled CA store does not trust. If the caller did not provide
# NODE_EXTRA_CA_CERTS, point Node at the system bundle when one exists.
set -eu

if [ -z "${NODE_EXTRA_CA_CERTS:-}" ]; then
  for ca in \
    /etc/ssl/cert.pem \
    /etc/ssl/certs/ca-certificates.crt \
    /etc/pki/tls/certs/ca-bundle.crt
  do
    if [ -f "$ca" ]; then
      export NODE_EXTRA_CA_CERTS="$ca"
      break
    fi
  done
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "aiux: npx not found. Install Node.js 18+ (which includes npx) and retry." >&2
  exit 1
fi

exec npx -y tdesign-mcp-server@0.2.4
