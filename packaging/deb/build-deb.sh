#!/usr/bin/env bash
# Baut das Debian-Paket cloudtak-pzbat12.
#
#   packaging/deb/build-deb.sh <version> <image-tag> [ausgabeordner]
#
# <image-tag> ist der Tag der Container-Images in ghcr.io/laiken96/cloudtak-*
# (in der Pipeline der volle Commit-SHA). Das Paket ist fest an diese Images
# gebunden: Paket-Update = Image-Update.
set -euo pipefail

VERSION="${1:?Version fehlt}"
IMAGE_TAG="${2:?Image-Tag fehlt}"
OUT="${3:-dist}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/packaging/deb"
PKG="$(mktemp -d)"
trap 'rm -rf "$PKG"' EXIT
chmod 0755 "$PKG"

[[ "$VERSION" =~ ^[0-9][A-Za-z0-9.+~-]*$ ]] || { echo "ungültige Version: $VERSION" >&2; exit 1; }
[[ "$IMAGE_TAG" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "ungültiger Image-Tag: $IMAGE_TAG" >&2; exit 1; }

install -d "$PKG/DEBIAN" "$PKG/opt/cloudtak" "$PKG/usr/bin" "$PKG/usr/share/doc/cloudtak-pzbat12"

sed "s/{{VERSION}}/$VERSION/" "$SRC/control" > "$PKG/DEBIAN/control"
for script in postinst prerm postrm; do
    install -m 0755 "$SRC/$script" "$PKG/DEBIAN/$script"
done

install -m 0644 "$ROOT/docker-compose.yml" "$ROOT/garage.toml" "$PKG/opt/cloudtak/"
# Standard-Tag der Images auf diese Paketversion festlegen
sed "s/:-atak-symbole}/:-$IMAGE_TAG}/" "$ROOT/docker-compose.pzbat12.yml" > "$PKG/opt/cloudtak/docker-compose.pzbat12.yml"
grep -q ":-$IMAGE_TAG}" "$PKG/opt/cloudtak/docker-compose.pzbat12.yml" || { echo "Image-Tag nicht eingesetzt" >&2; exit 1; }
chmod 0644 "$PKG/opt/cloudtak/docker-compose.pzbat12.yml"
echo "$VERSION" > "$PKG/opt/cloudtak/VERSION"
echo "$IMAGE_TAG" > "$PKG/opt/cloudtak/IMAGE_TAG"

install -m 0755 "$SRC/cloudtak-pzbat12" "$PKG/usr/bin/cloudtak-pzbat12"
install -m 0644 "$ROOT/SERVER-PZBAT12.md" "$PKG/usr/share/doc/cloudtak-pzbat12/README.md"

mkdir -p "$OUT"
dpkg-deb --root-owner-group --build "$PKG" "$OUT/cloudtak-pzbat12_${VERSION}_all.deb"
