#!/bin/sh
set -e

# public/build is volume-mounted (shared with the nginx container) so it survives
# container recreation independent of this image, but that means it starts EMPTY
# on a fresh volume and STALE after a rebuild (old volume, new image). Always
# resync from the path baked into this image before anything else starts, so
# nginx never serves assets whose hashes do not match this build.
mkdir -p /var/www/html/public/build
cp -rf /opt/public-build-src/. /var/www/html/public/build/

exec "$@"
