#pragma once

#include <filesystem>
#include <atomic>
#include <cstdint>
#include <optional>
#include <memory>
#include <mutex>
#include <unordered_set>
#include <string>
#include <unordered_map>
#include <vector>

namespace pmjs {

class FileReader {
 public:
  FileReader(int descriptor, std::uint64_t position) : descriptor_(descriptor), position_(position) {}
  ~FileReader();
  FileReader(const FileReader&) = delete;
  FileReader& operator=(const FileReader&) = delete;
  std::vector<std::uint8_t> read(std::size_t maxBytes);
  void close();
 private:
  int descriptor_;
  std::uint64_t position_;
};

class Vfs {
 public:
  struct DerivedFile {
    std::string logical, source, settings;
    std::filesystem::path file;
    mutable std::string sourceIdentity, settingsIdentity, fileIdentity;
    std::string sourceHash, settingsHash, fileHash;
    std::shared_ptr<std::mutex> identityMutex = std::make_shared<std::mutex>();
  };
  explicit Vfs(std::filesystem::path root);

  static std::string fileIdentity(const std::filesystem::path& path);
  void installDerivedFiles(const std::vector<DerivedFile>& files, bool catalog = false);
  std::string derivedIdentity(const std::string& path) const;
  // verify = false skips checking the derived file's source, settings and copy: only for a
  // catalog install, whose every later resolve() checks them (Karryn's Prison: 19,514 images,
  // about 450 ms of each start).
  std::optional<std::filesystem::path> resolveDerived(const std::string& path, bool verify = true) const;

  bool consumeDerivedInvalidation() { return derivedInvalidated_->exchange(false, std::memory_order_relaxed); }

  void mountWritableOverlay(const std::filesystem::path& root);
  void updateWritableOverlay(const std::vector<std::string>& paths,
                             const std::vector<std::string>& deletionMarkers);

  std::optional<std::filesystem::path> resolve(const std::string& path, bool verify = true) const;
  std::optional<std::filesystem::path> resolvePath(const std::string& path) const;
  std::optional<std::string> readText(const std::string& path) const;
  std::optional<std::vector<std::uint8_t>> readBytes(const std::string& path) const;
  std::unique_ptr<FileReader> openRead(const std::string& path, std::uint64_t start = 0) const;
  std::optional<std::vector<std::string>> readDirectory(const std::string& path) const;
  bool exists(const std::string& path) const;
  bool isDirectory(const std::string& path) const;
  const std::filesystem::path& root() const { return root_; }
  // Paths the index resolved; only symbolic links should need it.
  std::size_t resolvedPaths() const { return resolvedPaths_; }

 private:
  static std::optional<std::string> normalize(const std::string& path);
  std::optional<std::filesystem::path> resolveOriginal(const std::string& path) const;
  void indexPath(const std::filesystem::path& path);

  struct Overlay {
    std::shared_ptr<const Vfs> files;
    std::unordered_set<std::string> deleted;
    bool hides(const std::string& key) const;
  };
  std::shared_ptr<std::atomic<bool>> derivedInvalidated_ = std::make_shared<std::atomic<bool>>(false);
  // Async asset decoders keep an immutable view while mutations publish the next one. A mutex,
  // not std::atomic<std::shared_ptr> (GCC 12+) or the deprecated std::atomic_load/store.
  template <class T> std::shared_ptr<T> snapshot(const std::shared_ptr<T>& value) const {
    const std::lock_guard lock(*publishMutex_);
    return value;
  }
  template <class T> void publish(std::shared_ptr<T>& target, std::shared_ptr<T> value) {
    const std::lock_guard lock(*publishMutex_);
    target.swap(value);
  }
  std::shared_ptr<std::mutex> publishMutex_ = std::make_shared<std::mutex>();
  std::shared_ptr<const Overlay> overlay_;
  std::shared_ptr<const std::unordered_map<std::string, DerivedFile>> derived_;
  std::filesystem::path root_;
  std::unordered_map<std::string, std::filesystem::path> files_;
  std::unordered_map<std::string, std::filesystem::path> directories_;
  std::size_t resolvedPaths_ = 0;
};

}  // namespace pmjs
