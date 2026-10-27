#pragma once

#include "resources.hpp"

namespace pmjs {
// Defined in media_decoder.cpp, which owns the FFmpeg input helpers.
std::optional<ImagePixels> decodeAvifFromMemory(const void* data, std::size_t size,
    std::size_t maxDecodedBytes = 128U*1024U*1024U);
}  // namespace pmjs
