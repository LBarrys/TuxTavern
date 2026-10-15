# Using PMJS

`tuxtavern GAME` runs MV/MZ games on PMJS; this page is for running `pmjs` directly.
Directly, after [building and installing](building.md):

## Run a game

Use a game directory containing its original MV/MZ engine and plugin scripts:

```sh
pmjs --version
pmjs self-test
pmjs prepare --game /path/to/game
pmjs run --game /path/to/game
```

Preparation creates a bootstrap in your cache and leaves the game files unchanged.
Prepare again after changing game scripts, plugins, configuration or the runtime.
Running uses the prepared bootstrap.

Only run games you trust. Game and plugin scripts have access to Node APIs. PMJS does not sandbox them.

## Configuration and saves

- `prepare --config FILE`: load runtime configuration.
- `prepare --manifest FILE`: select plugin adapters through a manifest.
- `--state DIR`: choose the preparation directory. Use it for both `prepare` and `run`.
- `run --save-root DIR`: choose a save directory, including an existing one.

Prepared files default to `XDG_CACHE_HOME`; saves default to `XDG_DATA_HOME`,
with a separate directory for each game. If unset, these use `~/.cache` and
`~/.local/share`. Back up existing saves before testing PMJS.

## System requirements

Node with Node-API 8 or newer, SDL2, EGL and GLES 3.0 or newer, and the libraries
PMJS was built with. The compatibility references are MV 1.6.2/Pixi 4.5.4 and
MZ 1.10.0/Pixi 5.3.12; MV on Pixi 7.4.2 (pixi-rpgm, as in Karryn's Prison) is newer.
Game and plugin support is still experimental.

## Troubleshooting

`self-test` checks package files and addon loading. `self-test --graphics` also
checks startup, rendering and shutdown.

For additional logging:

- `PMJS_GRAPHICS_DIAGNOSTICS=1`: graphics diagnostics.
- `PMJS_REQUIRE_HARDWARE_GL=1`: reject software rendering.
- `PMJS_COMPAT_VERBOSE=1`: log unsupported operations.
- `PMJS_STRICT_COMPAT=1`: stop at the first unsupported operation.

When reporting a problem, include `--version`, the log, self-test output, and the
game's engine and plugin versions.
