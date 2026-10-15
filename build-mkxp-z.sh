#!/bin/sh
set -eu

die() { printf 'build-mkxp-z: %s\n' "$*" >&2; exit 1; }

prefix=${PREFIX:-/usr/local}
case ${1:-} in
--user) prefix=$HOME/.local ;;
'') ;;
*) die "usage: $0 [--user]" ;;
esac
ref=${MKXPZ_REF:-dev}

as_root='' virtual='' src=''
cleanup() {
	if [ -n "$src" ]; then echo "==> removing the build folder"; rm -rf "${src:?}"; fi
	if [ -n "$virtual" ]; then echo "==> removing build dependencies"; $as_root apk del -q "$virtual"; fi
}
trap cleanup EXIT
trap 'exit 1' INT TERM

deps='build-base linux-headers cmake meson pkgconf python3 git bison ruby perl bash'
missing=
for p in $deps; do apk info -e "$p" >/dev/null 2>&1 || missing="$missing $p"; done
if [ -n "$missing" ]; then
	if [ "$(id -u)" != 0 ]; then
		if command -v doas >/dev/null 2>&1; then as_root=doas
		elif command -v sudo >/dev/null 2>&1; then as_root=sudo
		else die "install the build dependencies first, as root:
  apk add$missing"
		fi
	fi
	echo "==> installing build dependencies, removed again when this script ends:$missing"
	virtual=.tuxtavern-mkxp-z-build
	# shellcheck disable=SC2086
	$as_root apk add -q --virtual "$virtual" $missing
fi

cache=${XDG_CACHE_HOME:-$HOME/.cache}
mkdir -p "$cache"
src=$(mktemp -d "$cache/mkxp-z-build.XXXXXX")
echo "==> building in $src, removed again when this script ends"
git clone -q --depth 1 --branch "$ref" https://github.com/mkxp-z/mkxp-z.git "$src/mkxp-z"
cd "$src/mkxp-z"

sed -i -e "s/'use_video_x11': is_unix ? 'enabled' : 'disabled'/'use_video_x11': 'disabled'/" \
	-e "s/'use_video_kmsdrm': is_unix ? 'enabled' : 'disabled'/'use_video_kmsdrm': 'disabled'/" src/meson.build
if ! grep -q "'use_video_x11': 'disabled'" src/meson.build || ! grep -q "'use_video_kmsdrm': 'disabled'" src/meson.build; then
	die "mkxp-z's src/meson.build changed; cannot build SDL for Wayland only"
fi

echo "==> building mkxp-z and its bundled libraries; this takes a long while"
meson setup --prefix "$src/stage" --buildtype release -Dstrip=true -Db_lto=true -Dangle=disabled build
meson compile -C build
meson install -C build --no-rebuild --tags mkxp-z >/dev/null
exe=
for f in "$src/stage"/mkxp-z.*; do [ -f "$f" ] && exe=${f##*/}; done
[ -n "$exe" ] || die "the build finished but installed no mkxp-z executable"

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
