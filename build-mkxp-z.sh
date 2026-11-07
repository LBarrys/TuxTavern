#!/bin/sh
set -eu

die() { printf 'build-mkxp-z: %s\n' "$*" >&2; exit 1; }

prefix=${PREFIX:-/usr/local} system=''
for arg; do
	case $arg in
	-u | --user) prefix=$HOME/.local ;;
	-s | --system-libs) system=1 ;;
	*) die "usage: $0 [-u | --user] [-s | --system-libs]" ;;
	esac
done
ref=${MKXPZ_REF:-dev}

as_root='' virtual='' src=''
cleanup() {
	if [ -n "$src" ]; then echo "==> removing the build folder"; rm -rf "${src:?}"; fi
	if [ -n "$virtual" ]; then echo "==> removing build dependencies"; $as_root apk del -q "$virtual"; fi
}
trap cleanup EXIT
trap 'exit 1' INT TERM

have() { command -v "$1" >/dev/null 2>&1; }
manager=
for m in apk apt-get dnf zypper pacman; do have "$m" && { manager=$m; break; }; done
# The bundled SDL needs Wayland's development files to have a Wayland backend.
wayland='wayland-client wayland-egl wayland-cursor wayland-protocols xkbcommon egl'
# --system-libs: the system's libraries instead of building mkxp-z's bundled copies (SDL_sound and
# Ruby 3.1, which distributions lack, are still built). Much faster; they must stay installed.
syslibs='sdl2 SDL2_image SDL2_ttf openal physfs ogg vorbis theora freetype2 pixman-1 zlib openssl yaml-0.1 libffi uchardet'
# The modules in list $1 by pkg-config name, as apk (pc:) and dnf or zypper (pkgconfig()) take them.
pc_apk() { for m in $1; do printf 'pc:%s ' "$m"; done; }
pc_rpm() { for m in $1; do printf "'pkgconfig(%s)' " "$m"; done; }
packages() {
	case $manager in
	apt-get) printf 'build-essential cmake meson pkg-config python3 git bison ruby perl libwayland-dev wayland-protocols libxkbcommon-dev libegl-dev'
		[ -z "$system" ] || printf ' libsdl2-dev libsdl2-image-dev libsdl2-ttf-dev libopenal-dev libphysfs-dev libogg-dev libvorbis-dev
  libtheora-dev libfreetype-dev libpixman-1-dev zlib1g-dev libssl-dev libyaml-dev libffi-dev libuchardet-dev' ;;
	dnf | zypper) printf 'gcc-c++ cmake meson pkgconf python3 git bison ruby perl %s' "$(pc_rpm "$wayland")"
		[ -z "$system" ] || printf ' %s' "$(pc_rpm "$syslibs")" ;;
	pacman) printf 'base-devel cmake meson pkgconf python git bison ruby perl wayland wayland-protocols libxkbcommon mesa'
		[ -z "$system" ] || printf ' sdl2 sdl2_image sdl2_ttf openal physfs libogg libvorbis libtheora freetype2 pixman zlib openssl libyaml libffi uchardet' ;;
	esac
}

if [ "$manager" = apk ]; then
	# Alpine: what is missing goes in a virtual package, removed again when this script ends.
	deps="build-base linux-headers cmake meson pkgconf python3 git bison ruby perl bash $(pc_apk "$wayland")"
	[ -z "$system" ] || deps="$deps pc:sdl2 sdl2_image-dev sdl2_ttf-dev openal-soft-dev physfs-dev libogg-dev libvorbis-dev
  libtheora-dev freetype-dev pixman-dev zlib-dev openssl-dev yaml-dev libffi-dev uchardet-dev"
	if [ "$(id -u)" != 0 ]; then
		if have doas; then as_root=doas
		elif have sudo; then as_root=sudo
		else as_root=none
		fi
	fi
	missing=
	for p in $deps; do apk info -e "$p" >/dev/null 2>&1 || missing="$missing $p"; done
	if [ -n "$missing" ]; then
		[ "$as_root" != none ] || die "install the build dependencies first, as root:
  apk add$missing"
		echo "==> installing build dependencies, removed again when this script ends:$missing"
		virtual=.tuxtavern-mkxp-z-build
		# shellcheck disable=SC2086
		$as_root apk add -q --virtual "$virtual" $missing
	fi
else
	# Elsewhere packages are the user's to install and keep: say which are missing, and how.
	missing=
	for t in c++ cmake meson ninja pkg-config python3 git bison ruby perl bash wayland-scanner; do have "$t" || missing="$missing $t"; done
	if have pkg-config; then
		modules=$wayland
		[ -z "$system" ] || modules="$modules $syslibs"
		for m in $modules; do pkg-config --exists "$m" || missing="$missing $m"; done
	fi
	if [ -n "$missing" ]; then
		case $manager in
		apt-get) how='apt-get install' ;; dnf) how='dnf install' ;; zypper) how='zypper install' ;; pacman) how='pacman -S --needed' ;;
		*) die "missing:$missing. Install a C++ compiler, CMake, Meson, Ninja, pkg-config, Python 3, git, bison,
