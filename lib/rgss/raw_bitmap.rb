# Zeus81's Bitmap Export (LonaRPG's save screenshots) reads a Bitmap's pixels from RGSS's memory
# through kernel32's RtlMoveMemory, which reads nothing here. Its get_data and set_data, bottom-up
# BGRA rows as in a Windows DIB, use mkxp-z's raw_data (top-down RGBA) instead. Prepended on the
# first frame after the game defines them.
module RpgmRawBitmap
  # Both ways: rows reversed, red and blue swapped.
  def self.dib(data, width, height)
    row = width * 4
    rows = Array.new(height) { |y| data.byteslice(y * row, row) }.reverse.join
    rows.unpack('V*').map { |p| (p & 0xFF00FF00) | ((p & 0xFF) << 16) | ((p >> 16) & 0xFF) }.pack('V*')
  end

  module Methods
    def get_data
      RpgmRawBitmap.dib(raw_data, width, height)
    end

    def set_data(data)
      self.raw_data = RpgmRawBitmap.dib(data, width, height)
    end

    def get_data_ptr
      data = get_data
      block_given? ? yield(data) : data
    end
  end

  def self.install
    return true if @installed
    return false unless Bitmap.method_defined?(:last_row_address) && Bitmap.method_defined?(:raw_data)
    Bitmap.prepend(Methods)
    @installed = true
  end
end

if Object.const_defined?(:Graphics) && Graphics.respond_to?(:update) && !Graphics.respond_to?(:update_without_raw_bitmap)
  module Graphics
    class << self
      alias_method :update_without_raw_bitmap, :update

      def update(*args)
        RpgmRawBitmap.install
        update_without_raw_bitmap(*args)
      end
    end
  end
end
