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
    puts "ok RGSS#{V} #{desc}"
  else
    $failed += 1
    puts "FAIL RGSS#{V} #{desc} (got #{got.inspect}, wanted #{want.inspect})"
  end
end

class Color; def initialize(*); end; end
class Font; attr_accessor :size; end
class Bitmap
  attr_reader :width, :height, :font, :texts
  def initialize(w, h); @width, @height, @font, @texts = w, h, Font.new, []; end
  def clear; @texts = []; end
  def fill_rect(*); end
  def draw_text(*a); @texts << a[4]; end
  def dispose; @disposed = true; end
  def disposed?; !!@disposed; end
end
class Sprite
  attr_accessor :z, :bitmap
  def dispose; $sprite = self; end
end
module Graphics
  class << self
    attr_accessor :frame_rate
    def update; end
    def width; 544; end
    def height; 416; end
  end
end
Graphics.frame_rate = V == 1 ? 40 : 60
module Input
  DOWN, UP, LEFT, RIGHT, B, C, F8, SHIFT = :DOWN, :UP, :LEFT, :RIGHT, :B, :C, :F8, :SHIFT
  @script = []
  @now = []
  class << self
    attr_accessor :script, :text_input
    def update; @now = @script.shift || []; @typed = @now.grep(String).join; end
    def trigger?(k); @now.include?(k); end
    def repeat?(k); @now.include?(k); end
    def press?(k); @now.include?(k); end
    alias_method :triggerex?, :trigger?
    alias_method :repeatex?, :trigger?
    def gets; t = @typed.to_s; @typed = ''; t; end
  end
end

Item = Struct.new(:id, :name)
MapData = Struct.new(:width, :height)
MapInfo = Struct.new(:name)
State = Struct.new(:zero_hp)
def load_data(path)
  return { 2 => MapInfo.new('Cave'), 1 => MapInfo.new('Town') } if path =~ /MapInfos/
  return MapData.new(10, 8) if path =~ /Map002/
  raise Errno::ENOENT, path
end

class Game_Battler
  attr_reader :hp, :states
  attr_accessor :level
  def initialize; @hp, @mp, @tp, @states, @level = 100, 30, 0, [], 1; end
  def maxhp; 500; end
  def mhp; 500; end if V == 3
  def mmp; 90; end if V == 3
  def maxmp; 90; end if V == 2
  def maxsp; 90; end if V == 1
  def max_tp; 100; end
  def death_state_id; 1; end if V == 3
  def hp=(v); @hp = [[v, maxhp].min, 0].max; add_state(1) if @hp.zero?; end
  def mp; @mp; end
  def mp=(v); @mp = v; end if V > 1
  def sp=(v); @mp = v; end if V == 1
  def tp=(v); @tp = v; end if V == 3
  def tp; @tp; end
  def add_state(id, *); @states << id unless @states.include?(id); end
  def recover_all; @hp = maxhp; @recovered = true; end
  def recovered?; !!@recovered; end
end
class Game_Actor < Game_Battler
  attr_reader :id, :name
  def initialize(id, name); super(); @id, @name = id, name; end
  def change_level(n, _show); @level = n; end if V > 1
end
class Game_Enemy < Game_Battler
  def perform_collapse_effect; @collapsed = true; end if V == 3
  def perform_collapse; @collapsed = true; end if V == 2
  def collapsed?; !!@collapsed; end
end
class Game_Player
  attr_reader :x, :y, :moved
  def initialize; @x, @y, @move_speed = 3, 4, 4; end
  def direction; 2; end
  def move_speed; @move_speed; end
  if V == 2
    def passable?(_x, _y); false; end
  else
    def passable?(_x, _y, _d); false; end
  end
  def encounter_count; 0; end
  def encounter; true; end
  def reserve_transfer(*a); @moved = a; end if V > 1
end
class Game_Map
  attr_accessor :need_refresh
  def map_id; 1; end
  def valid?(x, y); x.between?(0, 19) && y.between?(0, 14); end
end
class Game_Party
  attr_reader :gold, :store
  def initialize(actors); @actors, @gold, @store = actors, 0, Hash.new(0); end
  def gain_gold(n); @gold += n; end
  if V == 1
    def actors; @actors; end
    %w[item weapon armor].each do |k|
      define_method(:"#{k}_number") { |id| @store[[k, id]] }
      define_method(:"gain_#{k}") { |id, n| @store[[k, id]] += n }
    end
  else
    def members; @actors; end
    def item_number(obj); @store[obj]; end
    def gain_item(obj, n); @store[obj] += n; end
  end
end
class Game_Temp
  attr_accessor :save_calling, :player_transferring, :player_new_map_id, :player_new_x, :player_new_y, :player_new_direction
