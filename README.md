# TuxTavern

Runs Windows RPG Maker XP/VX/VX Ace/MV/MZ games natively on Alpine Linux (musl). Wayland only.
No Wine, no browser.

| Game | Runs on |
|---|---|
| MV (Pixi 4 or 7), MZ, `package.nw` | PMJS (this repository) |
| XP, VX, VX Ace | mkxp-z |
| Enigma Virtual Box `.exe` | unpacked, then as above |

## Install

```sh
git clone https://github.com/LBarrys/TuxTavern && cd TuxTavern
doas sh tools/apk.sh     # builds and installs the tuxtavern package; again after each git pull
./build-mkxp-z.sh        # XP/VX/VX Ace; removes its build files after
```

## Use

```sh
tuxtavern [GAME_DIR | Game.exe]   # default: current directory
tuxtavern --no-cheat GAME         # turn off the F8 cheat menu (god mode, no clip, speed, teleport, items...)
tuxtavern --test GAME             # XP/VX/VX Ace: playtest
tuxtavern --edit-save SAVE        # MV/MZ: edit a save as JSON in $EDITOR
tuxtavern --info GAME             # show what was detected
```

- **Missing graphics or sounds:** extract the game's [RTP](https://www.rpgmakerweb.com/run-time-package)
  to `~/.local/share/tuxtavern/rtp/` as `Standard`, `RPGVX` or `RPGVXAce`. `--info` names the one needed.
- **MV/MZ uses too much power:** `PMJS_RENDER_HZ=60 tuxtavern GAME` (draws at 60 frames a second, not as fast as it can).
- **A plugin stops an MV/MZ game** (e.g. one that builds HTML): `TUXTAVERN_SKIP=name,...` leaves it out.
- **Your own fixes:** `*.tuxtavern.rb` (XP/VX/VX Ace) in the game folder run before the game's `Main`.
- **A shim breaks a game:** `TUXTAVERN_RGSS_SKIP=name,...` skips files in `lib/rgss/`.
- **Faster XP/VX/VX Ace (experimental, x86-64):** `TUXTAVERN_YJIT=1 tuxtavern GAME`.
- **Garbled Japanese file names:** `apk add icu-data-full`.
- **Boxes instead of symbols in MV/MZ text:** `apk add font-dejavu` (or any font with them).

Saves stay in the game folder; everything else is in `~/.local/share/tuxtavern/` and `~/.cache/tuxtavern/`.

## Tests

`sh test/launcher/run.sh` (launcher, cheats, shims); `npm test` and `ctest` (PMJS, see [building](docs/building.md)).

## Credits

MV/MZ run on [PMJS](https://github.com/bbbreaddd/pmjs) (bread), here with rpgm's changes; XP/VX/VX Ace on
[mkxp-z](https://github.com/mkxp-z/mkxp-z), extending its `win32_wrap.rb` and `kgl2_wrap.rb` (Ancurio,
Splendide Imaginarius, white-axe). The launcher comes from rpgm, based on
[rpgmakermlinux-cicpoffs](https://github.com/bakustarver/rpgmakermlinux-cicpoffs) (bakustarver), with ideas
from [Kawariki](https://github.com/Orochimarufan/Kawariki) (Taeyeon Mori), [rmse](https://github.com/nathan-b/rmse)
(Nathan Baker) and the cheat menus of [emerladCoder](https://github.com/emerladCoder/RPG-Maker-MV-Cheat-Menu-Plugin),
[paramonos](https://github.com/paramonos/RPG-Maker-MV-MZ-Cheat-UI-Plugin) and
[yeetay233](https://github.com/yeetay233/rpgm-cheatmenu). `lib/evb.js` ports
[evbunpack](https://github.com/mos9527/evbunpack) (mos9527, Apache-2.0) and aplib (Sandor Nemes, GPL-3.0).
Mostly written by Claude (Anthropic).

GPL-3.0 as a whole. PMJS's files stay MIT (`LICENSE`); the shims in `lib/rgss/` are CC0; `REUSE.toml` says
which is which.
