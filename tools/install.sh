#!/bin/sh
# Builds this checkout and installs TuxTavern (the launcher and PMJS, for MV/MZ) on any Linux; on
# Alpine, tools/apk.sh makes a package instead. Run it again after each git pull:
#   sh tools/install.sh        # into /usr/local, as root through doas or sudo
#   sh tools/install.sh -u     # into ~/.local
#   sh tools/install.sh -m     # with mkxp-z too, for XP/VX/VX Ace (-M: with its own libraries; slow)
#   sh tools/install.sh -r     # -m, with the system's Ruby instead of mkxp-z's own Ruby 3.1
#   sh tools/install.sh --destdir DIR      # into DIR/usr/local (PREFIX=/usr: DIR/usr), for a package;
#                                          # apk.sh builds BusyLinux's that way
#   sh tools/install.sh --packages apk     # the build packages, by apk, apt-get, dnf, zypper or pacman name
#   sh tools/install.sh --mkxp-z-stage STAGE [--bundled | --system-ruby]   # only mkxp-z, into STAGE
# Options after -- go to CMake, e.g. -- -DFETCHCONTENT_SOURCE_DIR_PMJS_EFFEKSEER=DIR (DEVELOPING.md).
set -eu

die() { printf 'install.sh: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
src=$(cd "$(dirname "$0")/.." && pwd -P)

# Builds mkxp-z/ (XP/VX/VX Ace) into STAGE, with the system's libraries (and mkxp-z's own Ruby 3.1),
# its own copies of every library (--bundled; slow), or the system's Ruby too (--system-ruby;
# lib/rgss/ruby32.rb fills in). Run in a subshell: it changes directory and sets traps.
build_mkxpz() {
	usage="usage: $0 --mkxp-z-stage STAGE [--bundled | --system-ruby]"
	[ $# -ge 1 ] || die "$usage"
	stage=$1; shift
	bundled='' mri=''
	case ${1:-} in
	--bundled) bundled=1 ;;
	--system-ruby)
		# The newest Ruby whose development files are installed (ruby-3.4.pc for Ruby 3.4).
		mri=$(pkg-config --list-all | sed -n 's/^ruby-\([0-9][0-9]*\.[0-9][0-9]*\) .*/\1/p' | sort -t . -k 1,1n -k 2,2n | tail -n 1)
		[ -n "$mri" ] || die "--system-ruby needs Ruby's development files (ruby-dev, or ruby-devel)" ;;
	'') ;;
	*) die "$usage" ;;
	esac
	[ $# -le 1 ] || die "$usage"
	# Distributions can ship an older Meson than mkxp-z asks for (Ubuntu 24.04 has 1.3).
	need=$(sed -n "1s/.*meson_version: *'>= *\([0-9.]*\)'.*/\1/p" "$src/mkxp-z/meson.build")
	got=$(meson --version)
	if [ -n "$need" ] && ! printf '%s %s\n' "$got" "$need" | awk '{ split($1, a, "."); split($2, b, ".")
		for (i = 1; i <= 3; i++) if (a[i] + 0 != b[i] + 0) exit !(a[i] + 0 > b[i] + 0); exit 0 }'; then
		die "mkxp-z needs Meson $need or newer, and this system has $got: install a newer one
  (pipx install meson, or pip install --user meson) and run this again"
	fi

	cache=${XDG_CACHE_HOME:-$HOME/.cache}
	mkdir -p "$cache"
	work=$(mktemp -d "$cache/mkxp-z-build.XXXXXX")
	trap 'rm -rf "$work"' EXIT
	trap 'exit 1' INT TERM
	# Meson downloads subprojects into the source tree, so the build works on a copy.
	cp -R "$src/mkxp-z" "$work/src"
	cd "$work/src"
	if [ -n "$bundled" ]; then
		echo "==> building mkxp-z and its bundled libraries; this takes a long while"
		set --
	else
		echo "==> building mkxp-z with the system's libraries${mri:+ and Ruby $mri}"
		if [ -n "$mri" ]; then set -- -Ddefault_system=auto -Druby_system=enabled -Dmri_version="$mri"
		else set -- -Ddefault_system=auto -Druby_system=disabled; fi
	fi
	meson setup --prefix "$work/stage" --buildtype release -Dstrip=true -Db_lto=true -Dangle=disabled "$@" build
	meson compile -C build
	meson install -C build --no-rebuild --tags mkxp-z >/dev/null
	exe=
	for f in "$work/stage"/mkxp-z.*; do [ -f "$f" ] && exe=${f##*/}; done
	[ -n "$exe" ] || die "the build finished but installed no mkxp-z executable"
	upstream=$(sed -n 's/^\([0-9a-f]\{7\}\)[0-9a-f]*$/\1/p' git-hash | tail -n 1)
	printf '%s (TuxTavern %s)%s\n' "${upstream:-unknown}" "$(git -C "$src" log -1 --format=%h 2>/dev/null || echo unknown)" \
		"${mri:+, system Ruby $mri}" >"$work/stage/VERSION"
	# mkxp-z replaces Ruby's load path with the launcher's; with the system's Ruby, that is its library
	# and its extensions (zlib and others), named here for the launcher.
	[ -z "$mri" ] || for v in rubylibdir rubyarchdir; do pkg-config --variable=$v "ruby-$mri"; done >"$work/stage/loadpath"
	rm -rf "$stage"
	mkdir -p "$(dirname "$stage")"
	cp -R "$work/stage" "$stage"
}

