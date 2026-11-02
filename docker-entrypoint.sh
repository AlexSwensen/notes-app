#!/bin/sh
set -e

# Started as root (e.g. Unraid): make /data writable for PUID:PGID, then drop privileges.
if [ "$(id -u)" = "0" ]; then
  PUID="${PUID:-1000}"
  PGID="${PGID:-1000}"
  if [ "$(stat -c %u:%g /data)" != "$PUID:$PGID" ]; then
    chown -R "$PUID:$PGID" /data
  fi
  exec su-exec "$PUID:$PGID" "$@"
fi

exec "$@"
