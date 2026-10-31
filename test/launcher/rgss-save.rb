# Saves shaped like RGSS ones, for the Marshal round-trip test (marshal-test.js, run.sh).
class Table
  attr_accessor :data
  def initialize(d) @data = d end
  def _dump(_) @data end
  def self._load(s) new(s) end
end
class Color < Table; end
class Game_Actor; attr_accessor :hp, :name, :states; end
class Game_Party; attr_accessor :gold, :actors, :items; end
class Game_Map; attr_accessor :display_x; end
module RPG; class AudioFile; attr_accessor :name, :volume; end; end
Point = Struct.new(:x, :y)
class Path < Array; end

def world(text)
  a = Game_Actor.new; a.hp = 450; a.name = text.('ラルフ'); a.states = [1, 2]
  b = Game_Actor.new; b.hp = 0; b.name = text.('Ulrika'); b.states = []
  party = Game_Party.new; party.gold = 1234567; party.actors = [a, b, a]
  h = Hash.new(0); h[1] = 5; h[:potion] = 2; h[[1, 2, 'A']] = true; party.items = h
  m = Game_Map.new; m.display_x = 12.5
  bgm = RPG::AudioFile.new; bgm.name = text.('Town1'); bgm.volume = 100
  shared = text.('shared')
  [party, m, bgm, Table.new("\x01\x00\x00\x00\xff".b), Color.new([255.0, 0.0, 0.0, 128.0].pack('E4')),
   { name: shared, again: shared, sym: :ラ, big: 2**40, neg: -(2**31), huge: 2**70, f: [1.0 / 3, -0.0, Float::INFINITY, Float::NAN],
     struct: Point.new(1, 2), path: Path[1, 2], re: /a+b/i, cls: Game_Map, mod: RPG,
     sjis: "\x83\x89\x83C".b, binary_tagged: "\xff".dup.force_encoding('Shift_JIS'), empty: text.(''), nil: nil, t: true, f2: false }]
end

utf8 = ->(s) { s.dup.force_encoding('UTF-8') }
raw = ->(s) { s.dup.force_encoding('ASCII-8BIT') }
case ARGV[0]
when 'make' # the fixtures in marshal-test.js: ruby rgss-save.rb make DIR
  File.binwrite(ARGV[1] + '/Save01.rvdata2', Marshal.dump({ characters: [['Actor1', 0]], playtime_s: utf8.('01:02:03') }) +
    Marshal.dump({ system: world(utf8) }))
  File.binwrite(ARGV[1] + '/Save1.rxdata', world(raw).map { |o| Marshal.dump(o) }.join)
when 'read' # what Ruby reads from a VX Ace save
  File.open(ARGV[1], 'rb') do |f|
    Marshal.load(f)
    party = Marshal.load(f)[:system][0]
    puts "gold=#{party.gold} hp=#{party.actors[0].hp} name=#{party.actors[0].name} shared=#{party.actors[0].equal?(party.actors[2])}"
  end
end
