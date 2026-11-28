// fileIdentity resolves a directory once, not every component of every file it names (Karryn's
// Prison checked three files per prepared image, 19,514 images, each start), and names every
// file exactly as resolving the whole path did.
#include "platform/file_identity.hpp"
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <unistd.h>

namespace {
void require(bool ok, const std::string& message) {
  if (!ok) throw std::runtime_error(message);
}
std::string reference(const std::filesystem::path& path) {
  std::error_code error;
  const auto resolved = std::filesystem::canonical(path, error);
  struct stat info{};
  if (error || ::stat(resolved.c_str(), &info) != 0 || !S_ISREG(info.st_mode)) return {};
  return pmjs::fileIdentity(resolved, info);
}
void write(const std::filesystem::path& path, const std::string& text) {
  std::ofstream(path, std::ios::binary) << text;
}
}  // namespace

int main() try {
  const auto root = std::filesystem::temp_directory_path() / ("pmjs-file-identity-" + std::to_string(getpid()));
  std::filesystem::remove_all(root);
  std::filesystem::create_directories(root / "real/deep");
  write(root / "real/deep/a.png", "a");
  std::filesystem::create_directory_symlink(root / "real", root / "linked");
  std::filesystem::create_symlink(root / "real/deep/a.png", root / "real/deep/link.png");
  for (const auto& path : {root / "real/deep/a.png", root / "linked/deep/a.png", root / "real/deep/link.png",
         root / "real/deep/../deep/a.png", root / "real/deep/missing.png", root / "real/deep"}) {
    require(pmjs::fileIdentity(path) == reference(path), "identity differs from the whole-path one: " + path.string());
  }
  require(!pmjs::fileIdentity(root / "real/deep/a.png").empty(), "a file has an identity");
  require(pmjs::fileIdentity(root / "real/deep/missing.png").empty(), "a missing file has none");
  require(pmjs::fileIdentity(root / "real/deep").empty(), "a directory has none");

  const auto before = pmjs::fileIdentity(root / "real/deep/a.png");
  std::filesystem::remove(root / "real/deep/a.png");
  write(root / "real/deep/a.png", "changed");
  require(pmjs::fileIdentity(root / "real/deep/a.png") != before, "a replaced file changes its identity");
  require(pmjs::fileIdentity(root / "real/deep/a.png") == reference(root / "real/deep/a.png"), "and is named as before");

  std::filesystem::create_directory(root / "many");
  for (int i = 0; i < 100; ++i) write(root / "many" / (std::to_string(i) + ".png"), "x");
  const auto resolved = pmjs::fileIdentityDirectoryCanonicalizations();
  for (int i = 0; i < 100; ++i) require(!pmjs::fileIdentity(root / "many" / (std::to_string(i) + ".png")).empty(), "named");
  require(pmjs::fileIdentityDirectoryCanonicalizations() - resolved == 1, "one directory is resolved once");
  // A prepared image per directory, more of them than the cache keeps: all still named as before.
  for (int i = 0; i < 5000; ++i) {
    const auto directory = root / "entries" / std::to_string(i);
    std::filesystem::create_directories(directory);
    write(directory / "source.png", "x");
  }
  std::filesystem::create_directory_symlink(root / "entries", root / "entries-link");
  for (int i = 0; i < 5000; ++i) {
    const auto file = root / (i % 2 ? "entries" : "entries-link") / std::to_string(i) / "source.png";
    require(pmjs::fileIdentity(file) == reference(file), "identity differs past the cache bound: " + file.string());
  }
  std::filesystem::remove_all(root);
  std::cout << "file identities match whole-path resolution, with each directory resolved once\n";
  return 0;
} catch (const std::exception& error) {
  std::cerr << error.what() << '\n';
  return 1;
}
