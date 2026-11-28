#include "file_identity.hpp"

#include <algorithm>
#include <array>
#include <cerrno>
#include <fcntl.h>
#include <mutex>
#include <optional>
#include <sys/stat.h>
#include <unistd.h>
#include <unordered_map>
extern "C" {
#include <libavutil/mem.h>
#include <libavutil/sha.h>
}

namespace pmjs {
std::string fileIdentity(const std::filesystem::path& path, const struct stat& info) {
  return path.generic_string() + ':' + std::to_string(info.st_dev) + ':' +
    std::to_string(info.st_ino) + ':' + std::to_string(info.st_size) + ':' +
    std::to_string(info.st_mtim.tv_sec) + ':' + std::to_string(info.st_mtim.tv_nsec) + ':' +
    std::to_string(info.st_ctim.tv_sec) + ':' + std::to_string(info.st_ctim.tv_nsec);
}
namespace {
// Directories seen before keep their canonical path; std::filesystem::canonical takes one lstat per
// path component, and a prepared image's identity checks three files (Karryn's Prison: 19,514
// images, about 450 ms of each start). The cache only names directories: each file is still
// lstat()ed, so a replaced or changed file still changes its identity.
std::mutex directoryMutex;
std::unordered_map<std::string, std::string> canonicalDirectories;
std::uint64_t directoryCanonicalizations = 0;
std::optional<std::string> canonicalDirectory(const std::filesystem::path& directory) {
  const auto& key = directory.native();
  {
    std::lock_guard lock(directoryMutex);
    if (const auto found = canonicalDirectories.find(key); found != canonicalDirectories.end()) return found->second;
  }
  // A directory that is not a link is its parent's canonical path and its own name; prepared images
  // each have their own directory, so most are one lstat from a cached parent.
  std::optional<std::string> resolved;
  struct stat info{};
  if (directory.has_filename() && directory.has_parent_path() && directory.parent_path() != directory &&
      ::lstat(directory.c_str(), &info) == 0 && S_ISDIR(info.st_mode)) {
    if (const auto parent = canonicalDirectory(directory.parent_path()))
      resolved = (std::filesystem::path(*parent) / directory.filename()).generic_string();
  } else {
    std::error_code error;
    const auto canonical = std::filesystem::canonical(directory, error);
    if (error) return std::nullopt;
    resolved = canonical.generic_string();
  }
  if (!resolved) return std::nullopt;
  std::lock_guard lock(directoryMutex);
  ++directoryCanonicalizations;
  // Bounded: once full, directories are resolved as above without being kept.
  if (canonicalDirectories.size() < 4096) canonicalDirectories.emplace(key, *resolved);
  return resolved;
}
}  // namespace

std::uint64_t fileIdentityDirectoryCanonicalizations() {
  std::lock_guard lock(directoryMutex);
  return directoryCanonicalizations;
}

std::string fileIdentity(const std::filesystem::path& path) {
  // A regular file, not a link, is named by its directory's canonical path and its own name.
  struct stat linkInfo{};
  if (path.is_absolute() && path.has_filename() && path == path.lexically_normal() &&
      ::lstat(path.c_str(), &linkInfo) == 0 && !S_ISLNK(linkInfo.st_mode)) {
    if (!S_ISREG(linkInfo.st_mode)) return {};
    const auto directory = canonicalDirectory(path.parent_path());
    if (!directory) return {};
    return fileIdentity(std::filesystem::path(*directory) / path.filename(), linkInfo);
  }
  std::error_code error;
  const auto resolved = std::filesystem::canonical(path, error);
  struct stat info{};
  if (error || ::stat(resolved.c_str(), &info) != 0 || !S_ISREG(info.st_mode)) return {};
  return fileIdentity(resolved, info);
}

bool validContentHash(const std::string& hash) {
  return hash.size() == 64 && std::all_of(hash.begin(), hash.end(), [](char c) {
    return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
  });
}

bool contentDigestMatches(std::span<const std::uint8_t, 32> digest, const std::string& expected) {
  if (expected.size() != digest.size() * 2) return false;
  constexpr char hex[] = "0123456789abcdef";
  for (std::size_t i = 0; i < digest.size(); ++i)
    if (expected[i * 2] != hex[digest[i] >> 4] || expected[i * 2 + 1] != hex[digest[i] & 15]) return false;
  return true;
}

bool contentHashMatches(std::span<const std::uint8_t> bytes, const std::string& expected) {
  if (!validContentHash(expected)) return false;
  auto* context = av_sha_alloc();
  if (!context) return false;
  if (av_sha_init(context, 256) != 0) { av_free(context); return false; }
  av_sha_update(context, bytes.data(), bytes.size());
  std::array<std::uint8_t, 32> digest{};
  av_sha_final(context, digest.data());
  av_free(context);
  return contentDigestMatches(digest, expected);
}

std::optional<std::string> identityWithoutInode(const std::string& key) {
  // Paths may contain colons; the seven numeric identity fields are at the end.
  std::array<std::size_t, 7> separators{};
  std::size_t end = key.size();
  for (auto& separator : separators) {
    if (!end) return std::nullopt;
    separator = key.rfind(':', end - 1);
    if (separator == std::string::npos || separator + 1 == end ||
        !std::all_of(key.begin() + separator + 1, key.begin() + end,
          [](char c) { return c >= '0' && c <= '9'; })) return std::nullopt;
    end = separator;
  }
  return key.substr(0, separators[5]) + key.substr(separators[4]);
}

bool inodeOnlyChange(const std::string& expected, const std::string& actual) {
  const auto before = identityWithoutInode(expected), after = identityWithoutInode(actual);
  return before && after && *before == *after;
}

bool fileContentMatches(const std::filesystem::path& path, const std::string& identity,
                        const std::string& expectedHash) {
  if (!validContentHash(expectedHash)) return false;
  const int fd = ::open(path.c_str(), O_RDONLY | O_CLOEXEC | O_NONBLOCK);
  if (fd < 0) return false;
  struct Close { int fd; ~Close() { ::close(fd); } } close{fd};
  struct stat before{}, after{};
  if (::fstat(fd, &before) != 0 || !S_ISREG(before.st_mode) || before.st_size < 0 ||
      fileIdentity(path) != identity) return false;
  auto* context = av_sha_alloc();
  if (!context) return false;
  struct Free { AVSHA* value; ~Free() { av_free(value); } } free{context};
  if (av_sha_init(context, 256) != 0) return false;
  std::array<std::uint8_t, 65536> bytes{};
  off_t offset = 0;
  while (offset < before.st_size) {
    const auto count = ::pread(fd, bytes.data(), std::min<std::uint64_t>(bytes.size(), before.st_size - offset), offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) return false;
    av_sha_update(context, bytes.data(), count); offset += count;
  }
  if (::fstat(fd, &after) != 0 || before.st_dev != after.st_dev || before.st_ino != after.st_ino ||
      before.st_size != after.st_size || before.st_mtim.tv_sec != after.st_mtim.tv_sec ||
      before.st_mtim.tv_nsec != after.st_mtim.tv_nsec || before.st_ctim.tv_sec != after.st_ctim.tv_sec ||
      before.st_ctim.tv_nsec != after.st_ctim.tv_nsec || fileIdentity(path) != identity) return false;
  // Ensure the path still names the object that was hashed.
  struct stat named{};
  if (::stat(path.c_str(), &named) != 0 || named.st_dev != after.st_dev || named.st_ino != after.st_ino) return false;
  std::array<std::uint8_t, 32> digest{}; av_sha_final(context, digest.data());
  return contentDigestMatches(digest, expectedHash);
}
}
