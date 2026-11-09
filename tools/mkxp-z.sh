#!/bin/sh
# Builds mkxp-z/ (XP/VX/VX Ace) into STAGE: its executable, scripts/preload, the Ruby standard
# library and VERSION. tools/install.sh -m and tools/apk.sh -m install STAGE as lib/mkxp-z.
#   sh tools/mkxp-z.sh STAGE                 # with the system's libraries (and mkxp-z's own Ruby 3.1)
#   sh tools/mkxp-z.sh STAGE --bundled       # with mkxp-z's own copies of every library; slow
#   sh tools/mkxp-z.sh STAGE --system-ruby   # with the system's Ruby too; lib/rgss/ruby32.rb fills in
set -eu

die() { printf 'mkxp-z.sh: %s\n' "$*" >&2; exit 1; }
usage="usage: $0 STAGE [--bundled | --system-ruby]"
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
src=$(cd "$(dirname "$0")/.." && pwd -P)

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