if [ "${1:-}" = --mkxp-z-stage ]; then shift; build_mkxpz "$@"; exit; fi

prefix=${PREFIX:-/usr/local} mkxpz='' ruby='' destdir='' list=''
usage="usage: $0 [-u | --user] [-m | --mkxp-z | -M | --mkxp-z-bundled] [-r | --system-ruby] [--destdir DIR | --packages MANAGER] [-- CMAKE_OPTIONS...]"
while [ $# -gt 0 ]; do
	case $1 in
	-u | --user) prefix=$HOME/.local ;;
	--destdir) [ $# -ge 2 ] && [ -n "$2" ] || die "$usage"; destdir=$2; shift ;;
	--packages) [ $# -ge 2 ] || die "$usage"; list=$2; shift ;;
	-m | --mkxp-z) mkxpz=system ;;
	-M | --mkxp-z-bundled) mkxpz=bundled ;;
	-r | --system-ruby) ruby=1 ;;
	--) shift; break ;;
	*) die "$usage" ;;
	esac
	shift
done
if [ -n "$ruby" ]; then
	[ "$mkxpz" != bundled ] || die "-r builds mkxp-z with the system's libraries, so not with -M"
	mkxpz=system
fi

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
	[ -z "$mkxpz" ] || { printf ' '; mkxpz_packages "$1"; }
}
# mkxp-z also needs Meson and what its own Ruby 3.1 builds with; with the system's libraries, their
# development files; with its own, the Wayland ones its SDL needs for a Wayland backend.
mkxpz_tools='meson python3 bison ruby perl bash'
mkxpz_wayland='wayland-client wayland-egl wayland-cursor wayland-protocols xkbcommon'
mkxpz_libs='SDL2_image SDL2_ttf openal physfs ogg vorbis theora fluidsynth pixman-1 openssl yaml-0.1 libffi uchardet'
mkxpz_packages() {
	case $1 in
	apk) printf ' meson python3 bison ruby perl bash %s' "$(for m in $(mkxpz_modules); do printf 'pc:%s ' "$m"; done)" ;;
	apt-get) printf ' meson python3 bison ruby perl'
		if [ "$mkxpz" = system ]; then printf ' libsdl2-image-dev libsdl2-ttf-dev libopenal-dev libphysfs-dev libogg-dev
  libvorbis-dev libtheora-dev libfluidsynth-dev libpixman-1-dev libssl-dev libyaml-dev libffi-dev libuchardet-dev'
		else printf ' libwayland-dev wayland-protocols libxkbcommon-dev'; fi ;;
	dnf | zypper) printf ' meson python3 bison ruby perl %s' "$(for m in $(mkxpz_modules); do printf "'pkgconfig(%s)' " "$m"; done)" ;;
	pacman) printf ' meson python bison ruby perl'
		if [ "$mkxpz" = system ]; then printf ' sdl2_image sdl2_ttf openal physfs libogg libvorbis libtheora fluidsynth pixman openssl libyaml libffi uchardet'
		else printf ' wayland wayland-protocols libxkbcommon'; fi ;;
	esac
	[ -z "$ruby" ] || case $1 in apk | apt-get) printf ' ruby-dev' ;; dnf | zypper) printf ' ruby-devel' ;; esac
}
mkxpz_modules() { if [ "$mkxpz" = system ]; then echo "$mkxpz_libs"; else echo "$mkxpz_wayland"; fi; }
if [ -n "$list" ]; then
	case $list in apk | apt-get | dnf | zypper | pacman) ;; *) die "$usage" ;; esac
	packages "$list"; echo
	exit 0
