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
run() { out=$(sh ./tuxtavern "$@" 2>&1); }

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

echo "== tuxtavern"
run --version; check 'reports its version' 'tuxtavern 0.'
run --info "$fx/mv"; check 'MV is detected' 'engine:  mv'; check 'MV version is read' 'version: 1.6.1'
run --info "$fx/mv/Game.exe"; check 'a Game.exe path means its folder' 'engine:  mv'
run --info "$fx/mz"; check 'MZ is detected' 'engine:  mz'; check 'MZ version is read' 'version: 1.8.0'
run --info "$fx/zip"; check 'package.nw is detected' 'engine:  nwjs-zip'
run --info "$fx/xp"; check 'XP is detected' 'engine:  rgss'; check 'TuxTavern writes the config' 'config:  written by tuxtavern'
check 'the RTP the game names is reported' 'rtp:     Standard, not installed'
run --info "$fx/vx"; check 'detection ignores letter case' 'engine:  rgss'; check "a game's own mkxp.json is found" "merged with the game's mkxp.json"
run --info "$fx/vxa"; check 'an archive-only game is detected' 'engine:  rgss'
run --info "$fx/nwdir"; check 'a package.nw folder is the game' "game:    $fx/nwdir/Package.nw"; check 'and what is in it is detected' 'engine:  mz'
run --info "$fx/nwdir/Secretary.exe"; check 'also when started from the exe next to it' 'engine:  mz'
run --info "$fx/none"; check 'an empty folder is not a game' 'engine:  not recognized'
run --info "$fx/evb"; check 'an Enigma-packed exe is detected' 'engine:  evb'; check 'and named' 'GAME.EXE (Enigma'
run --info "$fx/exe"; check 'a plain exe is not taken for Enigma' 'engine:  not recognized'
run --info "$fx/2k"; check 'RPG Maker 2000/2003 is not supported' 'engine:  not recognized'
run --info "$fx/eapp"; check 'nor are Electron apps' 'engine:  not recognized'
run --info "$fx/html"; check 'nor NW.js apps that are not MV/MZ' 'engine:  not recognized'
run "$fx/none"; check 'running a non-game fails' 'no RPG Maker XP/VX/VX Ace/MV/MZ game found'
run --bogus; check 'unknown options are refused' 'unknown option'
run --wasd "$fx/mv"; check 'the Electron-only --wasd is gone' 'unknown option'

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
	printf '#!/bin/sh\necho "pmjs $* driver=${SDL_VIDEODRIVER:-}"\nfor a; do case $a in *.js) cat "$a" ;; esac; done\n' >"$fx/bin/pmjs" && chmod +x "$fx/bin/pmjs"
	# shellcheck disable=SC2016
	printf '#!/bin/sh\necho "mkxp-z rgss=$TUXTAVERN_RGSS_VERSION driver=$SDL_VIDEODRIVER cheat=$TUXTAVERN_CHEAT translate=$TUXTAVERN_TRANSLATE pwd=$PWD args=$*"; cat mkxp.json\n' >"$fx/bin/mkxp-z" && chmod +x "$fx/bin/mkxp-z"
	mkdir -p "$fx/lib/mkxp-z/scripts/preload" "$fx/lib/mkxp-z/stdlib" "$fx/data/tuxtavern/rtp/Standard"
	: >"$fx/lib/mkxp-z/scripts/preload/win32_wrap.rb"

	out=$(PATH="/usr/bin:/bin" sh ./tuxtavern "$fx/mv" 2>&1); check 'without pmjs it says how to get it' 'MV/MZ games need pmjs'
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" sh ./tuxtavern "$fx/mv" 2>&1)
	check 'an MV game is prepared from its www folder' "pmjs prepare --game $fx/mv/www --config"
	check 'then run on Wayland, saving where NW.js does' "pmjs run --game $fx/mv/www --save-root $fx/mv/www/save driver=wayland"
	check 'with its asset cache kept out of the game' "--config $fx/cache/tuxtavern/pmjs/"
	check 'the F8 cheat menu is loaded as a PMJS adapter' '/tuxtavern.js driver='
	check 'and installs itself once the game plugins have loaded' "PMJS.phases.on('afterGuestPlugins', 'tuxtavern.cheats'"
	out=$(cat "$fx"/cache/tuxtavern/pmjs/*/config.json); check 'the asset cache is in the cache folder' "\"cacheRoot\": \"$fx/cache/tuxtavern/pmjs/"
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" sh ./tuxtavern -C "$fx/mv" 2>&1)
	case $out in *--adapter*) fail=$((fail + 1)); echo "FAIL -C still loaded the cheat menu" ;; *) pass=$((pass + 1)); echo "  ok -C (--no-cheat) leaves the cheat menu out" ;; esac
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" TUXTAVERN_SKIP='MOD/DRGN_TranslationUI,Other' sh ./tuxtavern -C "$fx/mv" 2>&1)
	check 'TUXTAVERN_SKIP is passed as the adapter, even without the cheat menu' '/tuxtavern.js driver='
	check 'which leaves those plugins out before any loads' 'var skip = ["MOD/DRGN_TranslationUI", "Other"];'
	check 'saying so' 'tuxtavern: TUXTAVERN_SKIP leaves out'
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" sh ./tuxtavern "$fx/mz" 2>&1); check 'an MZ game runs from its own folder' "pmjs run --game $fx/mz --save-root $fx/mz/save driver=wayland"
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" sh ./tuxtavern -T "$fx/mz" 2>&1); check '-T says it is XP/VX/VX Ace only' '-T works for XP/VX/VX Ace games only'
	out=$(PATH="$fx/bin:$PATH" sh ./tuxtavern -i "$fx/mz" 2>&1); check '--info names pmjs' "runtime: $fx/bin/pmjs"
	out=$(PATH="$fx/bin:$PATH" WAYLAND_DISPLAY='' sh ./tuxtavern "$fx/packed" 2>&1); check 'without a Wayland session nothing runs' 'Wayland only'

	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" XDG_CACHE_HOME="$fx/cache" sh ./tuxtavern "$fx/packed" 2>&1)
	check 'an Enigma-packed game is unpacked and run on PMJS' "pmjs run --game $fx/data/tuxtavern/unpacked/"
	out=$(cd "$fx/data" && find . -type f | sort); check 'its files are unpacked' 'www/js/rpg_core.js'
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" XDG_CACHE_HOME="$fx/cache" sh ./tuxtavern -C "$fx/packed" 2>&1)
	case $out in *--adapter*) fail=$((fail + 1)); echo "FAIL --no-cheat did not reach the unpacked game" ;; *) pass=$((pass + 1)); echo "  ok --no-cheat reaches a packed game after unpacking" ;; esac
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" sh ./tuxtavern "$fx/nwdir" 2>&1); check 'a package.nw folder runs without unpacking' "pmjs run --game $fx/nwdir/Package.nw "

	mkdir -p "$fx/my words"
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./tuxtavern --translate "$fx/my words/ja en.json" "$fx/xp" 2>&1)
	check '--translate reaches XP/VX/VX Ace games, spaces and all' "translate=$fx/my words/ja en.json"
	out=$(cat "$fx/my words/ja en.json"); check 'and creates the dictionary' '{}'
	out=$(cd "$fx/my words" && PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh "$OLDPWD/tuxtavern" -t rel.json "$fx/xp" 2>&1)
	check 'a relative dictionary path is made absolute (-t)' "translate=$fx/my words/rel.json"
	out=$(PATH="$fx/bin:$PATH" XDG_CACHE_HOME="$fx/cache" sh ./tuxtavern -t "$fx/my words/mv.json" "$fx/mv" 2>&1); check '--translate says MV/MZ is not done yet' 'XP/VX/VX Ace games only, for now'
	out=$(PATH="$fx/bin:$PATH" sh ./tuxtavern --translate 2>&1); check '--translate needs a file' 'needs a file'
	out=$(PATH="$fx/bin:$PATH" sh ./tuxtavern -t "$fx/mv" 2>&1); check 'a game folder given to -t gets a hint' 'playtest is -T'
	out=$(PATH="$fx/bin:$PATH" sh ./tuxtavern --translate "$fx/nodir/x.json" "$fx/mv" 2>&1); check 'a missing folder is refused' 'no such folder'

	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./tuxtavern "$fx/xp" 2>&1); check 'XP runs as RGSS1' 'rgss=1'; check 'mkxp-z is told to use Wayland' 'driver=wayland'
	check 'mkxp-z starts from the config TuxTavern wrote' "pwd=$fx/data/tuxtavern/mkxp/"
	check 'which points at the game' "\"gameFolder\": \"$fx/xp\""
	check 'loads the shims' 'rgss/all.rb"]'; check 'turns F12 reset off' '"enableReset": false'
	check 'adds the installed RTP the game names' "\"RTP\": [\"$fx/data/tuxtavern/rtp/Standard\"]"
	check 'the cheat menu is on by default' 'cheat=1'
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" TUXTAVERN_MKXPZ_PRELOAD="$fx/lib/mkxp-z/scripts/preload" sh ./tuxtavern "$fx/xp" 2>&1)
	check "mkxp-z's Ruby library is passed along" "\"rubyLoadpath\": [\"$fx/lib/mkxp-z/stdlib\"]"
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" TUXTAVERN_YJIT=1 sh ./tuxtavern "$fx/xp" 2>&1); check 'TUXTAVERN_YJIT=1 turns on Ruby JIT' '"YJITEnable": true'
	out=$(ls "$fx/xp"); check 'the game folder is left untouched' 'Data'; case $out in *mkxp.json*) fail=$((fail + 1)); echo "FAIL TuxTavern wrote into the game folder" ;; esac
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./tuxtavern "$fx/vx" 2>&1); check 'VX Ace runs as RGSS3' 'rgss=3'
	check "which keeps the game's settings" '"windowTitle": "VX"'; check 'and adds the shims' 'rgss/all.rb"]'
	check 'comments before the object are left alone' '// settings {'
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./tuxtavern "$fx/pre" 2>&1); check "a game's own preloadScript is respected and said so" 'sets its own preloadScript'
	check 'its config is still written' '"preloadScript": ["mine.rb"]'
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./tuxtavern "$fx/xpa" 2>&1); check 'an XP archive-only game runs as RGSS1' 'rgss=1'
	check 'a missing RTP is pointed out' "extract it to $fx/data/tuxtavern/rtp/RPGVX"
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./tuxtavern "$fx/vxa" 2>&1); check 'a VX archive-only game runs as RGSS2' 'rgss=2'
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./tuxtavern -C "$fx/vxa" 2>&1); check '--no-cheat reaches XP/VX/VX Ace games' 'cheat= '
	out=$(PATH="$fx/bin:$PATH" XDG_DATA_HOME="$fx/data" sh ./tuxtavern -T "$fx/vxa" 2>&1); check '-T starts mkxp-z in playtest mode' 'args=test'

	mkdir -p "$fx/mz/save"
	node -e "process.stdout.write(require('zlib').deflateSync('{\"party\":{\"_gold\":100}}').toString('latin1'))" >"$fx/mz/save/file1.rmmzsave"
	out=$(EDITOR=true sh ./tuxtavern --edit-save "$fx/mz/save/file1.rmmzsave" 2>&1); check '--edit-save writes nothing when nothing changed' 'Unchanged'
	out=$(EDITOR="sed -i s/100/250/" sh ./tuxtavern -e "$fx/mz/save/file1.rmmzsave" 2>&1); check '-e (--edit-save) writes an edit back' 'Wrote'
	out=$(node lib/savejson.js decode "$fx/mz/save/file1.rmmzsave" /dev/stdout); check 'and the save holds it' '"_gold": 250'
	out=$(ls "$fx/mz/save"); check 'next to a backup of the original' 'file1.rmmzsave.bak'
	out=$(EDITOR="sed -i s/250/oops,/" sh ./tuxtavern --edit-save "$fx/mz/save/file1.rmmzsave" 2>&1); check 'a broken edit is not written' 'your edit is kept in'
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
	for t in test/launcher/*-test.rb; do
		out=$(ruby "$t" 2>&1) || true
		pass=$((pass + $(printf '%s\n' "$out" | grep -c '^ok '))); fail=$((fail + $(printf '%s\n' "$out" | grep -vc '^ok ')))
		printf '%s\n' "$out" | sed 's/^ok /  ok /'
	done
	out=$(TUXTAVERN_RGSS_VERSION=3 ruby -e 'load "lib/rgss/ruby18.rb"; puts({ a: 9 }.index(9))' 2>&1)
	check 'VX Ace gets Hash#index back, as Ruby 1.9 had it' 'a'
	mkdir -p "$fx/rgss"
	# shellcheck disable=SC2016
	printf '$order << "B"\n' >"$fx/rgss/B.tuxtavern.rb"
	# shellcheck disable=SC2016
	printf '$order << "a"\n' >"$fx/rgss/a.tuxtavern.rb"
	# shellcheck disable=SC2016
	out=$(SRCDIR="$fx/rgss" ruby -Ku -e '$RGSS_SCRIPTS = [
  [1, "Fonts", "", "# ** Auto Font Install\nraise \"font\"\n"],
  [2, "Steam", "", "x = 1\nexit if steam.is_subscribed != true\nputs \"steam ok\"\n"],
  [3, "Text", "", "t = nil.to_s.clone\nt << \"k\"\nputs \"text \" + t\n"],
  [4, "KGC", "", "# ビットマップ拡張 - KGC_BitmapExtension ◆ XP/VX\nraise \"kgc\"\n"],
  [5, "Broken", "", "# \xff\nx.to_s.clone\n".dup.force_encoding("UTF-8")],
  [6, "Main", "", "$order << \"main\"\n"],
]
$order = []
load "lib/rgss/patches.rb"
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
