#!/bin/sh
# Builds this checkout and installs TuxTavern (the launcher and PMJS) on any Linux; on Alpine,
# tools/apk.sh makes a package instead. Run it again after each git pull:
#   sh tools/install.sh        # into /usr/local, as root through doas or sudo
#   sh tools/install.sh -u     # into ~/.local
# Options after -- go to CMake, e.g. -- -DFETCHCONTENT_SOURCE_DIR_PMJS_EFFEKSEER=DIR (DEVELOPING.md).
set -eu

die() { printf 'install.sh: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

prefix=${PREFIX:-/usr/local}
while [ $# -gt 0 ]; do
	case $1 in
	-u | --user) prefix=$HOME/.local ;;
	--) shift; break ;;
	*) die "usage: $0 [-u | --user] [-- CMAKE_OPTIONS...]" ;;
	esac
	shift
done
src=$(cd "$(dirname "$0")/.." && pwd -P)

# What the build needs, and each package manager's names for it (pkgconfig() and pc: name the
# libraries by their pkg-config module).
modules='sdl2 egl glesv2 libpng libwebp zlib libjpeg freetype2 harfbuzz liblz4 libavformat libavcodec libavutil libswresample libswscale'
packages() {
	case $1 in
	apk) echo "build-base cmake samurai pkgconf git nodejs-dev linux-headers mesa-dev $(for m in $modules; do printf 'pc:%s ' "$m"; done)" ;;
	apt-get) echo 'build-essential cmake ninja-build pkg-config git nodejs libnode-dev libsdl2-dev libegl-dev libgles-dev
  libpng-dev libwebp-dev zlib1g-dev libjpeg-dev libfreetype-dev libharfbuzz-dev liblz4-dev libavformat-dev
  libavcodec-dev libavutil-dev libswresample-dev libswscale-dev' ;;
	dnf) echo "gcc-c++ cmake ninja-build pkgconf git nodejs nodejs-devel $(for m in $modules; do printf "'pkgconfig(%s)' " "$m"; done)" ;;
	zypper) echo "gcc-c++ cmake ninja pkgconf git nodejs-default nodejs-devel-default $(for m in $modules; do printf "'pkgconfig(%s)' " "$m"; done)" ;;
	pacman) echo 'base-devel cmake ninja pkgconf git nodejs sdl2 mesa libpng libwebp zlib libjpeg-turbo freetype2 harfbuzz lz4 ffmpeg' ;;
	esac
}
missing=
for t in c++ cmake pkg-config git node; do have "$t" || missing="$missing $t"; done
have ninja || have samu || have make || missing="$missing ninja"
if have pkg-config; then
	for m in $modules; do pkg-config --exists "$m" || missing="$missing $m"; done
fi
headers=
for d in /usr/include/node /usr/local/include/node /usr/include/nodejs/src "$(dirname "$(command -v node 2>/dev/null || echo /)")/../include/node"; do
	[ -f "$d/node_api.h" ] && headers=1
done
[ -n "$headers" ] || missing="$missing node-headers"
if [ -n "$missing" ]; then
	for manager in apk apt-get dnf zypper pacman; do
		have "$manager" || continue
		case $manager in
		apk) how='apk add' ;; apt-get) how='apt-get install' ;; dnf) how='dnf install' ;;
		zypper) how='zypper install' ;; pacman) how='pacman -S --needed' ;;
		esac
		die "missing:$missing. Install the build packages first, as root:
  $how $(packages "$manager")"
	done
	die "missing:$missing. Install a C++ compiler, CMake, Ninja, pkg-config, git, Node.js with its
headers, and the development files of:$modules"
fi

as_root=
if ! { mkdir -p "$prefix" 2>/dev/null && [ -w "$prefix" ]; }; then
	if have doas; then as_root=doas
	elif have sudo; then as_root=sudo
	else die "cannot write $prefix: run this as root, or use -u for ~/.local"
	fi
fi

cache=${XDG_CACHE_HOME:-$HOME/.cache}
mkdir -p "$cache"
work=$(mktemp -d "$cache/tuxtavern-build.XXXXXX")
trap 'rm -rf "$work"' EXIT
trap 'exit 1' INT TERM
generator=Ninja
have ninja || have samu || generator='Unix Makefiles'
echo "==> building in $work, removed again when this script ends"
cmake -S "$src" -B "$work" -G "$generator" -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=OFF "$@"
cmake --build "$work" --target pmjs_native
dest=$prefix/lib/tuxtavern
$as_root rm -rf "$dest"
$as_root cmake --install "$work" --prefix "$dest"
# bin/tuxtavern and bin/pmjs find their files from their own path, so bin/ gets a wrapper, not a link.
$as_root mkdir -p "$prefix/bin"
printf '#!/bin/sh\nexec "%s/bin/tuxtavern" "$@"\n' "$dest" | $as_root tee "$prefix/bin/tuxtavern" >/dev/null
$as_root chmod 755 "$prefix/bin/tuxtavern"

echo "
Installed to $dest (command: $prefix/bin/tuxtavern). To remove it, delete both."
case :$PATH: in *":$prefix/bin:"*) ;; *) echo "$prefix/bin is not on PATH: add it, or run $prefix/bin/tuxtavern." ;; esac
