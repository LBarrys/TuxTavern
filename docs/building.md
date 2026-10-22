# Building PMJS

Build on Linux. Run the commands below from the repository root.

## Requirements

- A C++20 compiler
- CMake 3.20+, Ninja and pkg-config
- Node.js with Node-API 8+ and its development headers
- Git

On Ubuntu 24.04:

```sh
sudo apt-get install build-essential cmake ninja-build pkg-config git \
  libnode-dev libsdl2-dev libegl1-mesa-dev libgles2-mesa-dev libpng-dev \
  zlib1g-dev libjpeg-dev libfreetype-dev libharfbuzz-dev liblz4-dev \
  libavformat-dev libavcodec-dev libavutil-dev libswresample-dev libswscale-dev
```

## Alpine

As a package, rebuilt and upgraded after each `git pull`: `doas sh tools/apk.sh` (installs
`tuxtavern@busylinux`, PMJS and the launcher, signed with `/root/keys/local.rsa`, as BusyLinux's `update.sh` does). By hand:

```sh
doas apk add build-base cmake samurai pkgconf git nodejs-dev linux-headers \
  pc:sdl2 mesa-dev libpng-dev libwebp-dev zlib-dev libjpeg-turbo-dev \
  freetype-dev harfbuzz-dev lz4-dev ffmpeg-dev
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=OFF
cmake --build build --target pmjs_native
cmake --install build --prefix /usr/lib/pmjs
```

`/usr/lib/pmjs/bin/pmjs` finds its files from its own path: put it on `PATH` with a small
script (`exec /usr/lib/pmjs/bin/pmjs "$@"`), not a symlink. Do not strip the installed files.

## Get the source

```sh
git clone https://github.com/LBarrys/TuxTavern.git
cd TuxTavern
```

## Build

The development build uses FreeType for text rendering.

```sh
cmake --preset dev -DBUILD_TESTING=OFF
cmake --build --preset dev --target pmjs_native --parallel 4
```

The addon is written to `build/dev/pmjs_native.node`.

## Tests

Native tests need Xvfb. Enable tests and build their executables:

```sh
sudo apt-get install xvfb xauth
cmake --preset dev
cmake --build --preset dev --parallel 4
ctest --preset dev --output-on-failure
```

Run the JavaScript checks separately:

```sh
npm ci
npm run lint
npm run licensing
npm test
```

## Install

```sh
cmake --install build/dev --prefix /usr/lib/pmjs
```

See [using PMJS](using.md) to run a game.
