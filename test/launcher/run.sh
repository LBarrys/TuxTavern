#!/bin/sh
set -u
cd "$(dirname "$0")/../.." || exit 1
fx=$(mktemp -d)
trap 'rm -rf "$fx"' EXIT INT TERM
pass=0 fail=0
export WAYLAND_DISPLAY=wayland-test

check() {
	if printf '%s\n' "$out" | grep -qF -- "$2"; then
		pass=$((pass + 1)); echo "  ok $1"
	else
		fail=$((fail + 1)); echo "FAIL $1: expected '$2' in:"; printf '%s\n' "$out" | sed 's/^/     | /'
	fi
}
run() { out=$(sh ./tt "$@" 2>&1); }

mkdir -p "$fx/mv/www/js" "$fx/mz/js" "$fx/zip" "$fx/eapp/resources/app" "$fx/xp/Data" "$fx/vx/data" "$fx/none" "$fx/evb" "$fx/exe" "$fx/xpa" "$fx/vxa" "$fx/2k" "$fx/html"
echo "Utils.RPGMAKER_VERSION = \"1.6.1\";" >"$fx/mv/www/js/rpg_core.js"
echo "Utils.RPGMAKER_VERSION = \"1.8.0\";" >"$fx/mz/js/rmmz_core.js"
: >"$fx/zip/package.nw"
echo '{}' >"$fx/eapp/resources/app/package.json"
echo '{"main": "index.html"}' >"$fx/html/package.json"
: >"$fx/xp/Data/Scripts.rxdata"
: >"$fx/vx/data/scripts.RVDATA2"
printf '[Game]\r\nRTP1=Standard\r\nRTP2=\r\nScripts=Data\\Scripts.rxdata\r\n' >"$fx/xp/Game.ini"
printf '[Game]\r\nRTP=RPGVX\r\n' >"$fx/xpa/Game.ini"; : >"$fx/xpa/Game.rgssad"
printf '[Game]\r\nRTP=RPGVX\r\n' >"$fx/vxa/Game.ini"; : >"$fx/vxa/GAME.RGSS2A"
: >"$fx/2k/RPG_RT.ldb"; : >"$fx/2k/RPG_RT.LMT"
mkdir -p "$fx/nwdir/Package.nw/js"; : >"$fx/nwdir/Secretary.exe"; : >"$fx/nwdir/nw.dll"
echo '{"main": "index.html"}' >"$fx/nwdir/Package.nw/package.json"; : >"$fx/nwdir/Package.nw/index.html"
echo 'Utils.RPGMAKER_VERSION = "1.9.0";' >"$fx/nwdir/Package.nw/js/rmmz_core.js"
printf '// settings {\n{\n\t// "preloadScript": ["old.rb"],\n\t"windowTitle": "VX",\n}\n' >"$fx/vx/mkxp.json"
mkdir -p "$fx/pre"; : >"$fx/pre/Game.ini"; : >"$fx/pre/Game.rgss3a"; printf '{ "preloadScript": ["mine.rb"] }\n' >"$fx/pre/mkxp.json"
: >"$fx/mv/Game.exe"
printf 'MZ\000\000.enig\000ma1' >"$fx/exe/Game.exe"
printf 'MZ\000\000.enigma1\000' >"$fx/evb/GAME.EXE"

echo "== tt"
run --version; check 'reports its version' 'tt 0.'
run --info "$fx/mv"; check 'MV is detected' 'engine:  mv'; check 'MV version is read' 'version: 1.6.1'
run --info "$fx/mv/Game.exe"; check 'a Game.exe path means its folder' 'engine:  mv'
run --info "$fx/mz"; check 'MZ is detected' 'engine:  mz'; check 'MZ version is read' 'version: 1.8.0'
run --info "$fx/zip"; check 'package.nw is detected' 'engine:  nwjs-zip'
run --info "$fx/xp"; check 'XP is detected' 'engine:  rgss'; check 'TuxTavern writes the config' 'config:  written by tt'
check 'the RTP the game names is reported' 'rtp:     Standard, not installed'
run --info "$fx/vx"; check 'detection ignores letter case' 'engine:  rgss'; check "a game's own mkxp.json is found" "merged with the game's mkxp.json"
run --info "$fx/vxa"; check 'an archive-only game is detected' 'engine:  rgss'
run --info "$fx/nwdir"; check 'a package.nw folder is the game' "game:    $fx/nwdir/Package.nw"; check 'and what is in it is detected' 'engine:  mz'
run --info "$fx/nwdir/Secretary.exe"; check 'also when started from the exe next to it' 'engine:  mz'
run --info "$fx/none"; check 'an empty folder is not a game' 'engine:  not recognized'
game="$fx/my game\$%"; mkdir -p "$game/www/js" "$game/www/data" "$game/www/icon"; : >"$game/www/js/rpg_core.js"; : >"$game/www/icon/icon.png"
echo '{"currencyUnit":"G","gameTitle":"Tux Quest","locale":"en_US"}' >"$game/www/data/System.json"
out=$(XDG_DATA_HOME="$fx/apps" sh ./tt --desktop "$game" 2>&1); check '--desktop adds an MV game to the app launcher' 'Added Tux Quest to the app launcher'
out=$(cat "$fx"/apps/applications/tuxtavern-*.desktop); check 'named after its title' 'Name=Tux Quest'
check 'running it from its folder, quoted for a .desktop file' "Exec=\"$(readlink -f ./tt)\" \"$fx/my game\\\\\$%%\""
check 'with its icon' "Icon=$game/www/icon/icon.png"
if command -v desktop-file-validate >/dev/null 2>&1; then
	out=$(desktop-file-validate "$fx"/apps/applications/tuxtavern-*.desktop 2>&1 && echo valid); check 'which is a valid desktop entry' 'valid'
fi
rm -rf "$fx/apps"
printf '[Game]\r\nTitle=Ruby Days\r\n' >"$fx/xp/Game.ini.new"; cp "$fx/xp/Game.ini" "$fx/xp/Game.ini.old"; cat "$fx/xp/Game.ini.new" >>"$fx/xp/Game.ini"
out=$(XDG_DATA_HOME="$fx/apps" sh ./tt -d "$fx/xp" 2>&1); check "an XP game is named from Game.ini" 'Added Ruby Days'
printf '[Game]\r\nTitle=\203\211\203C\r\n' >"$fx/xp/Game.ini"
out=$(XDG_DATA_HOME="$fx/apps" sh ./tt -d "$fx/xp" 2>&1); check 'a Shift-JIS title falls back to the folder name' 'Added xp to'
mv "$fx/xp/Game.ini.old" "$fx/xp/Game.ini"; rm -f "$fx/xp/Game.ini.new"
run --desktop "$fx/none"; check '--desktop needs a game' 'no RPG Maker XP/VX/VX Ace/MV/MZ game found'
run --info "$fx/evb"; check 'an Enigma-packed exe is detected' 'engine:  evb'; check 'and named' 'GAME.EXE (Enigma'
run --info "$fx/exe"; check 'a plain exe is not taken for Enigma' 'engine:  not recognized'
run --info "$fx/2k"; check 'RPG Maker 2000/2003 is not supported' 'engine:  not recognized'
run --info "$fx/eapp"; check 'nor are Electron apps' 'engine:  not recognized'
run --info "$fx/html"; check 'nor NW.js apps that are not MV/MZ' 'engine:  not recognized'
run "$fx/none"; check 'running a non-game fails' 'no RPG Maker XP/VX/VX Ace/MV/MZ game found'
run --bogus; check 'unknown options are refused' 'unknown option'
run --wasd "$fx/mv"; check 'the Electron-only --wasd is gone' 'unknown option'

