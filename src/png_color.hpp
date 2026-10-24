#pragma once
#include <png.h>

namespace pmjs {
// Expands any PNG to 8-bit RGBA with its gAMA applied, as browsers decode untagged images.
inline void configurePng(png_structp png, png_infop info) {
  const int color = png_get_color_type(png, info);
  const int depth = png_get_bit_depth(png, info);
  // Quantize encoded samples before gamma conversion.
  if (depth == 16) png_set_strip_16(png);
  if (color == PNG_COLOR_TYPE_PALETTE) png_set_palette_to_rgb(png);
  if (color == PNG_COLOR_TYPE_GRAY && depth < 8) png_set_expand_gray_1_2_4_to_8(png);
  const bool transparent = png_get_valid(png, info, PNG_INFO_tRNS);
  if (transparent) png_set_tRNS_to_alpha(png);
  if (!(color & PNG_COLOR_MASK_COLOR)) png_set_gray_to_rgb(png);
  if (!(color & PNG_COLOR_MASK_ALPHA) && !transparent) png_set_add_alpha(png, 255, PNG_FILLER_AFTER);
  double gamma = 0.45455;
  png_get_gAMA(png, info, &gamma);
  if (!(gamma > 0 && gamma <= 21474.83)) gamma = 0.45455;
  png_set_gamma(png, 2.2, gamma);
}
}  // namespace pmjs
