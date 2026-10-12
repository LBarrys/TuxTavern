#include "node_addon_video.hpp"

#include <iostream>

namespace pmjs::addon {

Video::Video(std::unique_ptr<pmjs::VideoDecoderSession> source)
    : decoder(std::move(source)) {
  worker = std::thread([this]() { run(); });
}

Video::~Video() {
  { std::lock_guard lock(mutex); shuttingDown = true; }
  condition.notify_one();
  if (worker.joinable()) worker.join();
}

void Video::request(double targetTime) {
  { std::lock_guard lock(mutex); requested = targetTime; }
  condition.notify_one();
}

void Video::resetForSeek() {
  std::lock_guard lock(mutex);
  ++playbackGeneration;
  requested.reset();
  if (ready) {
    if (ready->rgba.capacity() > recycledRgba.capacity())
      recycledRgba = std::move(ready->rgba);
    ready.reset();
  }
}

std::optional<pmjs::VideoFrame> Video::take() {
  std::lock_guard lock(mutex);
  if (!ready) return std::nullopt;
  auto result = std::move(ready); ready.reset(); return result;
}

void Video::recycle(std::vector<std::uint8_t> rgba) {
  std::lock_guard lock(mutex);
  if (rgba.capacity() > recycledRgba.capacity())
    recycledRgba = std::move(rgba);
}

void Video::run() {
  while (true) {
    double frameTimestamp = 0;
    std::uint64_t generation = 0;
    std::vector<std::uint8_t> rgba;
    {
      std::unique_lock lock(mutex);
      if (!requested && !shuttingDown &&
          decoder->queuedFrames() < 3 && !decoder->exhausted()) {
        lock.unlock();
        std::string error;
        decoder->prefetchOne(&error);
        if (!error.empty()) std::cerr << "[pmjs-media] video prefetch error: "
                                      << error << '\n';
        lock.lock();
        continue;
      }
      condition.wait(lock, [this] { return shuttingDown || requested.has_value(); });
      if (shuttingDown) return;
      frameTimestamp = *requested; requested.reset();
      generation = playbackGeneration;
      rgba = std::move(recycledRgba);
    }
    std::string error;
    auto frame = decoder->frame(frameTimestamp, rgba, &error);
    if (!frame) {
      if (!error.empty()) std::cerr << "[pmjs-media] video decoder error: "
                                    << error << '\n';
      recycle(std::move(rgba));
      continue;
    }
    std::lock_guard lock(mutex);
    if (generation != playbackGeneration) {
      if (frame->rgba.capacity() > recycledRgba.capacity())
        recycledRgba = std::move(frame->rgba);
      continue;
    }
    if (ready && ready->rgba.capacity() > recycledRgba.capacity())
      recycledRgba = std::move(ready->rgba);
    ready = std::move(frame);
  }
}

const pmjs::MediaInfo& Video::info() const { return decoder->info(); }

}  // namespace pmjs::addon