# A PATH without package managers, build tools, node or pmjs; each case adds what it needs.
mkdir -p "$fx/minbin" "$fx/pm/apk" "$fx/pm/apt" "$fx/pm/pacman" "$fx/pm/dnf" && : >"$fx/pm/file1.rpgsave"
for f in /bin/* /usr/bin/*; do
	case ${f##*/} in
	apk | apt-get | dnf | pacman | zypper | node | nodejs | pmjs | cmake | ninja | samu | make | c++ | pkg-config | git) ;;
	*) [ -e "$fx/minbin/${f##*/}" ] || ln -s "$f" "$fx/minbin/" ;;
	esac
done
for m in apk apt-get pacman dnf; do d=${m%-get}; printf '#!/bin/sh\nexit 1\n' >"$fx/pm/$d/$m"; chmod +x "$fx/pm/$d/$m"; done

echo "== install.sh"
# Stand-ins for the build tools; pkg-config lacks the modules named in $PC_MISSING.
mkdir -p "$fx/is/bin" "$fx/is/include/node" && : >"$fx/is/include/node/node_api.h"
for t in c++ git node ninja; do printf '#!/bin/sh\n' >"$fx/is/bin/$t"; done
# shellcheck disable=SC2016
printf '#!/bin/sh\n[ "$1" != --list-all ] || { case " $PC_MISSING " in *" ruby "*) ;; *) echo "ruby-3.4 Ruby - x" ;; esac; exit; }\ncase " $PC_MISSING " in *" $2 "*) exit 1 ;; esac\n' >"$fx/is/bin/pkg-config"
cat >"$fx/is/bin/cmake" <<'EOF'
#!/bin/sh
echo "cmake $*" >>"$IS_LOG"
[ "$1" != --install ] || { mkdir -p "$4/bin"; : >"$4/bin/tt"; }
EOF
chmod +x "$fx/is/bin/"*
is() {
	p=$1; shift; : >"$fx/is/log"
	out=$(IS_LOG="$fx/is/log" HOME="$fx/is/home" XDG_CACHE_HOME="$fx/is/cache" PATH="$p:$fx/is/bin:$fx/minbin" sh tools/install.sh "$@" 2>&1; cat "$fx/is/log")
}
PC_MISSING='libwebp sdl2' is "$fx/pm/apt" -u
check 'install.sh names what is missing' 'missing: sdl2 libwebp. Install the build packages first, as root:'
check 'with the command for apt' 'apt-get install build-essential cmake ninja-build pkg-config git nodejs libnode-dev libsdl2-dev'
PC_MISSING=sdl2 is "$fx/pm/dnf" -u; check 'and for dnf, by pkg-config module' "dnf install gcc-c++ cmake ninja-build pkgconf git nodejs nodejs-devel 'pkgconfig(sdl2)'"
PC_MISSING=sdl2 is "$fx/pm/apk" -u; check 'and for apk' 'apk add build-base cmake samurai pkgconf git nodejs-dev linux-headers mesa-dev pc:sdl2'
PC_MISSING=sdl2 is "$fx/pm/pacman" -u; check 'and for pacman' 'pacman -S --needed base-devel cmake ninja pkgconf git nodejs sdl2'
PC_MISSING=sdl2 is "$fx/pm/none" -u; check 'or what to install without a known package manager' 'Install a C++ compiler, CMake, Ninja, pkg-config, git, Node.js with its'
mkdir -p "$fx/is/home/.local/bin"
printf '#!/bin/sh\nexec "%s/bin/tuxtavern" "$@"\n' "$fx/is/home/.local/lib/tuxtavern" >"$fx/is/home/.local/bin/tuxtavern"
PC_MISSING='' is "$fx/pm/none" -u -- -DEXAMPLE=1
check 'with everything there it builds the native add-on' 'cmake --build'
check 'passing options after -- to CMake' '-DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=OFF -DEXAMPLE=1'
check 'and -u installs into ~/.local' "--prefix $fx/is/home/.local/lib/tuxtavern"
out=$(cat "$fx/is/home/.local/bin/tt" 2>&1)
check 'with a wrapper, as bin/tt finds its files from its own path' "exec \"$fx/is/home/.local/lib/tuxtavern/bin/tt\" \"\$@\""
[ ! -e "$fx/is/home/.local/bin/tuxtavern" ] && pass=$((pass + 1)) && echo "  ok and removes the wrapper of the old tuxtavern command" || { fail=$((fail + 1)); echo "FAIL the old tuxtavern wrapper was left"; }
printf 'someone else'"'"'s\n' >"$fx/is/home/.local/bin/tuxtavern"; PC_MISSING='' is "$fx/pm/none" -u
[ -e "$fx/is/home/.local/bin/tuxtavern" ] && pass=$((pass + 1)) && echo "  ok but not another program by that name" || { fail=$((fail + 1)); echo "FAIL another tuxtavern was removed"; }
rm -f "$fx/is/home/.local/bin/tuxtavern"
case $(ls "$fx/is/cache") in *tuxtavern-build*) fail=$((fail + 1)); echo "FAIL the build folder was left behind" ;; *) pass=$((pass + 1)); echo "  ok and removes its build folder" ;; esac
PC_MISSING='' is "$fx/pm/none" --bogus; check 'an unknown option is refused' 'usage: tools/install.sh [-u | --user] [-m | --mkxp-z | -M | --mkxp-z-bundled] [-r | --system-ruby] [-- CMAKE_OPTIONS...]'

