require 'tmpdir'

$failed = 0
def is(desc, got, want)
  if got == want
    puts "ok ini: #{desc}"
  else
    $failed += 1
    puts "FAIL ini: #{desc} (got #{got.inspect}, wanted #{want.inspect})"
  end
end

module Win32API_Impl; end
load File.expand_path('../../lib/rgss/ini_wrap.rb', __dir__)
K = Win32API_Impl::Kernel32
dir = Dir.mktmpdir
ini = File.join(dir, 'Game.ini')
File.binwrite(ini, "; note\r\n[Game]\r\nTitle = Hero\r\nTitle=Second\r\n[Other]\r\nLevel=7\r\n")

buf = "\0" * 32
n = K::GetPrivateProfileStringA.new.call(['game', 'TITLE', 'x', buf, 32, ini])
is('a value is found ignoring case, the first one winning', buf[0, n], 'Hero')
is('numbers and defaults work', [K::GetPrivateProfileInt.new.call(['Other', 'level', 0, ini]), K::GetPrivateProfileInt.new.call(['Other', 'nope', 3, ini])], [7, 3])
K::WritePrivateProfileStringA.new.call(['Other', 'Level', '9', ini])
is('a written value is read back at once', K::GetPrivateProfileInt.new.call(['Other', 'level', 0, ini]), 9)
File.binwrite(ini, "[Other]\r\nLevel=12345\r\n")
is('a file changed by someone else is read again', K::GetPrivateProfileInt.new.call(['Other', 'level', 0, ini]), 12345)
is('a missing file gives the default', K::GetPrivateProfileInt.new.call(['Other', 'level', 4, File.join(dir, 'none.ini')]), 4)

require 'shellwords'
line = Dir.chdir(dir) { K::GetCommandLine.new.call([]) }
is('the command line is the game\'s Game.exe', Shellwords.shellwords(line), [File.join(dir, 'Game.exe')])
$TEST = true
is('playtests add test', Shellwords.shellwords(K::GetCommandLine.new.call([])).drop(1), ['test'])

exit($failed.zero? ? 0 : 1)