Ruby, Perl and bash, and the development files of:$wayland${system:+ $syslibs}" ;;
		esac
		die "missing:$missing. Install the build packages first, as root:
  $how $(packages)"
	fi
fi

cache=${XDG_CACHE_HOME:-$HOME/.cache}
mkdir -p "$cache"
src=$(mktemp -d "$cache/mkxp-z-build.XXXXXX")
echo "==> building in $src, removed again when this script ends"
git clone -q --depth 1 --branch "$ref" https://github.com/mkxp-z/mkxp-z.git "$src/mkxp-z"
cd "$src/mkxp-z"
# Distributions can ship an older Meson than mkxp-z asks for (Ubuntu 24.04 has 1.3).
need=$(sed -n "1s/.*meson_version: *'>= *\([0-9.]*\)'.*/\1/p" meson.build)
got=$(meson --version)
if [ -n "$need" ] && ! printf '%s %s\n' "$got" "$need" | awk '{ split($1, a, "."); split($2, b, ".")
	for (i = 1; i <= 3; i++) if (a[i] + 0 != b[i] + 0) exit !(a[i] + 0 > b[i] + 0); exit 0 }'; then
	die "mkxp-z needs Meson $need or newer, and this system has $got: install a newer one
  (pipx install meson, or pip install --user meson) and run this again"
fi

sed -i -e "s/'use_video_x11': is_unix ? 'enabled' : 'disabled'/'use_video_x11': 'disabled'/" \
	-e "s/'use_video_kmsdrm': is_unix ? 'enabled' : 'disabled'/'use_video_kmsdrm': 'disabled'/" src/meson.build
if ! grep -q "'use_video_x11': 'disabled'" src/meson.build || ! grep -q "'use_video_kmsdrm': 'disabled'" src/meson.build; then
	die "mkxp-z's src/meson.build changed; cannot build SDL for Wayland only"
fi

if [ -n "$system" ]; then
	echo "==> building mkxp-z with the system's libraries"
	set -- -Ddefault_system=auto -Druby_system=disabled
else
	echo "==> building mkxp-z and its bundled libraries; this takes a long while"
	set --
fi
meson setup --prefix "$src/stage" --buildtype release -Dstrip=true -Db_lto=true -Dangle=disabled "$@" build
meson compile -C build
meson install -C build --no-rebuild --tags mkxp-z >/dev/null
exe=
for f in "$src/stage"/mkxp-z.*; do [ -f "$f" ] && exe=${f##*/}; done
[ -n "$exe" ] || die "the build finished but installed no mkxp-z executable"
if [ -n "$system" ] && [ "$manager" = apk ]; then
	# The build dependencies go when this script ends; what mkxp-z links to must stay.
	libs=$(ldd "$src/stage/$exe" | awk '$1 ~ /^lib/ && $3 ~ /^\/(usr\/)?lib\// { print "so:" $1 }' | sort -u | tr '\n' ' ')
	echo "==> keeping the libraries mkxp-z uses installed: $libs"
	[ "$as_root" != none ] || die "as root, run: apk add $libs"
	# shellcheck disable=SC2086
	[ -z "$libs" ] || $as_root apk add -q $libs
fi

mkdir -p "$prefix/lib" "$prefix/bin"
old=$prefix/lib/mkxp-z/scripts/preload
kept=0
if [ -d "$old" ]; then
	for f in "$old"/*; do
		[ -e "$f" ] || continue
		[ -e "$src/stage/scripts/preload/${f##*/}" ] && continue
		cp -R "$f" "$src/stage/scripts/preload/"
		kept=$((kept + 1))
	done
fi
git -C "$src/mkxp-z" log -1 --format="$ref %h %cd" --date=short >"$src/stage/VERSION"
rm -rf "$prefix/lib/mkxp-z"
cp -R "$src/stage" "$prefix/lib/mkxp-z"
[ "$kept" = 0 ] || echo "==> kept $kept extra file(s) already in scripts/preload"
cat >"$prefix/bin/mkxp-z" <<EOF
#!/bin/sh
exec env SDL_VIDEODRIVER=wayland SRCDIR="\${SRCDIR:-\$PWD}" "$prefix/lib/mkxp-z/$exe" "\$@"
EOF
chmod 755 "$prefix/bin/mkxp-z"

cat <<EOF

Installed to $prefix/lib/mkxp-z (command: $prefix/bin/mkxp-z), for Wayland only:
SDL is built without X11 and drawing goes through Mesa's OpenGL over EGL.

Run a game:
  cd /path/to/game && mkxp-z          # or: tuxtavern /path/to/game
  mkxp-z test                         # playtest mode

TuxTavern passes mkxp-z its Ruby standard library itself. When running mkxp-z directly, a
game that needs it (Pokemon Essentials games do) needs this in its own mkxp.json:
  "rubyLoadpath": ["$prefix/lib/mkxp-z/stdlib"]

If it starts with a modal "Could not detect an available audio device" and goes no
further, there is no working sound output; install pipewire-pulse (or pulseaudio), or
run headless with ALSOFT_DRIVERS=null.
EOF
