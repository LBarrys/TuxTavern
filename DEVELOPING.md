# Developing TuxTavern

Run the commands from the repository root. `pmjs/` and `mkxp-z/` are the engines, laid out as upstream;
the root holds the launcher, `lib/`, the install scripts and what both share.

## Build

Any distribution: `sh tools/install.sh` (`-u` for `~/.local`, `-m` with mkxp-z; CMake options after
`--`) builds a release and installs it under `PREFIX/lib/tuxtavern` with a `PREFIX/bin/tt`
wrapper (`bin/tt` and `bin/pmjs` find their files from their own path, so not a symlink; do not
strip them: PMJS checks them against `build-info.json`). Missing build packages stop it with the install
command for apk, apt-get, dnf, zypper or pacman (`--packages MANAGER` prints that list); the tests also
need Xvfb (`xvfb xauth` on Debian). `--destdir DIR` stages the install under `DIR` for a package.

Alpine, as a package rebuilt and upgraded after each `git pull`: `doas sh tools/apk.sh` (installs
`tuxtavern@busylinux`, signed with `/root/keys/local.rsa`, as BusyLinux's `update.sh` does). It installs
`install.sh --packages apk` for the build, and builds with `install.sh --destdir`.

Node.js 18 (Ubuntu 24.04's) is the oldest tested; the suites run on 18 and 22.

## Tests

The `dev` preset builds with tests and turns compiler warnings into errors. Native tests need Xvfb.
Where GitHub archive downloads are blocked (some proxies), give CMake the Effekseer source itself:
clone it at the commit in `pmjs/tools/effekseer.lock.json`, apply `pmjs/third_party/effekseer-mz.patch`, and
configure with `-DFETCHCONTENT_SOURCE_DIR_PMJS_EFFEKSEER=DIR` (or `-DPMJS_EFFEKSEER_ARCHIVE=FILE` for the tarball).

```sh
cmake --preset dev
cmake --build --preset dev --parallel 4
ctest --preset dev --output-on-failure
(cd pmjs && npm ci && npm run lint && npm run licensing && npm test)
node --test test/*.test.cjs
sh test/launcher/run.sh
busybox sh test/launcher/run.sh
dash test/launcher/run.sh
shellcheck tt pmjs/tools/pmjs.sh tools/apk.sh tools/install.sh
```

`mkxp-z/` is mkxp-z's `dev` branch at the commit in `mkxp-z/git-hash`, without `macos/`, `windows/`,
`tests/` and the CJK font; TuxTavern's changes to it are ordinary commits (Wayland only: see
`src/meson.build`). Port upstream commits with `git format-patch -1 HASH --stdout | git apply --3way
--directory=mkxp-z`, and move `git-hash` on when catching up. `tools/install.sh --mkxp-z-stage STAGE` builds it on a copy
(Meson downloads subprojects into its source tree); `install.sh -m` and `apk.sh -m` install that as
`lib/mkxp-z`, where the launcher looks for it. With `--system-ruby` (`-r`) it links the newest Ruby whose
development files are installed and writes that Ruby's library folders to `loadpath` for the launcher;
`lib/rgss/ruby32.rb` puts back what Ruby 3.2 removed (`Fixnum`, `File.exists?`, `Object#=~`, taint).

`pmjs/` is PMJS's tree. Port upstream commits the same way (`--directory=pmjs`), after rewriting them
through `pmjs/tools/upstream-paths.txt`, which lists upstream files that live at another path here.

## Running pmjs directly

`tt GAME` runs MV/MZ games on PMJS. Directly:

```sh
pmjs --version
pmjs self-test            # package files and add-on loading; --graphics also renders
pmjs prepare --game /path/to/game
pmjs run --game /path/to/game
```

Preparation writes a bootstrap to the cache and leaves the game unchanged; prepare again after changing
game scripts, plugins, configuration or the runtime. Game and plugin scripts get Node APIs: PMJS does not
sandbox them.

- `prepare --config FILE`: runtime configuration.
- `prepare --manifest FILE`: select plugin adapters through a manifest.
- `--state DIR`: preparation directory, for both `prepare` and `run`.
- `preserveBitmapReloadPixels` (default `true`): keep the previous image visible while the same image reloads.
- `run --save-root DIR`: save directory, including an existing one.

Prepared files go to `XDG_CACHE_HOME` (`~/.cache`), saves to `XDG_DATA_HOME` (`~/.local/share`), one
directory per game.

Requirements: Node-API 8+, SDL2, EGL and GLES 3.0+. Compatibility references: MV 1.6.2/Pixi 4.5.4,
MZ 1.10.0/Pixi 5.3.12; MV on Pixi 7.4.2 (pixi-rpgm, as in Karryn's Prison) is newer.

## Environment variables

| Variable | Effect |
|---|---|
| `PMJS_RENDER_HZ` | `30`, `60`, `120` or `0` (uncapped). Unset: 60 on screens up to 60 Hz, as fast as it can above |
| `PMJS_UNCAPPED=1` | Draw uncapped |
| `PMJS_SWAP_INTERVAL` | `-1`, `0`, `1` or `auto` (vsync) |
| `PMJS_CATCHUP_MODE` | MV catch-up after a slow frame: `smooth` or `burst` |
| `PMJS_LOGIC_HZ` | Only `60` is accepted: MV logic runs at its authored rate |
| `PMJS_WINDOW_SIZE` | Window size, e.g. `1280x720` |
| `PMJS_PRESENT_SCALE` | `fit` (default) or `integer` |
| `PMJS_PRESENT_FILTER` | `nearest`, `linear` or `sharp` |
| `PMJS_EXIT_HOTKEY` | SDL controller button that quits, or `none` |
| `PMJS_DEFER_IMAGES` | `1` always decode images later, `0` never; unset: only in load bursts |
| `PMJS_PREPARED_FRAME_CACHE_BYTES` | Prepared frame cache size (default 32 MiB) |
| `PMJS_DISABLE_OPT=id,…` | Turn off named optimisations |
| `PMJS_IMAGE_CACHE_IDLE=SECONDS` | MV: drop cached images unused that long (stock MV keeps them until the cache is full) |
| `PMJS_OPT_DIAGNOSTICS=1`, `PMJS_BOOT_DIAGNOSTICS=1` | List optimisation decisions; also boot steps |
| `PMJS_GRAPHICS_DIAGNOSTICS=1`, `PMJS_AUDIO_DIAGNOSTICS=1` | Graphics or audio diagnostics |
| `PMJS_EVENT_DIAGNOSTICS=1` | MV event-stall timing and reports |
| `PMJS_REQUIRE_HARDWARE_GL=1` | Reject software rendering |
| `PMJS_COMPAT_VERBOSE=1`, `PMJS_STRICT_COMPAT=1` | Log unsupported operations; stop at the first one |
| `PMJS_PICTURE_NATIVE_TINT=0` | Tone MV pictures (`Sprite_Picture`) on the Canvas, as NW.js, not in the shader (the default; a picture re-toned every frame ran at 1 frame a second in Sigillum) |
| `PMJS_PALETTE_IMAGES` | `0` draws few-colour images as ordinary textures (more GPU memory, faster on software GL); `1` from palettes. Unset: palettes, but not on software GL |
| `PMJS_TILE_NEAREST_SHADER=0`, `PMJS_FILTER_BOUNDS=0` | Renderer switches, for comparing output |
| `PMJS_DIALOG_MODE`, `PMJS_DIALOG_HEADLESS` | Tests: `strict` or `headless` browser dialogs; headless answers as JSON |
| `PMJS_NODE` | Node binary `pmjs` runs (default `node`) |

## Web compatibility

The web layer supplies the DOM and CSS contracts used by the native engine
integration. It does not include a browser layout or CSS painting engine.

HTML elements, canvases, images, scripts, audio and video inherit from
`HTMLElement`, `Element`, `Node` and `EventTarget`. Text nodes and the document
inherit from `Node`. Tree removal releases focus when the focused control is
inside the detached subtree. Descendant tag searches return matches in tree
order.

Element styles expose `CSSStyleDeclaration` property reads, writes and property
methods. Computed styles resolve inline values, inherited text properties,
named colors and basic defaults. Recognizing a property such as `transform`
does not itself make an arbitrary DOM element a native display object.
Registered font stylesheets expose their real `CSSFontFaceRule` entries through
`document.styleSheets`; inserted font rules also enter the native font registry.
When no requested family matches, registered main game fonts provide the
fallback. System font discovery is not provided.

Canvas linear and radial gradients share the `CanvasGradient` prototype.
Prototype extensions use the same color-stop validation and native paint data
as ordinary gradients.

Focused text controls accept committed SDL Unicode text, selection replacement,
length limits and editing keys. The reviewed input-form integration presents
its text field, submit button and controller character grid as engine windows.
It preserves the form's variable result and forced-close handling, and releases
its interpreter wait and input ownership when it closes. Session storage is
private to the current guest process and is discarded on reload.

Reviewed alternate audio implementations retain authored buffer routing while
using native voice startup. The extended audio integration supports ordinary
playback and linear stereo balance. Convolution, dynamic filtering and custom
loop regions remain explicit unsupported graph operations; they do not silently
fall back to ordinary audio.
