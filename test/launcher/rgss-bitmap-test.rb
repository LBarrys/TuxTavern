$failed = 0
def is(desc, got, want)
  if got == want
    puts "ok bitmap: #{desc}"
  else
    $failed += 1
    puts "FAIL bitmap: #{desc} (got #{got.inspect}, wanted #{want.inspect})"
  end
end

# mkxp-z's Bitmap: raw_data is top-down RGBA. LonaRPG's Bitmap Export reads memory instead.
class Bitmap
  attr_reader :width, :height
  attr_accessor :raw_data
  def initialize(width, height, raw) @width, @height, @raw_data = width, height, raw end
  def last_row_address() 0 end
  def get_data() "\0" * 8 end
end
module Graphics
  def self.update() :drawn end
end
load File.expand_path('../../lib/rgss/raw_bitmap.rb', __dir__)

top = [1, 2, 3, 4].pack('C4')
bottom = [5, 6, 7, 8].pack('C4')
b = Bitmap.new(1, 2, top + bottom)
is('nothing changes before a frame', b.get_data, "\0" * 8)
is('a frame still draws', Graphics.update, :drawn)
is('then get_data is bottom-up BGRA, as in a Windows DIB', b.get_data.unpack('C*'), [7, 6, 5, 8, 3, 2, 1, 4])
b.set_data(b.get_data)
is('set_data writes back what get_data read', b.raw_data, top + bottom)
is('get_data_ptr yields the same bytes', b.get_data_ptr { |d| d }, b.get_data)

exit($failed.zero? ? 0 : 1)
