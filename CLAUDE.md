# pmjs-rpgm

A fork of PMJS (github.com/bbbreaddd/pmjs) that rpgm (github.com/LBarrys/rpgm) runs MV/MZ games on.

## Goals

- Run the games rpgm users have, on Alpine Linux (musl) and Wayland, as NW.js would.
- Small changes over rewrites; stay close to upstream so its changes still merge.
- Build with what distributions ship: no pinned compilers, no network at build time beyond sources.
- Behaviour that departs from NW.js, or is costly, is opt-in through a `PMJS_*` variable.

## Workflow

- Commit and push straight to `main`.
- When asked to analyse or research, give findings first; edit only when asked.
- Report what was and wasn't tested; say plainly when something couldn't be checked on a real game.
- Respect licences: PMJS is MIT; keep notices and third-party terms.

## Code

- Match the surrounding style; comments only where the why isn't obvious.
- Every change gets a test that fails without it: `npm test` and `npx eslint js runner tools test example`
  for JavaScript, `ctest` (needs Xvfb) for native code. Both must pass.
- A fix for one game names the plugin or game in its comment or test, so it can be traced.

## README rules

- The section at the top lists how this fork differs from upstream, one line each.
