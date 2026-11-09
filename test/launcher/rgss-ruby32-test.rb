$failed = 0
def is(desc, got, want)
  if got == want
    puts "ok ruby32: #{desc}"
  else
    $failed += 1
    puts "FAIL ruby32: #{desc} (got #{got.inspect}, wanted #{want.inspect})"
  end
end

load File.expand_path('../../lib/rgss/ruby32.rb', __dir__)
is('Fixnum and Bignum are Integer again', [1.is_a?(Fixnum), (2**70).is_a?(Bignum), Fixnum], [true, true, Integer])
is('File.exists?, Dir.exists? and FileTest.exists?', [File.exists?(__FILE__), Dir.exists?(__dir__), FileTest.exists?('/none')], [true, true, false])
is('Object#=~ is no match', Object.new =~ /x/, nil)
is('and String#=~ still matches', 'abc' =~ /b/, 1)
is('taint and trust do nothing', ['a'.taint, 'a'.untaint.tainted?, Object.new.untrusted?], ['a', false, false])
is('Random::DEFAULT', Random::DEFAULT.rand(1), 0)
class << File
  def exist?(_name) = :hooked
end
is('exists? goes through a later hook on exist? (casefold.rb)', File.exists?('x'), :hooked)
module Kernel
  def taint = :game
end
load File.expand_path('../../lib/rgss/ruby32.rb', __dir__)
is('a method that is there is kept, so loading twice changes nothing', 'a'.taint, :game)
exit($failed.zero? ? 0 : 1)
