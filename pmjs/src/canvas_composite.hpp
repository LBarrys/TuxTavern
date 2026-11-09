#pragma once

#include <array>
#include <cstdint>
#include <string_view>

namespace pmjs {
enum class CanvasComposite {
  sourceOver, sourceIn, sourceOut, sourceAtop, destinationOver, destinationIn,
  destinationOut, destinationAtop, lighter, copy, xorOp, multiply, screen,
  overlay, darken, lighten, colorDodge, colorBurn, hardLight, softLight,
  difference, exclusion, hue, saturation, color, luminosity
};

CanvasComposite canvasComposite(std::string_view name);
bool canvasCompositeClearsOutside(CanvasComposite operation);
// Source is premultiplied RGBA in byte units; destination is owned BGRA8.
void compositeCanvasPixel(std::uint8_t* destination, const std::array<double, 4>& source,
                          CanvasComposite operation, bool skiaCoverageRounding = false);
// 'lighter' with whole-byte premultiplied RGBA: the same bytes as compositeCanvasPixel, faster.
inline void addCanvasPixel(std::uint8_t* destination, unsigned r, unsigned g, unsigned b, unsigned a) {
  const auto add = [](std::uint8_t& to, unsigned value) { to = std::uint8_t(to + value > 255 ? 255 : to + value); };
  add(destination[2], r); add(destination[1], g); add(destination[0], b); add(destination[3], a);
}
}  // namespace pmjs