end
class Scene_Map; end
class Scene_Battle; end
class Scene_Save; end
class Scene_File; attr_reader :args; def initialize(*a); @args = a; end; end
if V == 3
  module SceneManager
    class << self
      attr_accessor :scene, :called
      def scene_is?(k); scene.is_a?(k); end
      def call(k); @called = k; end
    end
  end
end
def scene=(s)
  V == 3 ? SceneManager.scene = s : $scene = s
end

hero = Game_Actor.new(1, 'Hero')
$game_party = Game_Party.new([hero])
$game_player = Game_Player.new
$game_map = Game_Map.new
$game_temp = Game_Temp.new
$game_switches = []
$game_variables = [nil, 5]
$game_troop = Struct.new(:members, :enemies).new(*[[Game_Enemy.new, Game_Enemy.new]] * 2)
$data_items = [nil, Item.new(1, 'Potion'), Item.new(2, '')]
$data_weapons = [nil, Item.new(1, 'Sword')]
$data_armors = [nil]
$data_states = [nil, State.new(true), State.new(false)]
$data_system = Struct.new(:switches, :variables).new(['', 'Door'], ['', 'Coins'])
self.scene = Scene_Map.new

load File.expand_path('../../lib/rgss/ruby18.rb', __dir__)
load File.expand_path('../../lib/rgss/cheats.rb', __dir__)
C = RpgmCheats

def play(*frames)
  Input.script = [[:F8], *frames, [:F8]]
  Input.update
end
def row(label)
  C::Menu.new.main.index { |r| r[:label] == label } or raise "no row #{label}"
end
def to(label)
  [[:DOWN]] * row(label)
end

