module RpgmCheats
  SPEEDS = [0.5, 1, 2, 3, 4].freeze

  class << self
    attr_accessor :spots, :open

    def rgss
      v = ENV['TUXTAVERN_RGSS_VERSION'].to_i
      return v if v.between?(1, 3)
      Object.const_defined?(:SceneManager) ? 3 : Object.const_defined?(:Scene_Base) ? 2 : 1
    end

    def ext
      %w[rxdata rxdata rvdata rvdata2][rgss]
    end

    # RGSS3 names keys by symbol; games may redefine Input's constants (LonaRPG's Hime AllKey does).
    def key(name)
      rgss == 3 ? name : Input.const_get(name)
    end

    def god?(battler)
      battler.respond_to?(:id) && god.include?(battler.id)
    end

    def max_of(b, kind)
      case kind
      when :hp then b.respond_to?(:mhp) ? b.mhp : b.maxhp
      when :mp then b.respond_to?(:mmp) ? b.mmp : b.respond_to?(:maxmp) ? b.maxmp : b.maxsp
      else b.max_tp
      end
    end

    def death?(b, id)
      return id == b.death_state_id if b.respond_to?(:death_state_id)
      return !!($data_states[id] && $data_states[id].zero_hp) if rgss == 1 && $data_states
      id == 1
    end

    def party
      $game_party.respond_to?(:members) ? $game_party.members : $game_party.actors
    end

    def scene?(name)
      return false unless Object.const_defined?(name)
      klass = Object.const_get(name)
      return SceneManager.scene_is?(klass) if Object.const_defined?(:SceneManager)
      $scene.is_a?(klass)
    end
  end

  self.spots = []

  module Actor
    def hp=(v)
      super(RpgmCheats.god?(self) ? RpgmCheats.max_of(self, :hp) : v)
    end

    def mp=(v)
      super(RpgmCheats.god?(self) ? RpgmCheats.max_of(self, :mp) : v)
    end

    def sp=(v)
      super(RpgmCheats.god?(self) ? RpgmCheats.max_of(self, :mp) : v)
    end

    def tp=(v)
      super(RpgmCheats.god?(self) ? RpgmCheats.max_of(self, :tp) : v)
    end

    def add_state(id, *rest)
      return if RpgmCheats.god?(self) && RpgmCheats.death?(self, id)
      super
    end
  end

  module Player
    def passable?(x, y, *d)
      return super unless RpgmCheats.noclip
      nx, ny = x, y
      unless d.empty?
        nx += { 4 => -1, 6 => 1 }.fetch(d[0], 0)
        ny += { 8 => -1, 2 => 1 }.fetch(d[0], 0)
      end
      $game_map.valid?(nx, ny)
    end

    def encounter_count
      RpgmCheats.no_encounters ? 1 : super
    end

    def encounter
      RpgmCheats.no_encounters ? false : super
    end
  end

  def self.install
    return true if @installed
    return false unless Object.const_defined?(:Game_Actor) && Object.const_defined?(:Game_Player)
    Game_Actor.prepend(Actor)
    Game_Player.prepend(Player)
    @installed = true
  end

  def self.frame
    return if open || !install
    $game_player.instance_variable_set(:@move_speed, move) if move > 0
    apply_speed
    Menu.new.run if $game_party && Input.trigger?(RpgmCheats.key(:F8))
  end

  # Kept on the player, so the cheats are saved with the game.
  def self.saved
    ($game_player && $game_player.instance_variable_get(:@rpgm_cheats)) || {}
  end

  def self.keep(key, v)
    return unless $game_player
    s = saved.dup
    v ? (s[key] = v) : s.delete(key)
    $game_player.instance_variable_set(:@rpgm_cheats, s.empty? ? nil : s)
  end

  def self.god
    saved[:god] || []
  end

  def self.noclip
    !!saved[:noclip]
  end

  def self.noclip=(on)
    keep(:noclip, on)
  end

  def self.no_encounters
    !!saved[:no_encounters]
  end

  def self.no_encounters=(on)
    keep(:no_encounters, on)
  end

  def self.move
    saved[:move] || 0
  end

  def self.speed
    saved[:speed] || 1
  end

  def self.set_god(actor, on)
    ids = on ? (god + [actor.id]).uniq : god - [actor.id]
    keep(:god, ids.empty? ? nil : ids)
    actor.recover_all if on
  end

  def self.set_move(n)
    pl = $game_player
    return unless pl
    n = [[n, 0].max, 6].min
    if n > 0
      keep(:move_was, pl.instance_variable_get(:@move_speed)) if move.zero?
      keep(:move, n)
    elsif move > 0
      was = saved[:move_was]
      pl.instance_variable_set(:@move_speed, was) if was
      keep(:move, nil)
      keep(:move_was, nil)
    end
  end

  def self.set_speed(n)
    keep(:speed, n == 1 ? nil : n)
    apply_speed
  end

  def self.apply_speed
    return if speed == (@applied || 1)
    @base_rate ||= Graphics.frame_rate
    Graphics.frame_rate = [(@base_rate * speed).round, 1].max
    @applied = speed
  end

  def self.heal
    party.each(&:recover_all)
  end

  def self.win
    return false unless scene?(:Scene_Battle)
    enemies = $game_troop.respond_to?(:members) ? $game_troop.members : $game_troop.enemies
    enemies.each do |e|
      e.hp = 0
      e.perform_collapse_effect if e.respond_to?(:perform_collapse_effect)
      e.perform_collapse if rgss == 2 && e.respond_to?(:perform_collapse)
    end
    true
  end

  def self.save
    return false unless scene?(:Scene_Map)
    case rgss
    when 3 then SceneManager.call(Scene_Save)
    when 2 then $scene = Scene_File.new(true, false, true)
    else
      $game_temp.save_calling = true
      $scene = Scene_Save.new
    end
    true
  end

  def self.kinds
    { 'Items' => [$data_items, :item], 'Weapons' => [$data_weapons, :weapon], 'Armor' => [$data_armors, :armor] }
  end

  def self.count(list, kind, id)
    rgss == 1 ? $game_party.send(:"#{kind}_number", id) : $game_party.item_number(list[id])
  end

  def self.set_count(list, kind, id, n)
    d = [[n, 0].max, 99].min - count(list, kind, id)
    rgss == 1 ? $game_party.send(:"gain_#{kind}", id, d) : $game_party.gain_item(list[id], d)
  end

  def self.set_level(actor, n)
    actor.respond_to?(:change_level) ? actor.change_level(n, false) : actor.level = n
  end

  def self.refresh_map
    $game_map.need_refresh = true if $game_map
  end

  def self.maps
    @maps ||= (load_data("Data/MapInfos.#{ext}") rescue {}).sort.map { |id, info| [id, info.name] }
  end

  def self.here
    [$game_map.map_id, $game_player.x, $game_player.y]
  end

  def self.teleport(id, x = nil, y = nil)
    if x.nil?
      map = (load_data(format('Data/Map%03d.%s', id, ext)) rescue nil)
      return false unless map
      x = [$game_player.x, map.width - 1].min
      y = [$game_player.y, map.height - 1].min
    end
    if $game_player.respond_to?(:reserve_transfer)
      $game_player.reserve_transfer(id, x, y, $game_player.direction)
    else
      $game_temp.player_transferring = true
      $game_temp.player_new_map_id = id
      $game_temp.player_new_x = x
      $game_temp.player_new_y = y
      $game_temp.player_new_direction = $game_player.direction
    end
    true
  end

  class Menu
    ROW = 26

    def initialize
      @pages = [[:main, 0, 0]]
      @note = ''
      @query = {}
    end

    def step(base)
      Input.press?(RpgmCheats.key(:SHIFT)) ? base * 10 : base
    end

    def entry(label, value = nil, ok: nil, change: nil)
      { label: label, value: value, ok: ok, change: change }
    end

    def toggle(label, on, &set)
      entry(label, on ? 'ON' : 'OFF', ok: -> { set.call(!on) }, change: ->(_) { set.call(!on) })
    end

    def number(label, v, base, &set)
      entry(label, v.to_s, change: ->(dir) { set.call(v + dir * step(base)) })
    end

    def main
      c = RpgmCheats
      rows = []
      c.party.each do |a|
        rows << toggle("God mode: #{a.name}", c.god.include?(a.id)) { |on| c.set_god(a, on) }
        rows << number("Level: #{a.name}", a.level, 1) { |n| c.set_level(a, n) }
      end
      rows << number('Gold', $game_party.gold, 100) { |n| $game_party.gain_gold(n - $game_party.gold) }
      rows << toggle('No clip', c.noclip) { |on| c.noclip = on }
      rows << toggle('No random battles', c.no_encounters) { |on| c.no_encounters = on }
      rows << number('Move speed (0: normal)', c.move, 1) { |n| c.set_move(n) }
      rows << entry('Game speed', "x#{c.speed}", change: lambda { |dir|
        i = [[SPEEDS.index(c.speed).to_i + dir, 0].max, SPEEDS.size - 1].min
        c.set_speed(SPEEDS[i])
      })
      rows << entry('Heal party', nil, ok: -> { c.heal; @note = 'Party healed.' })
      rows << entry('Win battle', nil, ok: -> { @note = c.win ? 'Enemies defeated.' : 'Not in a battle.' })
      rows << entry('Save', nil, ok: -> { @note = c.save ? 'Close the menu to save.' : 'Save from the map.' })
      c.kinds.each_key { |k| rows << entry("#{k} >", nil, ok: -> { push(k) }) }
      %w[Switches Variables Teleport].each { |k| rows << entry("#{k} >", nil, ok: -> { push(k) }) }
      rows
    end

    def page(name)
      c = RpgmCheats
      case name
      when :main then main
      when 'Switches', 'Variables'
        names = $data_system.send(name.downcase) || []
        (1...names.size).map do |id|
          label = format('%04d %s', id, names[id])
          if name == 'Switches'
            toggle(label, $game_switches[id]) { |on| $game_switches[id] = on; c.refresh_map }
          else
            v = $game_variables[id]
            next entry(label, v.inspect) unless v.is_a?(Integer)
            number(label, v, 1) { |n| $game_variables[id] = n; c.refresh_map }
          end
        end
      when 'Teleport'
        map, x, y = c.here
        rows = [entry("Remember map #{map} (#{x}, #{y})", nil, ok: -> { c.spots << [map, x, y]; @note = 'Remembered.' })]
        c.spots.each_with_index do |(m, sx, sy), i|
          rows << entry("Spot #{i + 1}: map #{m} (#{sx}, #{sy})", nil, ok: -> { c.teleport(m, sx, sy); @note = 'Close the menu to go.' })
        end
        rows + c.maps.map { |id, n| entry(format('%03d %s', id, n), nil, ok: -> { @note = c.teleport(id) ? 'Close the menu to go.' : 'Map not found.' }) }
      else
        list, kind = c.kinds[name]
        (1...list.size).select { |id| list[id] && !list[id].name.to_s.empty? }.map do |id|
          number(list[id].name, c.count(list, kind, id), 1) { |n| c.set_count(list, kind, id, n) }
        end
      end
    end

    def push(name)
      @pages << [name, 0, 0]
      @rows = nil
    end

    def rows
      @rows ||= begin
        name = @pages.last[0]
        list = page(name)
        if name != :main && Input.respond_to?(:text_input=)
          q = @query[name].to_s
          d = q.downcase
          list = list.select { |r| r[:label].to_s.downcase.include?(d) || r[:value].to_s.downcase == d } unless q.empty?
          list.unshift(entry("Search: #{q}#{'_' if @typing}", nil, ok: -> { type(true) }))
        end
        list
      end
    end

    def type(on)
      @typing = on
      Input.gets
      Input.text_input = on
      @note = on ? 'Type a name or an exact value. Enter: done, Esc: clear.' : ''
    end

    def typing
      name = @pages.last[0]
      q = @query[name].to_s + Input.gets.to_s.gsub(/[[:cntrl:]]/, '')
      q = q[0...-1] if Input.repeatex?(:BACKSPACE)
      if Input.triggerex?(:ESCAPE)
        q = ''
        type(false)
      elsif Input.triggerex?(:RETURN) || Input.triggerex?(:KP_ENTER)
        type(false)
      end
      if q != @query[name].to_s
        @query[name] = q
        @pages[-1] = [name, 0, 0]
      end
      @rows = nil
      true
    end

    def run
      RpgmCheats.open = true
      @sprite = Sprite.new
      @sprite.z = 100_000
      @sprite.bitmap = Bitmap.new(Graphics.width, Graphics.height)
      loop do
        draw
        Graphics.update
        Input.update
        break unless handle
      end
    ensure
      Input.text_input = false if @typing
      @sprite.bitmap.dispose if @sprite && @sprite.bitmap
      @sprite.dispose if @sprite
      RpgmCheats.open = false
    end

    def handle
      return false if Input.trigger?(RpgmCheats.key(:F8))
      return typing if @typing
      if Input.trigger?(RpgmCheats.key(:B))
        @pages.pop
        @rows = nil
        @note = ''
        return !@pages.empty?
      end
      name, at, top = @pages.last
      list = rows
      at = (at + 1) % list.size if Input.repeat?(RpgmCheats.key(:DOWN)) && !list.empty?
      at = (at - 1) % list.size if Input.repeat?(RpgmCheats.key(:UP)) && !list.empty?
      fit = (Graphics.height - 3 * ROW) / ROW
      top = at if at < top
      top = at - fit + 1 if at >= top + fit
      @pages[-1] = [name, at, top]
      row = list[at]
      return true unless row
      act = if Input.trigger?(RpgmCheats.key(:C)) && row[:ok] then -> { row[:ok].call }
            elsif Input.repeat?(RpgmCheats.key(:RIGHT)) && row[:change] then -> { row[:change].call(1) }
            elsif Input.repeat?(RpgmCheats.key(:LEFT)) && row[:change] then -> { row[:change].call(-1) }
            end
      if act
        act.call
        @rows = nil
      end
      true
    end

    def draw
      b = @sprite.bitmap
      b.clear
      b.fill_rect(0, 0, b.width, b.height, Color.new(10, 10, 20, 220))
      b.font.size = 22
      name, at, top = @pages.last
      title = name == :main ? 'Cheats' : name
      b.draw_text(8, 0, b.width - 16, ROW, "#{title}  (arrows, Shift: x10, Enter, Esc: back, F8: close)")
      fit = (b.height - 3 * ROW) / ROW
      rows[top, fit].to_a.each_with_index do |r, i|
        y = ROW * (i + 1)
        b.fill_rect(4, y, b.width - 8, ROW, Color.new(255, 255, 255, 48)) if top + i == at
        b.draw_text(12, y, b.width - 24, ROW, r[:label].to_s)
        b.draw_text(12, y, b.width - 24, ROW, r[:value].to_s, 2) if r[:value]
      end
      b.draw_text(8, b.height - ROW, b.width - 16, ROW, @note)
    end
  end
end

if Object.const_defined?(:Input) && Input.respond_to?(:update) && !Input.respond_to?(:update_without_cheats)
  module Input
    class << self
      alias_method :update_without_cheats, :update

      def update(*args)
        result = update_without_cheats(*args)
        $rpgm_cheats_polled = true
        RpgmCheats.frame
        result
      end
    end
  end

  # Games that replace Input.update (LonaRPG's Hime AllKey) still get the menu, once a frame.
  if Object.const_defined?(:Graphics) && Graphics.respond_to?(:update)
    module Graphics
      class << self
        alias_method :update_without_cheats, :update

        def update(*args)
          RpgmCheats.frame unless $rpgm_cheats_polled
          $rpgm_cheats_polled = false
          update_without_cheats(*args)
        end
      end
    end
  end
end
