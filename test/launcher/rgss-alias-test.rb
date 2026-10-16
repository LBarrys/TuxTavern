# encoding: utf-8
require 'tmpdir'

$failed = 0
def is(desc, got, want)
  if got == want
    puts "ok aliasing: #{desc}"
  else
    $failed += 1
    puts "FAIL aliasing: #{desc} (got #{got.inspect}, wanted #{want.inspect})"
  end
end
def safely
  yield
rescue SystemStackError
  :recursed
end

class Rect; end
class Sprite; attr_reader :v; def visible=(v); @v = v; end; end
module Input; def self.update; end; end

dir = Dir.mktmpdir
crlf = File.join(dir, 'a.txt')
File.binwrite(crlf, "a\r\nb\r\n")
ENV['TUXTAVERN_RGSS_VERSION'] = '1'
%w[ruby18 textmode lenient].each { |f| load File.expand_path("../../lib/rgss/#{f}.rb", __dir__) }

class Sprite; alias game_visible= visible=; def visible=(v); self.game_visible = v; end; end
class << File; alias game_open open; def open(*a, **o, &b); game_open(*a, **o, &b); end; end
module Kernel; alias game_kopen open; private :game_kopen; def open(*a, **o, &b); game_kopen(*a, **o, &b); end; private :open; end
class Object; alias game_methods methods; def methods(*a); game_methods(*a); end; end
class Module; alias game_im instance_methods; def instance_methods(*a); game_im(*a); end; end

s = Sprite.new
is('Sprite#visible= aliased by a game still works and still coerces', safely { s.visible = 1; s.v }, true)
is('File.open aliased by a game still reads CRLF as LF', safely { File.open(crlf, &:read) }, "a\nb\n")
is('Kernel#open aliased by a game still works', safely { open(crlf, &:read) }, "a\nb\n")
is('Object#methods aliased by a game still takes strings', safely { Sprite.new.methods.include?('visible=') }, true)
is('Module#instance_methods aliased by a game still takes strings', safely { Sprite.instance_methods.include?('visible=') }, true)
is('File.read reads CRLF as LF', File.read(crlf), "a\nb\n")
is('binary reads are left alone', File.binread(crlf), "a\r\nb\r\n")

exit($failed.zero? ? 0 : 1)