echo "== tools/mkxp-z.sh"
# A stand-in meson that logs what it is asked and installs an executable into its --prefix.
mkdir -p "$fx/mz/bin"
cat >"$fx/mz/bin/meson" <<'EOF'
#!/bin/sh
[ "$1" != --version ] || { echo "${MESON_VERSION:-1.4.0}"; exit; }
echo "meson $* pwd=$PWD" >>"$MZ_LOG"
case $1 in setup) for a; do case $a in --prefix) next=1 ;; *) [ -z "${next:-}" ] || { echo "$a" >"$MZ_LOG.stage"; next=; } ;; esac; done ;;
install) st=$(cat "$MZ_LOG.stage"); mkdir -p "$st/scripts/preload"; : >"$st/scripts/preload/win32_wrap.rb"; : >"$st/mkxp-z.x86_64" ;; esac
EOF
chmod +x "$fx/mz/bin/meson"
mz() { : >"$fx/mz/log"; out=$(MZ_LOG="$fx/mz/log" XDG_CACHE_HOME="$fx/mz/cache" PATH="$fx/mz/bin:$PATH" sh tools/mkxp-z.sh "$@" 2>&1; cat "$fx/mz/log"); }
mz "$fx/mz/stage"
check 'mkxp-z.sh builds mkxp-z/ with the system libraries by default' '-Ddefault_system=auto -Druby_system=disabled build'
check 'on a copy, as Meson downloads subprojects into its source tree' "pwd=$fx/mz/cache/mkxp-z-build."
[ -f "$fx/mz/stage/mkxp-z.x86_64" ] && [ ! -e mkxp-z/build ] && pass=$((pass + 1)) && echo "  ok into STAGE, leaving the checkout alone" || { fail=$((fail + 1)); echo "FAIL the stage or checkout is wrong"; }
out=$(cat "$fx/mz/stage/VERSION"); check 'recording the upstream commit and TuxTavern'"'"'s, for --info' 'f02d586 (TuxTavern '
case $(ls "$fx/mz/cache") in *mkxp-z-build*) fail=$((fail + 1)); echo "FAIL the build folder was left behind" ;; *) pass=$((pass + 1)); echo "  ok and removes its build folder" ;; esac
mz "$fx/mz/stage" --bundled
case $out in *default_system*) fail=$((fail + 1)); echo "FAIL --bundled still used the system libraries" ;; *) pass=$((pass + 1)); echo "  ok --bundled builds mkxp-z's own libraries" ;; esac
MESON_VERSION=1.3.2 mz "$fx/mz/stage"
check 'an older Meson than mkxp-z asks for is named, with how to get a newer one' 'mkxp-z needs Meson 1.4.0 or newer, and this system has 1.3.2'
MESON_VERSION=1.10.1 mz "$fx/mz/stage"; check 'versions compare by number, not as text' 'meson setup --prefix'
mz "$fx/mz/stage" --bogus; check 'an unknown option is refused' 'usage: tools/mkxp-z.sh STAGE [--bundled | --system-ruby]'
# A stand-in pkg-config with the development files of Ruby 3.4 and 3.10 (as Alpine's ruby-dev has).
mkdir -p "$fx/mz/ruby"
cat >"$fx/mz/ruby/pkg-config" <<'EOF'
#!/bin/sh
case $1 in
--list-all) printf 'sdl2 SDL2 - x\nruby-3.4 Ruby - x\nruby-3.10 Ruby - x\n' ;;
--variable=rubylibdir) echo "/usr/lib/ruby/${2#ruby-}.0" ;;
--variable=rubyarchdir) echo "/usr/lib/ruby/${2#ruby-}.0/x86_64-linux-musl" ;;
esac
EOF
chmod +x "$fx/mz/ruby/pkg-config"
PATH="$fx/mz/ruby:$PATH" mz "$fx/mz/stage" --system-ruby
check '--system-ruby links the newest Ruby with development files' '-Ddefault_system=auto -Druby_system=enabled -Dmri_version=3.10 build'
out=$(cat "$fx/mz/stage/loadpath"); check 'and names its library and extensions for the launcher' "/usr/lib/ruby/3.10.0
/usr/lib/ruby/3.10.0/x86_64-linux-musl"
out=$(cat "$fx/mz/stage/VERSION"); check 'and --info says so' ', system Ruby 3.10'
printf '#!/bin/sh\n' >"$fx/mz/ruby/pkg-config"
PATH="$fx/mz/ruby:$PATH" mz "$fx/mz/stage" --system-ruby; check 'without them it says what to install' "--system-ruby needs Ruby's development files"

echo "== install.sh -m"
for t in meson python3 bison ruby perl bash; do [ -e "$fx/is/bin/$t" ] || printf '#!/bin/sh\n' >"$fx/is/bin/$t"; done
cp "$fx/mz/bin/meson" "$fx/is/bin/meson"
chmod +x "$fx/is/bin/"*
im() { : >"$fx/mz/log"; IS_MZ=1 MZ_LOG="$fx/mz/log" is "$@"; out="$out
$(cat "$fx/mz/log")"; }
PC_MISSING='SDL2_ttf' im "$fx/pm/apt" -u -m
check 'install.sh -m also checks what mkxp-z needs' 'missing: SDL2_ttf.'
check 'and names its packages for apt' 'meson python3 bison ruby perl libsdl2-image-dev libsdl2-ttf-dev'
PC_MISSING='xkbcommon' im "$fx/pm/apt" -u --mkxp-z-bundled; check 'with -M, the Wayland files its own SDL needs' 'meson python3 bison ruby perl libwayland-dev wayland-protocols libxkbcommon-dev'
PC_MISSING='SDL2_ttf' im "$fx/pm/apt" -u; check 'but not without -m' '==> building in'
PC_MISSING='' im "$fx/pm/none" -u -m
check 'with everything there it builds mkxp-z with the system libraries' '-Ddefault_system=auto -Druby_system=disabled build'
[ -f "$fx/is/home/.local/lib/tuxtavern/lib/mkxp-z/mkxp-z.x86_64" ] && pass=$((pass + 1)) && echo "  ok and installs it as lib/mkxp-z" || { fail=$((fail + 1)); echo "FAIL mkxp-z was not installed"; }
PC_MISSING='' im "$fx/pm/none" -u -M
case $out in *default_system*) fail=$((fail + 1)); echo "FAIL -M used the system libraries" ;; *) pass=$((pass + 1)); echo "  ok -M builds mkxp-z's own libraries" ;; esac
PC_MISSING='' im "$fx/pm/none" -u
case $out in *meson*) fail=$((fail + 1)); echo "FAIL mkxp-z was built without -m" ;; *) pass=$((pass + 1)); echo "  ok and without -m, no mkxp-z" ;; esac
PC_MISSING='ruby' im "$fx/pm/apt" -u -r; check "-r needs Ruby's development files" 'missing: ruby-dev.'
check 'naming them with the rest for apt' 'libuchardet-dev ruby-dev'
PC_MISSING='ruby' im "$fx/pm/dnf" -u -r; check 'and for dnf' "'pkgconfig(uchardet)'  ruby-devel"
PC_MISSING='' im "$fx/pm/none" -u -r; check '-r builds mkxp-z with the system Ruby, without -m' '-Ddefault_system=auto -Druby_system=enabled -Dmri_version=3.4 build'
PC_MISSING='' im "$fx/pm/none" -u -M -r; check 'but not with mkxp-z'"'"'s own libraries' '-r builds mkxp-z with the system'"'"'s libraries, so not with -M'

echo "== launcher and an installed mkxp-z"
# The layout install.sh -m makes: bin/tt, share/tuxtavern, lib/mkxp-z.
mkdir -p "$fx/inst/bin" "$fx/inst/lib/mkxp-z/scripts/preload" "$fx/inst/xp/Data"
cp tt "$fx/inst/bin/tt"; cp -R lib "$fx/inst/share-lib"; mkdir -p "$fx/inst/share" && mv "$fx/inst/share-lib" "$fx/inst/share/tuxtavern"
printf '#!/bin/sh\necho "installed mkxp-z driver=$SDL_VIDEODRIVER args=$*"\n' >"$fx/inst/lib/mkxp-z/mkxp-z.x86_64"; chmod +x "$fx/inst/lib/mkxp-z/mkxp-z.x86_64"
: >"$fx/inst/lib/mkxp-z/scripts/preload/win32_wrap.rb"; echo 'f02d586 (TuxTavern 1234567)' >"$fx/inst/lib/mkxp-z/VERSION"
: >"$fx/inst/xp/Data/Scripts.rxdata"; : >"$fx/inst/xp/Game.exe"
out=$(PATH="$fx/minbin" sh "$fx/inst/bin/tt" -i "$fx/inst/xp" 2>&1)
check 'the launcher finds mkxp-z beside its install, before PATH' "runtime: $fx/inst/lib/mkxp-z/mkxp-z.x86_64 (f02d586 (TuxTavern 1234567))"
out=$(PATH="$fx/minbin" XDG_DATA_HOME="$fx/inst/data" WAYLAND_DISPLAY=wayland-0 sh "$fx/inst/bin/tt" "$fx/inst/xp" 2>&1); check 'and runs it on Wayland' 'installed mkxp-z driver=wayland args='
out=$(PATH="$fx/pm/apt:$fx/minbin" sh ./tt -i "$fx/inst/xp" 2>&1); check 'without one it says how to get it' 'runtime: mkxp-z not installed (sh tools/install.sh -m in a TuxTavern checkout)'
mkdir -p "$fx/pathmk" && printf '#!/bin/sh\necho old mkxp-z\n' >"$fx/pathmk/mkxp-z" && chmod +x "$fx/pathmk/mkxp-z"
out=$(PATH="$fx/pathmk:$fx/pm/apt:$fx/minbin" sh ./tt -i "$fx/inst/xp" 2>&1)
check 'an mkxp-z on PATH (the old build-mkxp-z.sh) is not used' 'runtime: mkxp-z not installed'
out=$(PATH="$fx/pm/apk:$fx/minbin" WAYLAND_DISPLAY=wayland-0 sh ./tt "$fx/inst/xp" 2>&1); check 'on Alpine through the package script' 'XP/VX/VX Ace games need mkxp-z (doas sh tools/apk.sh -m in a TuxTavern checkout)'

