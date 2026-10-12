#pragma once

#include "media_decoder.hpp"
#include "resources.hpp"

#include <condition_variable>
#include <mutex>
#include <thread>

namespace pmjs::addon {

struct Video {
  explicit Video(std::unique_ptr<pmjs::VideoDecoderSession> source);
  ~Video();
  void request(double targetTime);
  void resetForSeek();
  std::optional<pmjs::VideoFrame> take();
  void recycle(std::vector<std::uint8_t> rgba);
  const pmjs::MediaInfo& info() const;

 private:
  void run();
  std::unique_ptr<pmjs::VideoDecoderSession> decoder;
  std::mutex mutex;
  std::condition_variable condition;
  std::optional<double> requested;
  std::optional<pmjs::VideoFrame> ready;
  std::vector<std::uint8_t> recycledRgba;
  std::uint64_t playbackGeneration = 0;
  std::thread worker;
  bool shuttingDown = false;

 public:
  pmjs::ImageHandle image = 0, canvasImage = 0;
  std::shared_ptr<const pmjs::VideoYuv420> browser420;
  std::vector<std::uint8_t> canvasRgba;
  double duration = 0.0;
  double timestamp = -1.0;
  double lastRequestedTimestamp = -1.0;
};

}  // namespace pmjs::addon
