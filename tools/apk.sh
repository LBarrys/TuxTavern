#!/bin/sh
# Builds this checkout into a signed .apk and installs it as pmjs@busylinux, from the
# local repository BusyLinux's update.sh uses (set up here on plain Alpine). As root:
#   git pull && doas sh tools/apk.sh
set -eu

die() { printf 'apk.sh: %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "run this as root"
src=$(cd "$(dirname "$0")/.." && pwd -P)
arch=$(apk --print-arch)
REPO=/var/lib/busylinux/repo/$arch KEY=/root/keys/local.rsa WORK=/var/tmp/pmjs-apk

# FFmpeg by package name: its sonames change with each major version.
depends="nodejs so:libSDL2-2.0.so.0 so:libEGL.so.1 so:libGLESv2.so.2 so:libpng16.so.16"
depends="$depends so:libwebp.so.7 so:libjpeg.so.8 so:libfreetype.so.6 so:libharfbuzz.so.0"
depends="$depends ffmpeg-libavformat ffmpeg-libavcodec ffmpeg-libavutil ffmpeg-libswresample ffmpeg-libswscale"
makedepends="build-base cmake samurai pkgconf git nodejs-dev linux-headers sdl2-dev mesa-dev
  libpng-dev libwebp-dev zlib-dev libjpeg-turbo-dev freetype-dev harfbuzz-dev ffmpeg-dev openssl"

# The checkout belongs to a user; without this git refuses it, and build-info.json
# would not record the commit.
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0="$src"
version=0.1.0_git$(git -C "$src" log -1 --format=%cd --date=format:%Y%m%d)
installed=$(apk list --installed pmjs 2>/dev/null | sed -n 's/^pmjs-\([0-9][^ ]*\) .*/\1/p')
release=0
case $installed in "$version"-r*) release=$((${installed##*-r} + 1)) ;; esac

trap 'apk del -q .pmjs-build 2>/dev/null || :; rm -rf "$WORK"' EXIT
# shellcheck disable=SC2086
apk add -q --virtual .pmjs-build $makedepends || die "could not install $makedepends"
if [ ! -f "$KEY" ]; then
	mkdir -p "${KEY%/*}"
	openssl genrsa -out "$KEY" 4096 2>/dev/null
	chmod 600 "$KEY"
	openssl rsa -in "$KEY" -pubout -out "/etc/apk/keys/${KEY##*/}.pub" 2>/dev/null
fi
grep -q " ${REPO%/*}\$" /etc/apk/repositories || echo "v3 @busylinux ${REPO%/*}" >>/etc/apk/repositories

rm -rf "$WORK"
mkdir -p "$WORK/pkg/usr/bin" "$REPO"
cmake -S "$src" -B "$WORK/build" -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=OFF
cmake --build "$WORK/build" --target pmjs_native
cmake --install "$WORK/build" --prefix "$WORK/pkg/usr/lib/pmjs"
# bin/pmjs finds its files from its own path, so /usr/bin gets a wrapper, not a link.
printf '#!/bin/sh\nexec /usr/lib/pmjs/bin/pmjs "$@"\n' >"$WORK/pkg/usr/bin/pmjs"
chmod 755 "$WORK/pkg/usr/bin/pmjs"

# Not stripped: PMJS checks its installed files against build-info.json.
rm -f "$REPO"/pmjs-[0-9]*.apk
apk mkpkg --files "$WORK/pkg" --info name:pmjs --info "version:$version-r$release" \
	--info "arch:$arch" --info license:MIT --info url:https://github.com/LBarrys/pmjs-rpgm \
	--info "description:Native runtime for RPG Maker MV/MZ games, without a browser (rpgm's fork of PMJS)" \
	--info origin:pmjs --info "depends:$depends" \
	--sign-key "$KEY" --output "$REPO/pmjs-$version-r$release.apk"
apk mkndx --output "$REPO/Packages.adb" --sign-key "$KEY" "$REPO"/*.apk >/dev/null
apk add -u pmjs@busylinux
