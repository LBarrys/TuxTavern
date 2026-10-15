#include "node_addon_video.hpp"

#include <stdexcept>

namespace pmjs::addon {

Video::Video(std::unique_ptr<pmjs::VideoDecoderSession> source)
    : decoder(std::move(source)) {
  worker = std::thread([this]() {
    try { run(); }
    catch (...) {
      std::lock_guard lock(mutex);
      failure = std::current_exception();
      requested.reset();
      ready.reset();
    }
  });
}

Video::~Video() {
  { std::lock_guard lock(mutex); shuttingDown = true; }
  condition.notify_one();
  if (worker.joinable()) worker.join();
}

void Video::request(double targetTime) {
  { std::lock_guard lock(mutex);
    if (failure) std::rethrow_exception(failure);
    requested = targetTime; }
  condition.notify_one();
}

void Video::resetForSeek() {
  std::lock_guard lock(mutex);
  ++playbackGeneration;
  finishedAt.reset();
  requested.reset();
  if (ready) {
    if (ready->rgba.capacity() > recycledRgba.capacity())
      recycledRgba = std::move(ready->rgba);
    ready.reset();
  }
}

std::optional<pmjs::VideoFrame> Video::take() {
  std::lock_guard lock(mutex);
  if (failure) std::rethrow_exception(failure);
  if (!ready) return std::nullopt;
  auto result = std::move(ready); ready.reset(); return result;
}

bool Video::ended(double playbackTime) {
  std::lock_guard lock(mutex);
  if (failure) std::rethrow_exception(failure);
  return finishedAt && !ready && playbackTime >= *finishedAt;
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
        if (!error.empty()) throw std::runtime_error(error);
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
      if (!error.empty()) throw std::runtime_error(error);
      recycle(std::move(rgba));
      std::lock_guard lock(mutex);
      if (generation == playbackGeneration && decoder->exhausted() && !decoder->queuedFrames())
        finishedAt = decoder->endTime();
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
    if (decoder->exhausted() && !decoder->queuedFrames()) finishedAt = decoder->endTime();
  }
}

const pmjs::MediaInfo& Video::info() const { return decoder->info(); }

}  // namespace pmjs::addon
