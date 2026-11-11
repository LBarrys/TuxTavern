#!/bin/sh
# Builds this checkout into a signed .apk and installs it as tuxtavern@busylinux, from the
# local repository BusyLinux's update.sh uses (set up here on plain Alpine). As root:
#   git pull && doas sh tools/apk.sh       # -m: with mkxp-z, for XP/VX/VX Ace (-M: its own libraries)
#                                          # -r: -m, with Alpine's Ruby instead of mkxp-z's own 3.1
set -eu

die() { printf 'apk.sh: %s\n' "$*" >&2; exit 1; }
mkxpz='' ruby=''
for arg; do
	case $arg in
	-m | --mkxp-z) mkxpz=system ;;
	-M | --mkxp-z-bundled) mkxpz=bundled ;;
	-r | --system-ruby) ruby=1 ;;
	*) die "usage: $0 [-m | --mkxp-z | -M | --mkxp-z-bundled] [-r | --system-ruby]" ;;
	esac
done
if [ -n "$ruby" ]; then
	[ "$mkxpz" != bundled ] || die "-r builds mkxp-z with Alpine's libraries, so not with -M"
	mkxpz=system
fi
[ "$(id -u)" = 0 ] || die "run this as root"
src=$(cd "$(dirname "$0")/.." && pwd -P)
arch=$(apk --print-arch)
REPO=/var/lib/busylinux/repo/$arch KEY=/root/keys/local.rsa WORK=/var/tmp/tuxtavern-apk

# FFmpeg by package name: its sonames change with each major version.
depends="nodejs so:libSDL2-2.0.so.0 so:libEGL.so.1 so:libGLESv2.so.2 so:libpng16.so.16"
depends="$depends so:libwebp.so.7 so:libjpeg.so.8 so:libfreetype.so.6 so:libharfbuzz.so.0 so:liblz4.so.1"
depends="$depends ffmpeg-libavformat ffmpeg-libavcodec ffmpeg-libavutil ffmpeg-libswresample ffmpeg-libswscale"
# SDL2 by what it provides: newer Alpine replaces sdl2 with sdl2-compat, and sdl2-dev would conflict with it.
makedepends="build-base cmake samurai pkgconf git nodejs-dev linux-headers pc:sdl2 mesa-dev
  libpng-dev libwebp-dev zlib-dev libjpeg-turbo-dev freetype-dev harfbuzz-dev lz4-dev ffmpeg-dev openssl"
# mkxp-z: Meson and what its own Ruby 3.1 builds with, and the libraries it uses from Alpine (or,
# with -M, the Wayland files its own SDL needs). Keep in step with install.sh's mkxpz lists.
case $mkxpz in
system) makedepends="$makedepends meson python3 bison ruby perl bash sdl2_image-dev sdl2_ttf-dev openal-soft-dev
  physfs-dev libogg-dev libvorbis-dev libtheora-dev fluidsynth-dev pixman-dev openssl-dev yaml-dev libffi-dev uchardet-dev" ;;
bundled) makedepends="$makedepends meson python3 bison ruby perl bash wayland-dev wayland-protocols libxkbcommon-dev" ;;
esac
[ -z "$ruby" ] || makedepends="$makedepends ruby-dev"

# The checkout belongs to a user; without this git refuses it, and build-info.json
# would not record the commit.
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0="$src"
version=0.1.0_git$(git -C "$src" log -1 --format=%cd --date=format:%Y%m%d)
installed=$(apk list --installed tuxtavern 2>/dev/null | sed -n 's/^tuxtavern-\([0-9][^ ]*\) .*/\1/p')
release=0
case $installed in "$version"-r*) release=$((${installed##*-r} + 1)) ;; esac

trap 'apk del -q .tuxtavern-build 2>/dev/null || :; rm -rf "$WORK"' EXIT
# shellcheck disable=SC2086
apk add -q --virtual .tuxtavern-build $makedepends || die "could not install $makedepends"
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
cmake --install "$WORK/build" --prefix "$WORK/pkg/usr/lib/tuxtavern"
if [ -n "$mkxpz" ]; then
	if [ "$mkxpz" = bundled ]; then sh "$src/tools/install.sh" --mkxp-z-stage "$WORK/mkxp-z" --bundled
	else sh "$src/tools/install.sh" --mkxp-z-stage "$WORK/mkxp-z" ${ruby:+--system-ruby}; fi
	cp -R "$WORK/mkxp-z" "$WORK/pkg/usr/lib/tuxtavern/lib/mkxp-z"
	# What mkxp-z links to from Alpine becomes part of the package's dependencies.
	for exe in "$WORK/mkxp-z"/mkxp-z.*; do :; done
	depends="$depends $(ldd "$exe" | awk '$1 ~ /^lib/ && $3 ~ /^\/(usr\/)?lib\// { print "so:" $1 }' | sort -u | tr '\n' ' ')"
fi
# bin/tt and bin/pmjs find their files from their own path, so /usr/bin gets a wrapper, not a link.
printf '#!/bin/sh\nexec /usr/lib/tuxtavern/bin/tt "$@"\n' >"$WORK/pkg/usr/bin/tt"
chmod 755 "$WORK/pkg/usr/bin/tt"

# Not stripped: PMJS checks its installed files against build-info.json.
rm -f "$REPO"/tuxtavern-[0-9]*.apk
apk mkpkg --files "$WORK/pkg" --info name:tuxtavern --info "version:$version-r$release" \
	--info "arch:$arch" --info license:MIT --info url:https://github.com/LBarrys/TuxTavern \
	--info "description:Runs RPG Maker XP/VX/VX Ace/MV/MZ games natively, without Wine or a browser" \
	--info origin:tuxtavern --info "depends:$depends" \
	--sign-key "$KEY" --output "$REPO/tuxtavern-$version-r$release.apk"
apk mkndx --output "$REPO/Packages.adb" --sign-key "$KEY" "$REPO"/*.apk >/dev/null
apk add -u tuxtavern@busylinux
