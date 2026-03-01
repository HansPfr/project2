#!/bin/bash
# Development startup script — generates a self-signed certificate if needed,
# then starts the HTTPS server on port 3443.

set -e
cd "$(dirname "$0")"

CERT=ssl/cert.pem
KEY=ssl/key.pem

if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
  echo "Generating self-signed certificate for testing..."
  mkdir -p ssl
  openssl req -x509 -newkey rsa:2048 \
    -keyout "$KEY" -out "$CERT" \
    -days 365 -nodes \
    -subj "/CN=localhost" 2>/dev/null
  echo "Certificate created: $CERT / $KEY"
fi

echo "Starting server..."
node app.js
