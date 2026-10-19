require 'tmpdir'

$failed = 0
def is(desc, got, want)
  if got == want
    puts "ok casefold: #{desc}"
  else
    $failed += 1
    puts "FAIL casefold: #{desc} (got #{got.inspect}, wanted #{want.inspect})"
  end
end

load File.expand_path('../../lib/rgss/casefold.rb', __dir__)
Dir.mktmpdir do |dir|
  Dir.chdir(dir) do
    Dir.mkdir('Data'); Dir.mkdir('Data/HCGframes'); Dir.mkdir('Data/race'); Dir.mkdir('Data/race/Moot')
    File.binwrite('Data/HCGframes/Grab_EventExt1_Grab.rb', 'grab')
    File.binwrite('Data/race/Moot/eyes.act', 'eyes')
    File.symlink('Data/race/Moot', 'Data/race/moot')
    is('a file named in another case is read (LonaRPG)', File.read('Data/HCGframes/Grab_eventExt1_Grab.rb'), 'grab')
    is('and opened', File.open('data/hcgframes/grab_eventext1_grab.rb', 'rb', &:read), 'grab')
    is('and found', [File.exist?('DATA/HCGFRAMES/GRAB_EVENTEXT1_GRAB.RB'), FileTest.exist?('data/HCGframes/Grab_EventExt1_Grab.rb'), File.size('data/hcgframes/grab_eventext1_grab.rb')], [true, true, 4])
    is('a folder too', Dir.exist?('data/RACE/moot'), true)
    is('past a name that is not a folder (a broken link)', File.read('Data/race/moot/eyes.act'), 'eyes')
    is('a missing file stays missing', [File.exist?('Data/none.rb'), File.file?('data/none.rb')], [false, false])
    File.binwrite('data/hcgframes/new.rb', 'new')
    is('a new file goes into the folder of another case', File.binread('Data/HCGframes/new.rb'), 'new')
    is('exact names are untouched', RpgmCasefold.resolve('Data/HCGframes/new.rb'), 'Data/HCGframes/new.rb')
  end
end

exit($failed.zero? ? 0 : 1)
