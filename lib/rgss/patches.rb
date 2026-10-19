module RpgmPatches
  RAW_KEYS = 'module Input; class << self; alias_method :rpgm_update, :update; ' \
             'alias_method :rpgm_raw_key_states, :raw_key_states; ' \
             'def raw_key_states; rpgm_update; rpgm_raw_key_states; end; end; end; '

  RULES = [
    { name: 'Auto Font Install removed: mkxp-z loads Fonts/ itself',
      when: ['# ** Auto Font Install'], remove: true },
    { name: 'Steam ownership check removed',
      when: ['exit if steam.is_subscribed != true'], sub: [['exit if steam.is_subscribed != true', '']] },
    { name: 'wfcrypt removed: it needs a Windows DLL',
      when: ['Win32API.new("wfcrypt"'], remove: true },
    { name: 'KGC_BitmapExtension removed: it needs TRGSSX.dll',
      when: ['ビットマップ拡張 - KGC_BitmapExtension ◆ XP/VX'], remove: true },
    { name: 'winmm joystick input removed: it needs a Windows DLL',
      when: ['Input 入力拡張スクリプト'], remove: true },
    { name: 'frozen text copied with dup instead of clone',
      when: [/\.to_s\.clone\b/], sub: [[/\.to_s\.clone\b/, '.to_s.dup']] },
    { name: 'Pokemon Essentials: input refreshed before raw_key_states',
      when: ['def pbSameThread(', 'module Input'], sub: [['def pbSameThread(', RAW_KEYS + 'def pbSameThread(']] },
  ].freeze

  def self.say(text)
    $stdout.puts "tuxtavern: #{text}"
    $stdout.flush
  rescue StandardError
    nil
  end

  def self.matches?(src, rule)
    rule[:when].all? { |m| m.is_a?(Regexp) ? m.match?(src) : src.include?(m) }
  end

  def self.apply(src, rule)
    return '' if rule[:remove]
    rule[:sub].inject(src) { |s, (from, to)| s.gsub(from, to) }
  end

  def self.patch(scripts)
    scripts.each do |script|
      next unless script.is_a?(Array) && script[3].is_a?(String)
      RULES.each do |rule|
        begin
          next unless matches?(script[3], rule)
          script[3] = apply(script[3], rule)
          say "#{script[1]}: #{rule[:name]}"
        rescue ArgumentError, EncodingError
          next
        end
      end
    end
  end

  def self.user_scripts(dir)
    Dir.children(dir).select { |n| n =~ /\.tuxtavern\.rb\z/i }.sort.map { |n| File.join(dir, n) }
  rescue SystemCallError
    []
  end

  def self.add_user_scripts(scripts, dir)
    files = user_scripts(dir)
    return if files.empty?
    usable = scripts.select { |s| s.is_a?(Array) && s[3].is_a?(String) }
    main = usable.reverse.find { |s| s[1].to_s.strip.casecmp?('main') } ||
           usable.reverse.find { |s| !s[3].strip.empty? }
    return if main.nil?
    main[3] = files.map { |f| "load #{File.expand_path(f).dump}" }.join('; ') + "\n" + main[3]
    files.each { |f| say "#{File.basename(f)} runs before #{main[1]}" }
  end
end

if $RGSS_SCRIPTS.is_a?(Array)
  RpgmPatches.patch($RGSS_SCRIPTS)
  RpgmPatches.add_user_scripts($RGSS_SCRIPTS, Dir.pwd)
end
