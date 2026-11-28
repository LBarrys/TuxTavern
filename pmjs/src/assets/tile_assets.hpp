#pragma once

#include "asset_processor.hpp"
#include "graphics/resources.hpp"
#include <list>
#include <mutex>

namespace pmjs {
struct TileAssetInput {
  std::shared_ptr<ImageFileSource> source;
  std::vector<AssetRect> rectangles;
};
struct TileAssetSource {
  int width = 0, height = 0;
  std::vector<PreparedAssetCell> regions;
};
struct PreparedTileAssets {
  int version = 1, halo = 1;
  std::vector<TileAssetSource> sources;
  std::vector<PreparedAssetPage> pages;
  std::size_t ordinaryBytes = 0, pageBytes = 0;
};
// Decoded tile sheets shared by the maps of one preparation: maps reuse the same tilesets, and each
// decoded them again (as upstream b8e4956's TileDecodeCache, without its replay paths).
class TileDecodeCache {
 public:
  static constexpr std::size_t limitBytes = 32U * 1024U * 1024U;
  // Decodes within budget as ImageStore::decodeFile does; a cached sheet over the budget is decoded
  // again, so a map is packed or refused exactly as without the cache.
  std::shared_ptr<const ImagePixels> decode(const ImageFileSource& source, std::size_t budget);
  void clear();
  std::size_t bytes();
  std::uint64_t hits();

 private:
  std::mutex mutex_;
  std::list<std::pair<std::string, std::shared_ptr<const ImagePixels>>> entries_;
  std::size_t bytes_ = 0;
  std::uint64_t hits_ = 0;
};
TileDecodeCache& tileDecodeCache();
std::size_t verifyTileAssets(const std::vector<TileAssetInput>& inputs,
    const PreparedTileAssets& descriptor, const std::filesystem::path& directory);
PreparedTileAssets prepareTileAssets(const std::vector<TileAssetInput>& inputs,
                                    const std::filesystem::path& staging);
}
