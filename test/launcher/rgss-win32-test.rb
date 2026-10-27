# encoding: utf-8
require 'stringio'

$failed = 0
def is(desc, got, want)
  if got == want
    puts "ok win32: #{desc}"
  else
    $failed += 1
    puts "FAIL win32: #{desc} (got #{got.inspect}, wanted #{want.inspect})"
  end
end

# mkxp-z's win32_wrap.rb, reduced to what lenient.rb hooks: a call it cannot make is tolerated
# and remembered in @called.
class Win32API
  TOLERATE_ERRORS = true
  def initialize(dll, func, *_args)
    @dll = dll
    @func = func
    @mkxp_native_available = false
  end

  def call(*_args)
    @called = true
    0
  end
  alias_method :mkxp_native_call, :call
end

load File.expand_path('../../lib/rgss/lenient.rb', __dir__)

def captured
  saved = $stdout
  $stdout = StringIO.new
  result = yield
  [result, $stdout.string]
ensure
  $stdout = saved
end

# Nettle Tribe's Input-EX freezes its force-feedback calls.
api = Win32API.new('WFInput', 'SetupForceFeedBack', 'i', 'i').freeze
first = captured { begin; api.call(1); rescue FrozenError; :frozen_error; end }
is('a frozen Win32API call is tolerated like any other', first[0], 0)
is('and logged', first[1], "[Win32API] [WFInput:SetupForceFeedBack] [1]\n")
is('only once per function', captured { api.call(0) }, [0, ''])
plain = Win32API.new('WFInput', 'SetupForceFeedBack', 'i', 'i')
is('unfrozen objects still use mkxp-z', [plain.call(1), plain.instance_variable_get(:@called)], [0, true])

exit($failed.zero? ? 0 : 1)
