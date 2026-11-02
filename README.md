# TuxTavern

Runs Windows RPG Maker XP/VX/VX Ace/MV/MZ games natively on Alpine Linux (musl). Wayland only.
No Wine, no browser.

| Game | Runs on |
|---|---|
| MV (Pixi 4 or 7), MZ, `package.nw` | PMJS (this repository) |
| XP, VX, VX Ace | mkxp-z |
| Enigma Virtual Box `.exe`, or NW.js `.exe` with the game inside | unpacked, then as above |

## Install

```sh
git clone https://github.com/LBarrys/TuxTavern && cd TuxTavern
doas sh tools/apk.sh     # builds and installs the tuxtavern package; again after each git pull
./build-mkxp-z.sh        # XP/VX/VX Ace; removes its build files after (-s: with Alpine's libraries, faster; new)
```

## Use

```sh
tuxtavern [GAME_DIR | Game.exe]   # default: current directory
tuxtavern --no-cheat GAME         # turn off the F8 cheat menu (god mode, no clip, speed, teleport, items...)
tuxtavern --test GAME             # XP/VX/VX Ace: playtest
tuxtavern --edit-save SAVE        # edit a save as JSON in $EDITOR
tuxtavern --info GAME             # show what was detected
tuxtavern --desktop GAME          # add it to the app launcher
```

- **Missing graphics or sounds:** extract the game's [RTP](https://www.rpgmakerweb.com/run-time-package)
  to `~/.local/share/tuxtavern/rtp/` as `Standard`, `RPGVX` or `RPGVXAce`. `--info` names the one needed.
- **MV/MZ uses too much power:** `PMJS_RENDER_HZ=60 tuxtavern GAME` (draws at 60 frames a second, not as fast as it can).
- **A plugin or script stops a game** (e.g. one that builds HTML): `TUXTAVERN_SKIP=name,...` leaves it out.
- **Screenshots (MV/MZ):** `TUXTAVERN_SCREENSHOTS=1` makes F12 save one to `~/Pictures` (or give a folder).
- **Other keys (MV/MZ):** `TUXTAVERN_KEYS=wasd` (or `w=up,e=ok,q=cancel,...`); XP/VX/VX Ace: mkxp-z's F1 menu.
- **Settings for one game:** put them in `tuxtavern.env` in its folder, one per line (`PMJS_RENDER_HZ=60`).
- **Your own fixes:** in the game folder, `*.tuxtavern.js` (MV/MZ) run after the game's plugins and
  `*.tuxtavern.rb` (XP/VX/VX Ace) before its `Main`;
  `TUXTAVERN_DUMP_SCRIPTS=DIR` writes the game's scripts there, as written and as run.
- **A shim breaks a game:** `TUXTAVERN_RGSS_SKIP=name,...` skips files in `lib/rgss/`.
- **Faster XP/VX/VX Ace (experimental, x86-64):** `TUXTAVERN_YJIT=1 tuxtavern GAME`.
- **Garbled Japanese file names:** `apk add icu-data-full`.
- **Boxes instead of symbols in MV/MZ text:** `apk add font-dejavu` (or any font with them).

Saves stay in the game folder; everything else is in `~/.local/share/tuxtavern/` and `~/.cache/tuxtavern/`.

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