fi
missing=
for t in c++ cmake pkg-config git node; do have "$t" || missing="$missing $t"; done
have ninja || have samu || have make || missing="$missing ninja"
if [ -n "$mkxpz" ]; then
	for t in $mkxpz_tools; do have "$t" || missing="$missing $t"; done
	modules="$modules $(mkxpz_modules)"
	# Ruby's development files, by any version (ruby-3.4.pc).
	[ -z "$ruby" ] || ! have pkg-config || pkg-config --list-all | grep -q '^ruby-[0-9]' || missing="$missing ruby-dev"
fi
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
headers${mkxpz:+, Meson, Python 3, bison, Ruby, Perl, bash}, and the development files of:$modules"
fi

as_root=
if [ -z "$destdir" ] && ! { mkdir -p "$prefix" 2>/dev/null && [ -w "$prefix" ]; }; then
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
case $mkxpz in
system) (build_mkxpz "$work/mkxp-z" ${ruby:+--system-ruby}) ;;
bundled) (build_mkxpz "$work/mkxp-z" --bundled) ;;
esac
# With --destdir, everything goes under DIR, while the wrapper names where it will be installed.
dest=$destdir$prefix/lib/tuxtavern bin=$destdir$prefix/bin
$as_root rm -rf "$dest"
$as_root cmake --install "$work" --prefix "$dest"
# The launcher finds mkxp-z here, beside its own files, as it finds pmjs.
[ -z "$mkxpz" ] || { $as_root mkdir -p "$dest/lib" && $as_root cp -R "$work/mkxp-z" "$dest/lib/mkxp-z"; }
# bin/tt and bin/pmjs find their files from their own path, so bin/ gets a wrapper, not a link.
$as_root mkdir -p "$bin"
printf '#!/bin/sh\nexec "%s/lib/tuxtavern/bin/tt" "$@"\n' "$prefix" | $as_root tee "$bin/tt" >/dev/null
$as_root chmod 755 "$bin/tt"
[ -z "$destdir" ] || { echo "Staged in $destdir$prefix."; exit 0; }
# The command was tuxtavern before; its old wrapper points at a file that is gone now.
! grep -qs "^exec \"$dest/bin/tuxtavern\"" "$bin/tuxtavern" || $as_root rm -f "$bin/tuxtavern"

echo "
Installed to $dest (command: $prefix/bin/tt). To remove it, delete both."
case :$PATH: in *":$prefix/bin:"*) ;; *) echo "$prefix/bin is not on PATH: add it, or run $prefix/bin/tt." ;; esac