play([:C])
is('god mode is switched on from the menu', C.god, [1])
is('which heals the actor', hero.recovered?, true)
is('the menu draws its rows', $sprite.bitmap.texts.include?('God mode: Hero'), true)
is('and is closed again', [C.open, $sprite.bitmap.disposed?], [false, true])
hero.hp = -999
is('god mode: damage leaves HP full', hero.hp, 500)
V == 1 ? (hero.sp = 0) : (hero.mp = 0)
is('god mode: skills cost nothing', hero.mp, 90)
hero.tp = 0 if V == 3
is('god mode: TP stays full', hero.tp, V == 3 ? 100 : 0)
hero.add_state(1)
hero.add_state(2)
is('god mode: death is refused, other states are not', hero.states, [2])
C.set_god(hero, false)
hero.hp = -999
is('god mode off: damage kills', [hero.hp, hero.states.include?(1)], [0, true])
play(*to('Level: Hero'), [:RIGHT], [:RIGHT, :SHIFT])
is('level goes up by 1, Shift by 10', hero.level, 12)
play(*to('Gold'), [:RIGHT], [:RIGHT, :SHIFT])
is('gold goes up by 100, Shift by 1000', $game_party.gold, 1100)
is('the walls hold before no clip', $game_player.passable?(5, 5, 6), false) unless V == 2
play(*to('No clip'), [:C])
pass = V == 2 ? [$game_player.passable?(6, 5), $game_player.passable?(20, 5)] : [$game_player.passable?(5, 5, 6), $game_player.passable?(19, 5, 6)]
is('no clip walks through walls, but not off the map', pass, [true, false])
play(*to('No random battles'), [:C])
is('random battles stop', [$game_player.encounter_count, $game_player.encounter], [1, false])
play(*to('Move speed (0: normal)'), [:RIGHT, :SHIFT])
Input.update
is('move speed is capped at 6 and kept each frame', $game_player.move_speed, 6)
playing = $game_player
$game_player = Marshal.load(Marshal.dump(playing))
playing.instance_variable_set(:@move_speed, 1)
2.times { Input.update }
is('move speed is saved with the game', [$game_player.move_speed, playing.move_speed], [6, 1])
$game_player = Game_Player.new
Input.update
is('a new game starts at normal speed', $game_player.move_speed, 4)
$game_player = Marshal.load(Marshal.dump(playing))
play(*to('Move speed (0: normal)'), [:LEFT, :SHIFT])
is('move speed 0 gives the game its speed back', $game_player.move_speed, 4)
play(*to('Game speed'), [:RIGHT], [:RIGHT])
is('game speed raises the frame rate', Graphics.frame_rate, (V == 1 ? 40 : 60) * 3)
play(*to('Game speed'), [:LEFT], [:LEFT], [:LEFT])
is('and lowers it to half', Graphics.frame_rate, (V == 1 ? 20 : 30))
C.set_god(hero, true)
save = Marshal.dump($game_player)
$game_player = Game_Player.new
Input.update
is('a new game starts with every cheat off', [C.god, C.noclip, C.no_encounters, Graphics.frame_rate], [[], false, false, V == 1 ? 40 : 60])
$game_player = Marshal.load(save)
Input.update
is('a save brings its cheats back', [C.god, C.noclip, C.no_encounters, Graphics.frame_rate], [[1], true, true, V == 1 ? 20 : 30])
play(*to('Items >'), [:C], [:DOWN], *[[:RIGHT, :SHIFT]] * 11, [:B], [:DOWN], [:C], [:DOWN], [:RIGHT])
count = V == 1 ? [$game_party.store[['item', 1]], $game_party.store[['weapon', 1]]] : [$game_party.store[$data_items[1]], $game_party.store[$data_weapons[1]]]
is('items are capped at 99, weapons are their own list', count, [99, 1])
play(*to('Switches >'), [:C], [:DOWN], [:C], [:B], [:DOWN], [:C], [:DOWN], [:RIGHT, :SHIFT])
is('a switch is turned on, a variable raised', [$game_switches[1], $game_variables[1], $game_map.need_refresh], [true, 15, true])
play(*to('Teleport >'), [:C], [:DOWN], [:C], [:DOWN], [:DOWN], [:DOWN], [:C])
is('a spot is remembered', C.spots, [[1, 3, 4]])
moved = V == 1 ? [$game_temp.player_new_map_id, $game_temp.player_new_x, $game_temp.player_new_y, $game_temp.player_transferring] : $game_player.moved
is('teleport goes to a map by name, inside its size', moved, V == 1 ? [2, 3, 4, true] : [2, 3, 4, 2])
is('a missing map is refused', C.teleport(9), false)
$data_items << Item.new(3, 'Ether') << Item.new(4, 'Hi-Potion')
play(*to('Items >'), [:C], [:C], ['po'], ['x', :B], [:BACKSPACE], ['t'], [:RETURN], [:DOWN], [:DOWN], [:RIGHT])
is('search narrows a list as you type, and X types instead of going back', $sprite.bitmap.texts.include?('Ether'), false)
is('the search row shows the query, Backspace included', $sprite.bitmap.texts.include?('Search: pot'), true)
hi = V == 1 ? $game_party.store[['item', 4]] : $game_party.store[$data_items[4]]
is('the matches can be changed after Enter', hi, 1)
is('text input is off once the menu closes', Input.text_input, false)
play(*to('Items >'), [:C], [:C], ['zz'], [:ESCAPE], [:DOWN], [:DOWN], [:RIGHT])
ether = V == 1 ? $game_party.store[['item', 3]] : $game_party.store[$data_items[3]]
is('Esc clears the search and shows everything again', ether, 1)
play(*to('Items >'), [:C], [:C], ['99'], [:RETURN])
is('search finds an item by its exact count', [$sprite.bitmap.texts.include?($data_items[1].name), $sprite.bitmap.texts.include?('Ether')], [true, false])
play(*to('Variables >'), [:C], [:C], ['15'], [:RETURN])
is('and a variable by its exact value', $sprite.bitmap.texts.grep(/\A0001 /).size, 1)
play(*to('Win battle'), [:C])
is('win battle needs a battle', $game_troop.members.map(&:hp), [100, 100])
self.scene = Scene_Battle.new
play(*to('Win battle'), [:C])
is('win battle defeats every enemy', $game_troop.members.map(&:hp), [0, 0])
is('with their collapse shown', $game_troop.members.map(&:collapsed?), V == 1 ? [false, false] : [true, true])
play(*to('Save'), [:C])
is('saving is refused outside the map', [$scene, (SceneManager.called if V == 3)].compact.map(&:class).include?(Scene_Save), false)
self.scene = Scene_Map.new
play(*to('Save'), [:C])
saved = case V
        when 1 then [$scene.class, $game_temp.save_calling]
        when 2 then [$scene.class, $scene.args]
        else [SceneManager.called]
        end
is('save opens the save screen, back to the map after', saved, [[Scene_Save, true], [Scene_File, [true, false, true]], [Scene_Save]][V - 1])
# LonaRPG's Hime AllKey replaces Input.update without calling the one before.
# Its key constants are arrays of key codes, some of them nil, which its trigger? cannot take.
class << Input
  def update; @now = @script.shift || []; @typed = @now.grep(String).join; end
  %i[trigger? repeat? press?].each do |name|
    define_method(name) { |k| raise TypeError, 'nil key' if k.is_a?(Array) && k.include?(nil); @now.include?(k) }
  end
end
if V == 3
  %i[DOWN UP LEFT RIGHT B C F8 SHIFT].each do |name|
    Input.send(:remove_const, name)
    Input.const_set(name, [nil])
  end
end
$sprite = nil
Graphics.update
Input.script = [[:F8], [:B], [:B]]
Input.update
Graphics.update
is('F8 still opens the menu when a game replaces Input.update', [$sprite.nil?, C.open], [false, false])
$game_party = nil
Input.script = [[:F8]]
Input.update
Graphics.update
is('no menu before a game is loaded', C.open, false)

exit($failed.zero? ? 0 : 1)
