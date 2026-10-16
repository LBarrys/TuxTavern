module RpgmShims
  def self.mkxpz_preload
    candidates = [ENV['TUXTAVERN_MKXPZ_PRELOAD']]
    %w[/usr/local /usr].each { |p| candidates << "#{p}/lib/mkxp-z/scripts/preload" }
    candidates << "#{ENV['HOME']}/.local/lib/mkxp-z/scripts/preload" if ENV['HOME']
    candidates << 'scripts/preload'
    candidates.compact.find { |dir| File.file?("#{dir}/win32_wrap.rb") }
  end

  def self.shim_dir
    [ENV['TUXTAVERN_SHIM_DIR'],
     File.dirname(File.expand_path(__FILE__))]
      .compact.find { |dir| File.file?("#{dir}/lenient.rb") }
  end

  def self.skipped
    @skipped ||= ENV['TUXTAVERN_RGSS_SKIP'].to_s.split(/[\s,]+/).reject(&:empty?)
  end

  def self.load_one(dir, name)
    return false if dir.nil?
    return false if skipped.include?(name)

    path = "#{dir}/#{name}.rb"
    return false unless File.file?(path)

    load path
    true
  rescue Exception => e
    warning = "tuxtavern: #{name}.rb did not load: #{e.class}: #{e.message}"
    begin
      $stdout.puts warning
      $stdout.flush
    rescue StandardError
      nil
    end
    false
  end
end

mkxpz = RpgmShims.mkxpz_preload
here = RpgmShims.shim_dir

RpgmShims.load_one(here, 'ruby18')
RpgmShims.load_one(here, 'msgbox_echo')

RpgmShims.load_one(mkxpz, 'win32_wrap')
RpgmShims.load_one(mkxpz, 'kgl2_wrap')

RpgmShims.load_one(here, 'dl_wrap')
RpgmShims.load_one(here, 'textmode')
RpgmShims.load_one(here, 'user32_wrap')
RpgmShims.load_one(here, 'ini_wrap')
RpgmShims.load_one(here, 'input_poll')

RpgmShims.load_one(here, 'lenient')
RpgmShims.load_one(here, 'patches')
RpgmShims.load_one(here, 'cheats') unless ENV['TUXTAVERN_CHEAT'].to_s.empty?

if mkxpz.nil?
  begin
    $stdout.puts 'tuxtavern: mkxp-z\'s win32_wrap.rb was not found; Win32API calls will raise.'
    $stdout.puts 'tuxtavern: set TUXTAVERN_MKXPZ_PRELOAD to the folder holding it.'
    $stdout.flush
  rescue StandardError
    nil
  end
end
