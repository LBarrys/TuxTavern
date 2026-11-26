// The stream decoder sleeps while it has nothing to decode: it polled every 2 ms, 500 wakeups a
// second with no sound playing, which kept a core from idling. A stream still fills at once when
// played, is topped up in whole chunks, and never runs short.
#include "media/media_service.hpp"
#include <SDL.h>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <thread>
#include <vector>

using namespace std::chrono_literals;
namespace {
void require(bool ok, const char* message) {
  if (!ok) throw std::runtime_error(message);
}
std::vector<std::uint8_t> wav(int frames) {
  std::vector<std::uint8_t> bytes(44 + frames * 4);
  auto word = [&](int offset, std::uint32_t value, int count) {
    for (int i = 0; i < count; ++i) bytes[offset + i] = value >> (i * 8);
  };
  auto text = [&](int offset, const char* value) {
    for (int i = 0; i < 4; ++i) bytes[offset + i] = value[i];
  };
  text(0, "RIFF"); word(4, bytes.size() - 8, 4); text(8, "WAVE");
  text(12, "fmt "); word(16, 16, 4); word(20, 1, 2); word(22, 2, 2);
  word(24, 48000, 4); word(28, 48000 * 4, 4); word(32, 4, 2); word(34, 16, 2);
  text(36, "data"); word(40, frames * 4, 4);
  for (int i = 44; i < static_cast<int>(bytes.size()); i += 2) word(i, 1000, 2);
  return bytes;
}
std::uint64_t passes(const pmjs::MediaService& media) { return media.audioCacheStats().workerPasses; }
}  // namespace

int main() {
  SDL_setenv("SDL_AUDIODRIVER", "dummy", 1);
  if (SDL_Init(SDL_INIT_AUDIO) != 0) return 2;
  const auto root = std::filesystem::temp_directory_path() /
    ("pmjs-audio-worker-idle-" + std::to_string(SDL_GetPerformanceCounter()));
  std::filesystem::create_directories(root);
  int status = 0;
  try {
    {
      const auto bytes = wav(48000 * 10);
      std::ofstream(root / "music.wav", std::ios::binary)
        .write(reinterpret_cast<const char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
    }
    pmjs::MediaService media(root);
    require(media.audioAvailable(), "the dummy audio device opens");
    std::this_thread::sleep_for(100ms);
    auto before = passes(media);
    std::this_thread::sleep_for(500ms);
    const auto idle = passes(media) - before;
    std::cout << "idle passes in 500 ms: " << idle << '\n';
    require(idle <= 15, "the decoder sleeps with nothing to decode");

    pmjs::AudioLoadOptions options;
    options.intent = pmjs::AudioIntent::music;
    std::string error;
    const auto handle = media.loadAudio("music.wav", &error, options);
    require(handle != 0, "the stream loads");
    const auto played = std::chrono::steady_clock::now();
    require(media.play(handle, true, 0), "the stream plays");
    while (media.bufferedFrames(handle) < 48000) {
      require(std::chrono::steady_clock::now() - played < 300ms, "play wakes the decoder to fill a second");
      std::this_thread::sleep_for(1ms);
    }
    before = passes(media);
    std::size_t lowest = 48000;
    for (int i = 0; i < 1000; ++i) {
      lowest = std::min(lowest, media.bufferedFrames(handle));
      std::this_thread::sleep_for(1ms);
    }
    const auto playing = passes(media) - before;
    std::cout << "playing passes in 1 s: " << playing << ", lowest buffer " << lowest << " frames\n";
    require(media.isPlaying(handle), "the stream keeps playing");
    require(playing <= 60, "steady playback tops up in chunks, not every callback");
    require(lowest >= 24000, "the buffer stays at least half a second ahead");
    media.release(handle);
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    status = 1;
  }
  std::filesystem::remove_all(root);
  SDL_Quit();
  return status;
}