echo "== mkxp-z/"
# Alpine's sdl2_image-dev and sdl2_ttf-dev have only pkg-config files, named SDL2_image.pc and
# SDL2_ttf.pc; mkxp-z asked for sdl2_image and sdl2_ttf, so it built its own copies.
for pc in SDL2_image SDL2_ttf; do
	line=$(grep "^$(printf %s "$pc" | tr 'A-Z' 'a-z') = dependency(" mkxp-z/src/meson.build)
	case $line in *"dependency('$pc'"*) pass=$((pass + 1)); echo "  ok mkxp-z finds the system's $pc by its pkg-config name" ;;
	*) fail=$((fail + 1)); echo "FAIL mkxp-z does not ask pkg-config for $pc: $line" ;; esac
done
# mkxp-z's src/meson.build names SDL_ttf's font struct by the first check that compiles, and font.h
# forward-declares `struct MKXPZ_TTF_FONT`, so the name must be the struct tag (SDL_ttf 2.x: _TTF_Font).
if pkg-config --exists SDL2_ttf 2>/dev/null && command -v cc >/dev/null && command -v c++ >/dev/null; then
	# The names the checks choose, in order (the first line is for mkxp-z's own SDL_ttf).
	names=$(sed -n "s/.*global_args += '-DMKXPZ_TTF_FONT=\([A-Za-z_]*\)'.*/\1/p" mkxp-z/src/meson.build | tail -n +2)
	name='' i=0
	for n in $names; do
		i=$((i + 1))
		awk -v want=$i "/compiles\\('''/ { k++; grab = (k == want); next } grab && /^''', name:/ { exit } grab { print }" mkxp-z/src/meson.build >"$fx/ttf.c"
		# shellcheck disable=SC2046
		if cc -c -o /dev/null $(pkg-config --cflags SDL2_ttf) "$fx/ttf.c" 2>/dev/null; then name=$n; break; fi
	done
	printf '#include <SDL_ttf.h>\nstruct %s;\nint main() { %s *font = TTF_OpenFont("", 0); return font != 0; }\n' "$name" "$name" >"$fx/ttf.cpp"
	# shellcheck disable=SC2046
	if [ -n "$name" ] && c++ -c -o /dev/null $(pkg-config --cflags SDL2_ttf) "$fx/ttf.cpp" 2>/dev/null; then
		pass=$((pass + 1)); echo "  ok mkxp-z names this SDL_ttf's font type by its struct tag ($name), as font.h needs"
	else fail=$((fail + 1)); echo "FAIL mkxp-z's SDL_ttf check picks '$name', which font.h cannot forward-declare"; fi
else echo "  skip SDL2_ttf development files are not installed"; fi

