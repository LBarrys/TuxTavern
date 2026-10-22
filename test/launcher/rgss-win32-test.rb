$failed = 0
def is(desc, got, want)
  if got == want
    puts "ok win32: #{desc}"
  else
    $failed += 1
    puts "FAIL win32: #{desc} (got #{got.inspect}, wanted #{want.inspect})"
  end
end

# mkxp-z's win32_wrap.rb: a DLL it cannot load gets a stub that marks the object and answers 0.
class Win32API
  def initialize(_dll, _func, *_args); end
  def call(*_args) :native end
  alias_method :mkxp_native_initialize, :initialize
  alias_method :mkxp_native_call, :call
  def initialize(dll, func, *_args)
    @dll, @func, @called, @mkxp_native_available = dll, func, false, false
  end
  def call(*args)
    return mkxp_native_call(*args) if @mkxp_native_available
    @called = true
    0
  end
end
ENV['TUXTAVERN_RGSS_VERSION'] = '3'
load File.expand_path('../../lib/rgss/lenient.rb', __dir__)

# Nettle Tribe's Input-EX keeps its WFInput.dll functions frozen.
require 'stringio'
frozen = Win32API.new('WFInput', 'SetupForceFeedBack', 'i', 'i').freeze
log, $stdout = $stdout, StringIO.new
got = [(frozen.call(1) rescue $!.class), (frozen.call(0) rescue $!.class)]
log, $stdout = $stdout, log
is('a frozen stub answers 0 instead of raising', got, [0, 0])
is('and logs the call once, as the stub does', log.string, "[Win32API] [WFInput:SetupForceFeedBack] [1]\n")
is('an unfrozen stub is unchanged', Win32API.new('WFInput', 'Other', '', 'i').call, 0)
native = Win32API.new('user32', 'GetKeyState', 'i', 'i')
native.instance_variable_set(:@mkxp_native_available, true)
native.freeze
is('a frozen object with a real function still calls it', (native.call(1) rescue $!.class), :native)

exit($failed.zero? ? 0 : 1)
