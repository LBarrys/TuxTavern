# encoding: utf-8
require 'tmpdir'

unless ENV['V']
  ok = true
  [1, 2, 3].each do |v|
    out = IO.popen({ 'V' => v.to_s, 'TUXTAVERN_RGSS_VERSION' => v.to_s }, ['ruby', __FILE__], err: [:child, :out], &:read)
    puts out
    ok &&= $?.success?
  end
  exit(ok ? 0 : 1)
end

V = ENV['V'].to_i
$failed = 0
def is(desc, got, want)
  if got == want
    puts "ok RGSS#{V} translate: #{desc}"
  else
    $failed += 1
    puts "FAIL RGSS#{V} translate: #{desc} (got #{got.inspect}, wanted #{want.inspect})"
  end
end

class Rect; end
class Bitmap
  attr_reader :drawn
  def draw_text(*a); (@drawn ||= []) << a[a[0].is_a?(Rect) ? 1 : 4]; end
end
module Input
  def self.update; end
end
class Game_Temp; attr_accessor :message_text; end
class Window_Base
  def convert_escape_characters(text); text.gsub('\\N', '!'); end if V == 3
end
class Window_Message < Window_Base
  attr_reader :shown
  def start_message; @shown = $game_message.texts.join('|'); end if V == 2
  def refresh; @shown = $game_temp.message_text; end if V == 1
end

dir = Dir.mktmpdir
file = File.join(dir, 'ja-en.json')
File.write(file, %({\n  "はい": "Yes",\n  "勇者の剣": "Hero's Sword",\n  "こんにちは": "Hello"\n}\n))
ENV['TUXTAVERN_TRANSLATE'] = file
load File.expand_path('../../lib/rgss/ruby18.rb', __dir__)
load File.expand_path('../../lib/rgss/translate.rb', __dir__)
Input.update

b = Bitmap.new
b.draw_text(0, 0, 100, 20, '勇者の剣')
b.draw_text(Rect.new, 'はい', 1)
b.draw_text(0, 0, 100, 20, 'こ')
b.draw_text(0, 0, 100, 20, '新しい言葉')
is('drawn names and words are translated; single message characters are left alone', b.drawn, ["Hero's Sword", 'Yes', 'こ', '新しい言葉'])

w = Window_Message.new
case V
when 3 then is('VX Ace messages are translated before escape codes are converted', w.convert_escape_characters('こんにちは'), 'Hello')
when 2
  $game_message = Struct.new(:texts).new(%w[こんにちは 元気])
  w.start_message
  is('VX message lines are translated one by one', w.shown, 'Hello|元気')
else
  $game_temp = Game_Temp.new
  $game_temp.message_text = 'こんにちは'
  w.refresh
  is('XP messages are translated as a whole', w.shown, 'Hello')
end

118.times { Input.update }
is('nothing is written before the next save point', File.read(file, encoding: "UTF-8").include?('新しい言葉'), false)
Input.update
saved = File.read(file, encoding: "UTF-8")
is('new text is saved with an empty translation, keeping the format', saved.include?(%(  "新しい言葉": "")), true)
is('translations already in the file are kept', saved.include?(%("勇者の剣": "Hero's Sword")), true)
is('nothing else is recorded', saved.scan(/": "/).size, V == 2 ? 5 : 4)

File.write(file, saved.sub(%("新しい言葉": ""), %("新しい言葉": "New word")))
File.utime(Time.now, Time.now + 5, file)
120.times { Input.update }
b.draw_text(0, 0, 100, 20, '新しい言葉')
is('a translation added while playing is shown', b.drawn.last, 'New word')

File.write(file, '{"broken": ')
b.draw_text(0, 0, 100, 20, 'もう一つ')
120.times { Input.update }
is('a broken file is never overwritten', File.read(file, encoding: "UTF-8"), '{"broken": ')

File.write(file, '{"a": 1}')
out = IO.popen({ 'TUXTAVERN_TRANSLATE' => file, 'TUXTAVERN_RGSS_VERSION' => V.to_s },
               ['ruby', '-e', "class Bitmap; end; module Input; def self.update; end; end; load #{File.expand_path('../../lib/rgss/translate.rb', __dir__).inspect}"], err: [:child, :out], &:read)
is('a bad file at start turns translation off and says so', out.include?('translation is off'), true)

if V == 3
  File.write(file, %({"はい": "Yes", "いいえ": ""}))
  RpgmTranslate.start(file, "sed 's/^/EN:/'")
  RpgmTranslate.tr('こんにちは')
  1000.times do
    Input.update
    break if File.read(file, encoding: 'UTF-8').scan('EN:').size == 2
    sleep 0.005
  end
  is('empty entries are filled in by the command, without waiting on it',
     RpgmTranslate.read(file), { 'はい' => 'Yes', 'いいえ' => 'EN:いいえ', 'こんにちは' => 'EN:こんにちは' })
  is('and shown right away', RpgmTranslate.tr('こんにちは'), 'EN:こんにちは')

  File.write(file, %({"a": ""}))
  out = IO.popen({ 'TUXTAVERN_TRANSLATE' => file, 'TUXTAVERN_TRANSLATOR' => 'exit 3', 'TUXTAVERN_RGSS_VERSION' => '3' },
                 ['ruby', '-e', "class Bitmap; def draw_text(*a); end; end; module Input; def self.update; end; end; load #{File.expand_path('../../lib/rgss/translate.rb', __dir__).inspect}; 200.times { Input.update; sleep 0.005 }"], err: [:child, :out], &:read)
  is('a failing command stops machine translation, saying so once', out.scan('machine translation stopped').size, 1)
  is('and leaves the file alone', File.read(file), %({"a": ""}))
end

exit($failed.zero? ? 0 : 1)
