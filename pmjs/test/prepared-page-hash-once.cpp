// A prepared page whose file moved (same content, new inode) is verified against its recorded
// hash. That verification and the page's sharing key come from one SHA-256 (upstream f743f7a).
#include "platform/platform.hpp"
#include "platform/file_identity.hpp"
#include "graphics/resources.hpp"

#include <algorithm>
#include <array>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <vector>
#include <sys/stat.h>
#include <unistd.h>
#include <png.h>

extern "C" {
#include <libavutil/sha.h>
#include <libavutil/mem.h>
struct AVSHA* __real_av_sha_alloc(void);
int shaAllocations = 0;
struct AVSHA* __wrap_av_sha_alloc(void) { ++shaAllocations; return __real_av_sha_alloc(); }
}

namespace {
void require(bool value, const char* message) {
  if (!value) throw std::runtime_error(message);
}
void write(const std::filesystem::path& path, int width, int height, const std::vector<std::uint8_t>& pixels) {
  png_image image{}; image.version = PNG_IMAGE_VERSION;
  image.width = width; image.height = height; image.format = PNG_FORMAT_RGBA;
  require(png_image_write_to_file(&image, path.c_str(), 0, pixels.data(), 0, nullptr), "fixture PNG write failed");
}
std::string sha256Hex(const std::filesystem::path& path) {
  std::ifstream input(path, std::ios::binary);
  const std::vector<std::uint8_t> bytes((std::istreambuf_iterator<char>(input)), {});
  auto* sha = __real_av_sha_alloc();
  std::array<std::uint8_t, 32> digest{};
  av_sha_init(sha, 256); av_sha_update(sha, bytes.data(), bytes.size()); av_sha_final(sha, digest.data());
  av_free(sha);
  std::string hex;
  for (auto value : digest) { char text[3]; std::snprintf(text, sizeof text, "%02x", value); hex += text; }
  return hex;
}
}

int main() try {
  pmjs::Platform platform(16, 16, "Prepared page hash");
  const auto root = std::filesystem::temp_directory_path() / ("pmjs-page-hash-" + std::to_string(::getpid()));
  std::filesystem::create_directories(root / "image");
  struct Cleanup { std::filesystem::path path; ~Cleanup() { std::filesystem::remove_all(path); } } cleanup{root};
  const int width = 24, height = 20;
  std::vector<std::uint8_t> pixels(width * height * 4);
  for (std::size_t i = 0; i < pixels.size(); ++i) pixels[i] = static_cast<std::uint8_t>(i % 4 == 3 ? 255 : (i * 7) % 256);
  const auto source = root / "image.png", page = root / "image" / "page-0.png";
  write(source, width, height, pixels);
  // The page holds the image inside a one-pixel halo.
  std::vector<std::uint8_t> padded((width + 2) * (height + 2) * 4);
  for (int y = 0; y < height; ++y)
    std::copy_n(pixels.begin() + y * width * 4, width * 4, padded.begin() + ((y + 1) * (width + 2) + 1) * 4);
  write(page, width + 2, height + 2, padded);
  pmjs::PreparedImageDescriptor descriptor;
  descriptor.width = width; descriptor.height = height; descriptor.halo = 1;
  descriptor.pages = {{"page-0.png", width + 2, height + 2}};
  descriptor.cells = {{{0, 0, width, height}, {0, 0, width, height}, {1, 1, width, height}, {0, 0, 0, 0}, 0}};
  // The recorded identity differs from the file's only by inode, as after a copy that kept the content.
  struct stat info{};
  require(::stat(std::filesystem::canonical(page).c_str(), &info) == 0, "page stat failed");
  ++info.st_ino;
  const std::vector<std::string> identities{pmjs::fileIdentity(std::filesystem::canonical(page), info)};
  const std::vector<std::string> hashes{sha256Hex(page)};
  pmjs::ImageStore images;
  images.setWarmBudgetBytes(0);
  images.setPreparedFrameCacheBudget(0);
  require(images.installPrepared(source, root / "image", descriptor, pmjs::fileIdentity(source), &identities,
    nullptr, {}, &hashes),
    "prepared fixture installation failed");
  shaAllocations = 0;
  auto file = pmjs::ImageStore::openFile(source);
  require(file != nullptr, "source unavailable");
  auto load = images.capturePrepared(*file);
  require(load && images.validatePrepared(*load), "moved page was not accepted by its hash");
  const auto image = images.installPreparedLoad(*file, std::move(load), false);
  require(image.has_value(), "prepared load failed");
  const auto actual = images.readPixelsRegion(image->handle, 0, 0, width, height);
  require(actual && actual->rgba == pixels, "verified page pixels changed");
  if (shaAllocations != 1) {
    std::cerr << "SHA-256 runs while loading the verified page: " << shaAllocations << '\n';
    return 1;
  }
  std::cout << "a verified prepared page is hashed once\n";
  return 0;
} catch (const std::exception& error) {
  std::cerr << error.what() << '\n';
  return 1;
}