echo "== lib"
if command -v node >/dev/null 2>&1; then
	for t in test/launcher/*-test.js; do
		# shellcheck disable=SC3045
		out=$(ulimit -n 256 2>/dev/null; node "$t" 2>&1) || true
		pass=$((pass + $(printf '%s\n' "$out" | grep -c '^ok '))); fail=$((fail + $(printf '%s\n' "$out" | grep -vc '^ok ')))
		printf '%s\n' "$out" | sed 's/^ok /  ok /'
	done
	mkdir -p "$fx/packed" "$fx/bin"
	node -e "const { evb } = require('./test/launcher/evb-test.js'); const f = (name, data) => ({ name, data: Buffer.from(data) });
require('fs').writeFileSync(process.argv[1], evb({ name: '%DEFAULT FOLDER%', children: [f('package.json', '{}'),
  { name: 'www', children: [f('index.html', ''), { name: 'js', children: [f('rpg_core.js', '')] }] }] }))" "$fx/packed/Game.exe"
	# shellcheck disable=SC2016
	printf '#!/bin/sh\necho "pmjs $* driver=${SDL_VIDEODRIVER:-} hz=${PMJS_RENDER_HZ:-}"\nfor a; do case $a in *.js) cat "$a" ;; esac; done\n' >"$fx/bin/pmjs" && chmod +x "$fx/bin/pmjs"
	# XP/VX/VX Ace games need the installed layout install.sh -m makes: bin/tt,
	# share/tuxtavern and lib/mkxp-z, here with a stand-in mkxp-z that reads mkxp.json in SRCDIR.
	tt="$fx/ti/bin/tt"
	mkdir -p "$fx/ti/bin" "$fx/ti/share" "$fx/ti/lib/mkxp-z/scripts/preload" "$fx/ti/lib/mkxp-z/stdlib" "$fx/data/tuxtavern/rtp/Standard"
	cp tt "$tt" && cp -R lib "$fx/ti/share/tuxtavern"
	# shellcheck disable=SC2016
	printf '#!/bin/sh\necho "mkxp-z rgss=$TUXTAVERN_RGSS_VERSION driver=$SDL_VIDEODRIVER cheat=$TUXTAVERN_CHEAT pwd=$PWD srcdir=$SRCDIR args=$*"; cd "${SRCDIR:-.}" && cat mkxp.json\n' >"$fx/ti/lib/mkxp-z/mkxp-z.x86_64"
	chmod +x "$fx/ti/lib/mkxp-z/mkxp-z.x86_64"
	: >"$fx/ti/lib/mkxp-z/scripts/preload/win32_wrap.rb"

	out=$(PATH="/usr/bin:/bin" sh ./tt "$fx/mv" 2>&1); check 'without pmjs it says how to get it' 'MV/MZ games need pmjs'
	out=$(PATH="$fx/pm/apk:$fx/minbin" sh ./tt "$fx/mv" 2>&1); check 'on Alpine it names the apk package script' 'MV/MZ games need pmjs (doas sh tools/apk.sh in a TuxTavern checkout)'
	out=$(PATH="$fx/pm/apt:$fx/minbin" sh ./tt "$fx/mv" 2>&1); check 'elsewhere the install script' 'MV/MZ games need pmjs (sh tools/install.sh in a TuxTavern checkout)'
	out=$(PATH="$fx/pm/apt:$fx/minbin" sh ./tt --edit-save "$fx/pm/file1.rpgsave" 2>&1); check 'and node is named for the package manager there: apt' '--edit-save needs node (apt-get install nodejs)'
	out=$(PATH="$fx/pm/pacman:$fx/minbin" sh ./tt --edit-save "$fx/pm/file1.rpgsave" 2>&1); check 'pacman' '--edit-save needs node (pacman -S nodejs)'
	out=$(PATH="$fx/minbin" sh ./tt --edit-save "$fx/pm/file1.rpgsave" 2>&1); check 'or just its name without one' '--edit-save needs node (install nodejs)'
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" sh ./tt "$fx/mv" 2>&1)
	check 'an MV game is prepared from its www folder' "pmjs prepare --game $fx/mv/www --config"
	check 'then run on Wayland, saving where NW.js does' "pmjs run --game $fx/mv/www --save-root $fx/mv/www/save driver=wayland"
	check 'with its asset cache kept out of the game' "--config $fx/cache/tuxtavern/pmjs/"
	check 'the F8 cheat menu is loaded as a PMJS adapter' '/tuxtavern.js driver='
	check 'and installs itself once the game plugins have loaded' "PMJS.phases.on('afterGuestPlugins', 'tuxtavern.cheats'"
	out=$(cat "$fx"/cache/tuxtavern/pmjs/*/config.json); check 'the asset cache is in the cache folder' "\"cacheRoot\": \"$fx/cache/tuxtavern/pmjs/"
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" TUXTAVERN_OVERRIDES='data:.json=.pack,js/plugins:.js=.mod,data:.png=_en.png' TUXTAVERN_SAVE_DIRS='saves' sh ./tt "$fx/mv" 2>&1)
	out=$(node -e 'for (const f of process.argv.slice(1)) { const c = JSON.parse(require("fs").readFileSync(f, "utf8")); if (c.virtualFiles) console.log(JSON.stringify(c.virtualFiles)); }' "$fx"/cache/tuxtavern/pmjs/*/config.json 2>&1)
	check 'TUXTAVERN_OVERRIDES and TUXTAVERN_SAVE_DIRS reach the PMJS config, grouped by folder' '{"overrides":{"data":{".json":".pack",".png":"_en.png"},"js/plugins":{".js":".mod"}},"saveDirectories":["saves"]}'
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" TUXTAVERN_OVERRIDES='data:json=x' sh ./tt "$fx/mv" 2>&1)
	check 'and a rule it cannot read stops the game with how to write one' 'TUXTAVERN_OVERRIDES: cannot read data:json=x (use folder:.ext=.new'
	case $out in *'pmjs prepare'*) fail=$((fail + 1)); echo "FAIL a bad TUXTAVERN_OVERRIDES still ran the game" ;; *) pass=$((pass + 1)); echo "  ok without running it" ;; esac
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" sh ./tt "$fx/mv" 2>&1)
	out=$(cat "$fx"/cache/tuxtavern/pmjs/*/config.json)
	case $out in *virtualFiles*) fail=$((fail + 1)); echo "FAIL virtualFiles written without the variables" ;; *) pass=$((pass + 1)); echo "  ok without them the config is unchanged" ;; esac
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" sh ./tt -C "$fx/mv" 2>&1)
	case $out in *--adapter*) fail=$((fail + 1)); echo "FAIL -C still loaded the cheat menu" ;; *) pass=$((pass + 1)); echo "  ok -C (--no-cheat) leaves the cheat menu out" ;; esac
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" TUXTAVERN_SKIP='MOD/DRGN_TranslationUI,Other' sh ./tt -C "$fx/mv" 2>&1)
	check 'TUXTAVERN_SKIP is passed as the adapter, even without the cheat menu' '/tuxtavern.js driver='
	check 'which leaves those plugins out before any loads' 'var skip = ["MOD/DRGN_TranslationUI", "Other"];'
	check 'saying so' 'tt: TUXTAVERN_SKIP leaves out'
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" sh ./tt "$fx/mz" 2>&1); check 'an MZ game runs from its own folder' "pmjs run --game $fx/mz --save-root $fx/mz/save driver=wayland"
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" sh ./tt -T "$fx/mz" 2>&1); check '-T says it is XP/VX/VX Ace only' '-T works for XP/VX/VX Ace games only'
	mkdir -p "$fx/mvenv/www/js"; : >"$fx/mvenv/www/js/rpg_core.js"
	printf '# PMJS_RENDER_HZ=120\r\nPMJS_RENDER_HZ=30\r\n\r\nTUXTAVERN_SKIP=Foo,Bar\r\nPATH=/nowhere\r\nPMJS_NOVALUE\r\n' >"$fx/mvenv/TuxTavern.env"
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" sh ./tt "$fx/mvenv" 2>&1)
	check "a game's tuxtavern.env sets PMJS_* variables" 'driver=wayland hz=30'
	check 'and TUXTAVERN_* ones' 'var skip = ["Foo", "Bar"];'
	check 'but no others' "only PMJS_*, TUXTAVERN_* and SDL_* are read, not: PATH=/nowhere"
	check 'a line without = is pointed out' "no '=' in: PMJS_NOVALUE"
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" PMJS_RENDER_HZ=60 sh ./tt "$fx/mvenv" 2>&1)
	check 'what the environment sets wins over tuxtavern.env' 'driver=wayland hz=60'
	out=$(PATH="$fx/bin:$PATH" sh ./tt -i "$fx/mvenv" 2>&1); check '--info names tuxtavern.env' "settings: $fx/mvenv/TuxTavern.env"
	mkdir -p "$fx/mvuser/www/js" && : >"$fx/mvuser/www/js/rpg_core.js"
	# shellcheck disable=SC2016
	printf 'var tuxUser = (globalThis.tuxUser || "") + "a";\r\n// 100%% a "quoted" \\ back\\slash\r\ntuxUser += "\\x62";\n' >"$fx/mvuser/a.tuxtavern.js"
	printf 'throw new Error("broken fix");\n' >"$fx/mvuser/B.TuxTavern.js"
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" sh ./tt -C "$fx/mvuser" 2>&1)
	check "a game folder's *.tuxtavern.js are found, any case, in name order" "[{ file: \"$fx/mvuser/B.TuxTavern.js\", source: \"throw new Error(\\\"broken fix\\\");\\n\" }, { file: \"$fx/mvuser/a.tuxtavern.js\""
	adapter=$(ls "$fx"/cache/tuxtavern/pmjs/*/tuxtavern.js | while read -r f; do grep -l mvuser "$f"; done | head -n 1)
	# Sigillum 0.3: PMJS lets the game read only www/, so the scripts beside Game.exe could not be
	# opened (ENOENT). Their text is in the adapter: it runs with them gone and without require.
	mv "$fx/mvuser/a.tuxtavern.js" "$fx/mvuser/B.TuxTavern.js" "$fx/"
	out=$(node -e '
const vm = require("vm"), hooks = {}, logged = [];
const ctx = vm.createContext({ console: { log: t => logged.push(t) }, PMJS: { phases: { on: (p, id, f) => { hooks[id] = [p, f]; } } } });
vm.runInContext(require("fs").readFileSync(process.argv[1], "utf8"), ctx);
const [phase, run] = hooks["tuxtavern.user"]; run();
console.log(phase, vm.runInContext("typeof tuxUser === \"string\" ? tuxUser : \"none\"", ctx), logged.join(" | "));' "$adapter" 2>&1)
	check 'they run once the game plugins have loaded, in the global scope as plugin scripts do' 'afterGuestPlugins ab '
	check 'one that fails is logged, and the others still run' 'B.TuxTavern.js failed: Error: broken fix'
	mv "$fx/a.tuxtavern.js" "$fx/B.TuxTavern.js" "$fx/mvuser/"
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" sh ./tt -C "$fx/mz" 2>&1)
	case $out in *tuxtavern.user*) fail=$((fail + 1)); echo "FAIL user scripts are added without any *.tuxtavern.js" ;; *) pass=$((pass + 1)); echo "  ok without them there is nothing to run" ;; esac
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" HOME="$fx/home" TUXTAVERN_SCREENSHOTS=1 sh ./tt "$fx/mv" 2>&1)
	check 'TUXTAVERN_SCREENSHOTS=1 adds F12 screenshots to ~/Pictures, named after the game' "shots.install(globalThis, \"$fx/home/Pictures\", \"mv\")"
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" TUXTAVERN_SCREENSHOTS="$fx/shots" sh ./tt -C "$fx/mv" 2>&1)
	check 'or to the folder it names, also without the cheat menu' "shots.install(globalThis, \"$fx/shots\", \"mv\")"
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" TUXTAVERN_KEYS='wasd,e=ok' sh ./tt -C "$fx/mv" 2>&1)
	check 'TUXTAVERN_KEYS adds its key mappings to the game' 'keys.install(globalThis, "wasd,e=ok")'
	case $out in *tuxtavern.keys*) ;; *) fail=$((fail + 1)); echo "FAIL the key mappings are not installed once the plugins have loaded" ;; esac
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" sh ./tt "$fx/mv" 2>&1)
	case $out in *tuxtavern.screenshots*) fail=$((fail + 1)); echo "FAIL screenshots are on without TUXTAVERN_SCREENSHOTS" ;; *) pass=$((pass + 1)); echo "  ok screenshots are off unless asked for" ;; esac
	case $out in *tuxtavern.keys*) fail=$((fail + 1)); echo "FAIL keys are remapped without TUXTAVERN_KEYS" ;; *) pass=$((pass + 1)); echo "  ok keys stay as the game has them unless asked" ;; esac
	out=$(PATH="$fx/bin:$PATH" sh ./tt -i "$fx/mz" 2>&1); check '--info names pmjs, and its version' "runtime: $fx/bin/pmjs (pmjs --version"
	mkdir -p "$fx/mvinfo/www/js/libs" "$fx/mzinfo/js/libs" && : >"$fx/mvinfo/www/js/rpg_core.js" && : >"$fx/mzinfo/js/rmmz_core.js"
	printf '/*!\n * pixi.js - v4.5.4\n */\n' >"$fx/mvinfo/www/js/libs/pixi.js"
	printf 'var $plugins =\n[\n{"name":"A","status":true,"parameters":{}},\n{"name":"B","status": false,"parameters":{}},\n{"name":"C","status":true,"parameters":{}}\n];\n' >"$fx/mvinfo/www/js/plugins.js"
	printf 'var PIXI = {};\nPIXI.VERSION = "5.3.12";\n' >"$fx/mzinfo/js/libs/pixi.js"
	out=$(PATH="$fx/bin:$PATH" sh ./tt -i "$fx/mvinfo" 2>&1)
	check "--info shows the game's Pixi version" 'pixi:    4.5.4'; check 'and how many plugins are on' 'plugins: 2 of 3 on'
	out=$(PATH="$fx/bin:$PATH" sh ./tt -i "$fx/mzinfo" 2>&1); check 'also from a Pixi without the header' 'pixi:    5.3.12'
	out=$(PATH="$fx/bin:$PATH" WAYLAND_DISPLAY='' sh ./tt "$fx/packed" 2>&1); check 'without a Wayland session nothing runs' 'Wayland only'

	: >"$fx/packed/fix.tuxtavern.js"
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" XDG_CACHE_HOME="$fx/cache" sh ./tt "$fx/packed" 2>&1)
	check 'an Enigma-packed game is unpacked and run on PMJS' "pmjs run --game $fx/data/tuxtavern/unpacked/"
	check "and a *.tuxtavern.js beside the packed exe is used" "{ file: \"$fx/packed/fix.tuxtavern.js\""
	out=$(cd "$fx/data" && find . -type f | sort); check 'its files are unpacked' 'www/js/rpg_core.js'
	mkdir -p "$fx/nwexe"
	node -e "const { zip } = require('./test/launcher/evb-test.js'); require('fs').writeFileSync(process.argv[1], Buffer.concat([Buffer.from('MZ'),
  Buffer.alloc(5000), zip([{ name: 'package.json', data: '{}' }, { name: 'js/rmmz_core.js', data: '' }])]))" "$fx/nwexe/Game.exe"
	out=$(PATH="$fx/bin:$PATH" sh ./tt -i "$fx/nwexe" 2>&1); check 'a game zipped onto the NW.js Game.exe is detected' 'Game.exe (NW.js package)'
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" XDG_CACHE_HOME="$fx/cache" sh ./tt "$fx/nwexe" 2>&1)
	check 'and unpacked and run as an MZ game' "pmjs run --game $fx/data/tuxtavern/unpacked/"
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" XDG_CACHE_HOME="$fx/cache" sh ./tt -C "$fx/packed" 2>&1)
	case $out in *tuxtavern.cheats*) fail=$((fail + 1)); echo "FAIL --no-cheat did not reach the unpacked game" ;; *) pass=$((pass + 1)); echo "  ok --no-cheat reaches a packed game after unpacking" ;; esac
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" sh ./tt "$fx/nwdir" 2>&1); check 'a package.nw folder runs without unpacking' "pmjs run --game $fx/nwdir/Package.nw "

	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh "$tt" "$fx/xp" 2>&1); check 'XP runs as RGSS1' 'rgss=1'; check 'mkxp-z is told to use Wayland' 'driver=wayland'
	check 'mkxp-z starts from the config TuxTavern wrote' "pwd=$fx/data/tuxtavern/mkxp/"
	check 'and reads it there (LonaRPG ran without the shims)' "srcdir=$fx/data/tuxtavern/mkxp/"
	check 'which points at the game' "\"gameFolder\": \"$fx/xp\""
	check 'loads the shims' 'rgss/all.rb"]'; check 'turns F12 reset off' '"enableReset": false'
	check 'adds the installed RTP the game names' "\"RTP\": [\"$fx/data/tuxtavern/rtp/Standard\"]"
	check 'the cheat menu is on by default' 'cheat=1'
	echo 'dev 1a2b3c4 2026-10-31' >"$fx/ti/lib/mkxp-z/VERSION"
	out=$(PATH="$fx/bin:$PATH" sh "$tt" -i "$fx/xp" 2>&1)
	check '--info shows which mkxp-z tools/mkxp-z.sh built' "runtime: $fx/ti/lib/mkxp-z/mkxp-z.x86_64 (dev 1a2b3c4 2026-10-31)"
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh "$tt" "$fx/xp" 2>&1)
	check "mkxp-z's Ruby library is passed along" "\"rubyLoadpath\": [\"$fx/ti/lib/mkxp-z/stdlib\"]"
	mv "$fx/ti/lib/mkxp-z/stdlib" "$fx/ti/stdlib-aside" && printf '/usr/lib/ruby/3.4.0\n/usr/lib/ruby/3.4.0/x86_64-linux\n' >"$fx/ti/lib/mkxp-z/loadpath"
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh "$tt" "$fx/xp" 2>&1)
	check "or, built with the system's Ruby, its library folders" '"rubyLoadpath": ["/usr/lib/ruby/3.4.0", "/usr/lib/ruby/3.4.0/x86_64-linux"]'
	rm "$fx/ti/lib/mkxp-z/loadpath" && mv "$fx/ti/stdlib-aside" "$fx/ti/lib/mkxp-z/stdlib"
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" TUXTAVERN_YJIT=1 sh "$tt" "$fx/xp" 2>&1); check 'TUXTAVERN_YJIT=1 turns on Ruby JIT' '"YJITEnable": true'
	mkdir -p "$fx/xpenv/Data"; : >"$fx/xpenv/Data/Scripts.rxdata"; echo 'TUXTAVERN_YJIT=1' >"$fx/xpenv/tuxtavern.env"
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh "$tt" "$fx/xpenv" 2>&1); check 'and so does tuxtavern.env, for XP/VX/VX Ace' '"YJITEnable": true'
	out=$(ls "$fx/xp"); check 'the game folder is left untouched' 'Data'; case $out in *mkxp.json*) fail=$((fail + 1)); echo "FAIL TuxTavern wrote into the game folder" ;; esac
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh "$tt" "$fx/vx" 2>&1); check 'VX Ace runs as RGSS3' 'rgss=3'
	check "which keeps the game's settings" '"windowTitle": "VX"'; check 'and adds the shims' 'rgss/all.rb"]'
	check 'comments before the object are left alone' '// settings {'
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh "$tt" "$fx/pre" 2>&1); check "a game's own preloadScript is respected and said so" 'sets its own preloadScript'
	check 'its config is still written' '"preloadScript": ["mine.rb"]'
	check "and TuxTavern's shims load instead" 'rgss/all.rb"]'
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh "$tt" "$fx/xpa" 2>&1); check 'an XP archive-only game runs as RGSS1' 'rgss=1'
	check 'a missing RTP is pointed out' "extract it to $fx/data/tuxtavern/rtp/RPGVX"
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh "$tt" "$fx/vxa" 2>&1); check 'a VX archive-only game runs as RGSS2' 'rgss=2'
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh "$tt" -C "$fx/vxa" 2>&1); check '--no-cheat reaches XP/VX/VX Ace games' 'cheat= '
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh "$tt" -T "$fx/vxa" 2>&1); check '-T starts mkxp-z in playtest mode' 'args=test'

	mkdir -p "$fx/mz/save"
	node -e "process.stdout.write(require('zlib').deflateSync('{\"party\":{\"_gold\":100}}').toString('latin1'))" >"$fx/mz/save/file1.rmmzsave"
	out=$(EDITOR=true sh ./tt --edit-save "$fx/mz/save/file1.rmmzsave" 2>&1); check '--edit-save writes nothing when nothing changed' 'Unchanged'
	out=$(EDITOR="sed -i s/100/250/" sh ./tt -e "$fx/mz/save/file1.rmmzsave" 2>&1); check '-e (--edit-save) writes an edit back' 'Wrote'
	out=$(node lib/savejson.js decode "$fx/mz/save/file1.rmmzsave" /dev/stdout); check 'and the save holds it' '"_gold": 250'
	out=$(ls "$fx/mz/save"); check 'next to a backup of the original' 'file1.rmmzsave.bak'
	out=$(EDITOR="sed -i s/250/oops,/" sh ./tt --edit-save "$fx/mz/save/file1.rmmzsave" 2>&1); check 'a broken edit is not written' 'your edit is kept in'
	for f in lib/*.js; do
		if node --check "$f" 2>/dev/null; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "FAIL $f does not parse"; fi
	done
else
	echo "  (node not installed; skipped)"
fi

if command -v ruby >/dev/null 2>&1; then
	echo "== rgss"
	out=$(TUXTAVERN_RGSS_VERSION=1 ruby -e 'load "lib/rgss/ruby18.rb"
class Hero; attr_reader :type; def initialize; @type = :mage; end; def act; end; end
puts 1.type, Hero.new.type, Hero.instance_methods.include?("act"), Hero.new.methods.include?("act"), [1, nil].nitems, { a: 9 }.index(9)' 2>&1)
	check 'Ruby 1.8: obj.type is its class' 'Integer'; check "a game's own type wins" 'mage'
	check 'method lists accept strings' 'true'; check 'Array#nitems and Hash#index are back' "1
a"
	out=$(TUXTAVERN_RGSS_VERSION=3 ruby -e 'load "lib/rgss/ruby18.rb"; puts 1.respond_to?(:type)' 2>&1)
	check 'VX Ace is left on modern Ruby' 'false'
	out=$(TUXTAVERN_RGSS_VERSION=1 ruby -e 'load "lib/rgss/ruby18.rb"
o = Object.new
puts [o.id == o.object_id, nil.id, true.id].join(","), [TRUE, FALSE, NIL].inspect' 2>&1)
	check 'Ruby 1.8: obj.id, and nil and true keep their ids' 'true,4,2'
	check 'TRUE, FALSE and NIL are back' '[true, false, nil]'
	out=$(TUXTAVERN_RGSS_VERSION=3 ruby -e 'load "lib/rgss/ruby18.rb"; puts [TRUE, 1.respond_to?(:id)].join(",")' 2>&1)
	check 'VX Ace gets TRUE (Ruby 1.9 had it), but not Ruby 1.8 obj.id' 'true,false'
	out=$(TUXTAVERN_SHIM_DIR="$PWD/lib/rgss" TUXTAVERN_RGSS_VERSION=1 TUXTAVERN_RGSS_SKIP=casefold,cheats,lenient,patches,raw_bitmap,input_poll,ini_wrap,user32_wrap,dl_wrap,textmode ruby -e 'load "lib/rgss/all.rb"' 2>&1)
	case $out in *'did not load'*) ;; *'--- exit ---'*) out='loaded; exit reported' ;; esac
	check 'XP has no msgbox: msgbox_echo.rb loads, and still reports the exit' 'loaded; exit reported'
	out=$(ruby -e 'module Kernel; def msgbox(*a) = puts("box #{a.join}"); end; load "lib/rgss/msgbox_echo.rb"; msgbox "hi"' 2>&1 | tr "\n" " ")
	check 'VX and VX Ace: msgbox is echoed, then shown' '--- msgbox --- hi -------------- box hi'
	mkdir -p "$fx/preload" && printf 'module MKXP; def self.marker; "mkxp_wrap"; end; end\n' >"$fx/preload/mkxp_wrap.rb" && : >"$fx/preload/win32_wrap.rb"
	out=$(TUXTAVERN_MKXPZ_PRELOAD="$fx/preload" TUXTAVERN_SHIM_DIR="$PWD/lib/rgss" TUXTAVERN_RGSS_SKIP=casefold,cheats,lenient,patches,raw_bitmap,input_poll,ini_wrap,user32_wrap,dl_wrap,textmode,msgbox_echo ruby -e 'load "lib/rgss/all.rb"; puts MKXP.marker' 2>&1)
	check "mkxp-z's mkxp_wrap.rb is loaded, for mkxp's old MKXP names" 'mkxp_wrap'
	out=$(TUXTAVERN_SHIM_DIR="$PWD/lib/rgss" TUXTAVERN_RGSS_SKIP=casefold,cheats,lenient,patches,raw_bitmap,input_poll,ini_wrap,user32_wrap,dl_wrap,textmode,msgbox_echo ruby -e 'load "lib/rgss/all.rb"; puts [1.is_a?(Fixnum), File.exists?("tt")].join(",")' 2>&1)
	check "ruby32.rb gives a newer Ruby back what games' scripts call (Fixnum, File.exists?)" 'true,true'
	mkdir -p "$fx/cwdpre/scripts/preload" && cp "$fx/preload/"*.rb "$fx/cwdpre/scripts/preload/"
	out=$(cd "$fx/cwdpre" && TUXTAVERN_SHIM_DIR="$OLDPWD/lib/rgss" TUXTAVERN_RGSS_SKIP=casefold,cheats,lenient,patches,raw_bitmap,input_poll,ini_wrap,user32_wrap,dl_wrap,textmode,msgbox_echo ruby -e "load '$OLDPWD/lib/rgss/all.rb'; puts defined?(MKXP) ? 'found' : 'none'" 2>&1)
	check 'without TUXTAVERN_MKXPZ_PRELOAD the shims guess no folder, and say how to fix it' 'install mkxp-z again (sh tools/install.sh -m)'
	for t in test/launcher/*-test.rb; do
		out=$(ruby "$t" 2>&1) || true
		pass=$((pass + $(printf '%s\n' "$out" | grep -c '^ok '))); fail=$((fail + $(printf '%s\n' "$out" | grep -vc '^ok ')))
		printf '%s\n' "$out" | sed 's/^ok /  ok /'
	done
	out=$(TUXTAVERN_RGSS_VERSION=3 ruby -e 'load "lib/rgss/ruby18.rb"; puts({ a: 9 }.index(9))' 2>&1)
	check 'VX Ace gets Hash#index back, as Ruby 1.9 had it' 'a'
	if command -v node >/dev/null 2>&1; then
		mkdir -p "$fx/ace" && ruby test/launcher/rgss-save.rb make "$fx/ace"
		out=$(EDITOR="sed -i -e s/1234567/7654321/ -e s/ラルフ/Ralf/" sh ./tt -e "$fx/ace/Save01.rvdata2" 2>&1); check '--edit-save edits a VX Ace save' 'Wrote'
		out=$(ruby test/launcher/rgss-save.rb read "$fx/ace/Save01.rvdata2" 2>&1)
		check 'which Ruby reads back, edited, with shared objects still shared' 'gold=7654321 hp=450 name=Ralf shared=true'
		out=$(EDITOR=true sh ./tt -e "$fx/ace/Save1.rxdata" 2>&1); check 'and an XP save, unchanged' 'Unchanged'
	fi
	mkdir -p "$fx/rgss"
	# shellcheck disable=SC2016
	printf '$order << "B"\n' >"$fx/rgss/B.tuxtavern.rb"
	# shellcheck disable=SC2016
	printf '$order << "a"\n' >"$fx/rgss/a.tuxtavern.rb"
	# shellcheck disable=SC2016
	# mkxp-z runs the shims in the game folder.
	out=$(cd "$fx/rgss" && PATCHES="$OLDPWD/lib/rgss/patches.rb" ruby -Ku -e '$RGSS_SCRIPTS = [
  [1, "Fonts", "", "# ** Auto Font Install\nraise \"font\"\n"],
  [2, "Steam", "", "x = 1\nexit if steam.is_subscribed != true\nputs \"steam ok\"\n"],
  [3, "Text", "", "t = nil.to_s.clone\nt << \"k\"\nputs \"text \" + t\n"],
  [4, "KGC", "", "# ビットマップ拡張 - KGC_BitmapExtension ◆ XP/VX\nraise \"kgc\"\n"],
  [5, "Broken", "", "# \xff\nx.to_s.clone\n".dup.force_encoding("UTF-8")],
  [6, "Main", "", "$order << \"main\"\n"],
]
$order = []
load ENV["PATCHES"]
puts "broken kept" if $RGSS_SCRIPTS[4][3].end_with?("x.to_s.clone\n")
$RGSS_SCRIPTS.each { |s| eval(s[3], binding, s[1]) unless s[1] == "Broken" }
puts "order: " + $order.join(",")' 2>&1)
	check 'Auto Font Install is removed' 'Fonts: Auto Font Install removed'
	check 'the Steam check is cut and the rest runs' 'steam ok'
	check 'frozen text is copied unfrozen' 'text k'
	check 'a Japanese-marked Windows-only plugin is removed' 'KGC: KGC_BitmapExtension removed'
	check 'user scripts (*.tuxtavern.rb) run in name order before Main' 'order: B,a,main'
	check 'and each is announced' 'B.tuxtavern.rb runs before Main'
	check 'a script with invalid UTF-8 is left alone' 'broken kept'
	# shellcheck disable=SC2016
	mkdir -p "$fx/skip"
	out=$(cd "$fx/skip" && TUXTAVERN_SKIP='mouse, Steam API' TUXTAVERN_DUMP_SCRIPTS="$fx/dump" PATCHES="$OLDPWD/lib/rgss/patches.rb" ruby -e '$RGSS_SCRIPTS = [
  [1, "Fonts", "", "# ** Auto Font Install\nraise \"font\"\n"],
  [2, " Mouse ", "", "raise \"mouse\"\n"],
  [3, "Steam API", "", "raise \"steam\"\n"],
  [4, "Battle/Core", "", "$ran = true\n"],
]
load ENV["PATCHES"]
$RGSS_SCRIPTS.each { |s| eval(s[3], binding, s[1]) }
puts "ran" if $ran' 2>&1)
	check 'TUXTAVERN_SKIP leaves out XP/VX/VX Ace scripts by name' 'TUXTAVERN_SKIP leaves out  Mouse'
	check 'any case, and the rest runs' 'ran'
	out=$(cat "$fx/dump/before/001 Mouse.rb" 2>&1; ls "$fx/dump/after")
	check 'TUXTAVERN_DUMP_SCRIPTS keeps the scripts as written' 'raise "mouse"'
	check 'and as they run, one file each, / made _' 'Battle_Core.rb'
	case $(cat "$fx/dump/after/000 Fonts.rb" 2>/dev/null || echo missing) in *font* | missing) fail=$((fail + 1)); echo "FAIL the dumped scripts after patching are not the patched ones" ;; *) pass=$((pass + 1)); echo "  ok the scripts after patching are the patched ones" ;; esac
	# shellcheck disable=SC2016
	out=$(ruby -e '$RGSS_SCRIPTS = [[1, "Input", "", "module Input; def self.update; $u = \"updated\"; end; def self.raw_key_states; $u.to_s + \" keys\"; end; end\n"],
  [2, "Essentials", "", "module Input; end\ndef pbSameThread(w); end\nputs Input.raw_key_states\n"]]
load "lib/rgss/patches.rb"
$RGSS_SCRIPTS.each { |s| eval(s[3], binding, s[1]) }
puts "lines: #{$RGSS_SCRIPTS[1][3].lines.size}"' 2>&1)
	check 'Pokemon Essentials refreshes input before raw_key_states' 'updated keys'
	check 'without moving its line numbers' 'lines: 3'
fi

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
