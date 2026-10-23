# TuxTavern

Runs Windows RPG Maker XP/VX/VX Ace/MV/MZ games natively on Alpine Linux (musl). One project: the
`tuxtavern` launcher, PMJS (MV/MZ, from github.com/bbbreaddd/pmjs) and, for now, mkxp-z (XP/VX/VX Ace).

## Goals

- Small, minimal, simple. Prefer the smallest change that works; don't add dependencies or layers.
- Wayland only at run time. No X11 code paths. No Wine, no Electron or NW.js, ever.
- Run games as NW.js (MV/MZ) or RPG Maker (XP/VX/VX Ace) would.
- Build with what Alpine ships: no pinned compilers, no network at build time beyond sources.
- Behaviour that departs from the original, or is costly, is opt-in (a flag or variable), off by default.

## Workflow

- Commit and push straight to `main`. No branches or pull requests.
- When asked to analyse or research, give findings first; edit only when asked.
- Report what was and wasn't tested; say plainly when something couldn't be checked on a real game.
- Upstream changes (bbbreaddd/pmjs, mkxp-z): understand the core of each change, then implement it only
  if TuxTavern needs it, and say why either way. Never merge wholesale.
- Respect licences: GPL-3.0 as a whole; PMJS files keep MIT, `lib/rgss/` is CC0; update `REUSE.toml`.

## Code

- Match the surrounding style; comments only where the why isn't obvious.
- Every change gets a test that fails without it. All must pass:
  - `sh test/launcher/run.sh` and `busybox sh test/launcher/run.sh` (launcher, `lib/`)
  - `npm test`, `npx eslint js runner tools test`, `ctest` (needs Xvfb)
- `tuxtavern`, `build-mkxp-z.sh`, `tools/pmjs.sh` and `tools/apk.sh` are POSIX sh: `shellcheck` clean, run under GNU sh and BusyBox sh.
- MV/MZ: behave like NW.js (e.g. `require`/`process` in the page, no `module`/`exports`).
- RGSS shims loaded before the game's scripts hook with `alias_method`, never `prepend`
  (a game's later `alias` would recurse forever). `prepend` only after game scripts load.
- Options get a short and long form. Cheat state that should survive is kept in the save, on the player
  (`_rpgmCheats`, `@rpgm_cheats`: names kept from rpgm so old saves keep it).
- A fix for one game names the plugin or game in its comment or test, so it can be traced.

## README rules

- Fewest words possible. Lists and tables over paragraphs.
- Only what a user needs to install, run, or fix a game. No internals.
- A new feature gets one line at most.
