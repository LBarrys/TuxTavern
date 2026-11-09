# Ruby 3.2 removed what RPG Maker games' scripts still call. mkxp-z's own Ruby 3.1 has all of it, so
# this only fills in on the system's Ruby (tools/mkxp-z.sh --system-ruby); each piece is left alone
# when the method or constant is there.
Object.const_set(:Fixnum, Integer) unless Object.const_defined?(:Fixnum)
Object.const_set(:Bignum, Integer) unless Object.const_defined?(:Bignum)
Random.const_set(:DEFAULT, Random) unless Random.const_defined?(:DEFAULT)

# Forwarding, not alias_method, so exist? as casefold.rb hooks it later is what these call.
[File, Dir, FileTest].each do |mod|
  next if mod.respond_to?(:exists?)

  mod.define_singleton_method(:exists?) { |*args| exist?(*args) }
end

module Kernel
  # Ruby 3.1's Object#=~: no match.
  def =~(_other)
    nil
  end unless method_defined?(:=~)

  # Ruby 2.7 to 3.1 kept taint and trust as methods that do nothing.
  { taint: :self, untaint: :self, trust: :self, untrust: :self, tainted?: false, untrusted?: false }.each do |name, result|
    next if method_defined?(name)

    define_method(name) { result == :self ? self : result }
  end
end
