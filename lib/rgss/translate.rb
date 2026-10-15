module RpgmTranslate
  # Fills in empty translations one at a time with a command that reads the
  # text on stdin and prints its translation; polled every frame, never waited
  # on, and stopped at the first failure.
  class Machine
    attr_reader :done

    def initialize(cmd)
      @cmd = cmd
      @tried = {}
      @queue = []
      @done = []
    end

    def want(dict)
      dict.each { |k, v| next unless v.empty? && !@tried[k]; @tried[k] = true; @queue << k }
    end

    def poll
      return if @off
      return start unless @io
      chunk = @io.read_nonblock(65536, exception: false)
      return if chunk == :wait_readable
      return @out << chunk if chunk
      @io.close
      v = @out.force_encoding(Encoding::UTF_8).sub(/\r?\n\z/, '')
      if !$?.success? || !v.valid_encoding?
        @off = true
        $stdout.puts 'tuxtavern: machine translation stopped: the command failed'
      elsif !v.strip.empty? && v != @text
        @done << [@text, v]
      end
      @io = nil
    end

    def start
      return if @queue.empty?
      @text = @queue.shift
      @out = ''.b
      @io = IO.popen(@cmd, 'r+b')
      @io.write(@text.b)
      @io.close_write
    rescue SystemCallError, IOError => e
      @off = true
      $stdout.puts "tuxtavern: machine translation stopped: #{e.message}"
    end
  end

  PAIR = /\G\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*(,|\})/m
  ESCAPES = { 'n' => "\n", 't' => "\t", 'r' => "\r", 'b' => "\b", 'f' => "\f", '/' => '/', '\\' => '\\', '"' => '"' }.freeze

  class << self
    attr_reader :dict, :fresh

    def unescape(s)
      s.gsub(/\\u([dD][89abAB]\h\h)\\u([dD][c-fC-F]\h\h)|\\u(\h{4})|\\(.)/m) do
        if $1 then (((($1.hex - 0xD800) << 10) | ($2.hex - 0xDC00)) + 0x10000).chr(Encoding::UTF_8)
        elsif $3 then $3.hex.chr(Encoding::UTF_8)
        else ESCAPES.fetch($4) { raise ArgumentError, "bad escape \\#{$4}" }
        end
      end
    end

    def quote(s)
      '"' + s.gsub(/["\\\x00-\x1f]/) { |c| { '"' => '\\"', '\\' => '\\\\', "\n" => '\\n', "\t" => '\\t', "\r" => '\\r', "\b" => '\\b', "\f" => '\\f' }[c] || format('\\u%04x', c.ord) } + '"'
    end

    def parse(text)
      text = text.b.sub(/\A\xEF\xBB\xBF/n, '').force_encoding(Encoding::UTF_8)
      raise ArgumentError, 'not valid UTF-8' unless text.valid_encoding?
      out = {}
      body = text.strip
      return out if body.empty?
      raise ArgumentError, 'expected a JSON object of "text": "translation"' unless body.start_with?('{')
      return out if body =~ /\A\{\s*\}\z/
      pos = 1
      loop do
        m = PAIR.match(body, pos)
        raise ArgumentError, "unreadable entry near character #{pos}" unless m
        out[unescape(m[1])] = unescape(m[2])
        pos = m.end(0)
        break if m[3] == '}'
      end
      raise ArgumentError, 'text after the closing }' unless body[pos..-1].strip.empty?
      out
    end

    def read(file)
      File.exist?(file) ? parse(File.binread(file)) : {}
    end

    def write(file, dict)
      body = dict.empty? ? "{}\n" : "{\n" + dict.map { |k, v| "  #{quote(k)}: #{quote(v)}" }.join(",\n") + "\n}\n"
      File.binwrite("#{file}.tuxtavern-tmp", body)
      File.rename("#{file}.tuxtavern-tmp", file)
    end

    def start(file, cmd = nil)
      @file = file
      @mt = Machine.new(cmd) if cmd && !cmd.empty?
      @dict = read(file)
      @outputs = @dict.values.reject(&:empty?).to_h { |v| [v, true] }
      @fresh = []
      @mtime = nil
      @frames = 0
    end

    def tr(s)
      return s unless s.is_a?(String) && !s.empty?
      key = s.encoding == Encoding::UTF_8 ? s : s.dup.force_encoding(Encoding::UTF_8)
      return s unless key.valid_encoding?
      if @dict.key?(key)
        v = @dict[key]
        return v.empty? ? s : v
      end
      if !@outputs.key?(key) && key.length > 1 && key =~ /\p{L}/
        @dict[key] = ''
        @fresh << key
      end
      s
    end

    def learn(k, v)
      return if v.empty?
      @dict[k] = v
      @outputs[v] = true
    end

    def sync
      mtime = (File.mtime(@file) rescue nil)
      done = @mt ? @mt.done : []
      return if @fresh.empty? && done.empty? && mtime == @mtime
      disk = (read(@file) rescue nil)
      return unless disk
      disk.each { |k, v| learn(k, v) }
      changed = false
      @fresh.each { |k| next if disk.key?(k); disk[k] = ''; changed = true }
      @fresh.clear
      done.each { |k, v| next unless disk[k] == ''; disk[k] = v; learn(k, v); changed = true }
      done.clear
      write(@file, disk) if changed
      @mt.want(disk) if @mt
      @mtime = (File.mtime(@file) rescue nil)
    end

    def frame
      install
      @mt.poll if @mt
      @frames += 1
      sync if (@frames % 120).zero?
    end

    def install
      return if @installed
      return unless Object.const_defined?(:Window_Base)
      v = ENV['TUXTAVERN_RGSS_VERSION'].to_i
      if Window_Base.method_defined?(:convert_escape_characters)
        Window_Base.prepend(Module.new { def convert_escape_characters(text, *r) super(RpgmTranslate.tr(text), *r) end })
      elsif v == 2 && Object.const_defined?(:Window_Message)
        Window_Message.prepend(Module.new do
          def start_message
            $game_message.texts.map! { |t| RpgmTranslate.tr(t) }
            super
          end
        end)
      elsif Object.const_defined?(:Window_Message)
        Window_Message.prepend(Module.new do
          def refresh
            $game_temp.message_text = RpgmTranslate.tr($game_temp.message_text) if $game_temp && $game_temp.message_text
            super
          end
        end)
      end
      @installed = true
    end
  end

  def self.hook_bitmap
    return unless Object.const_defined?(:Bitmap) && !Bitmap.method_defined?(:draw_text_without_translate)
    Bitmap.class_eval do
      alias_method :draw_text_without_translate, :draw_text
      def draw_text(*args)
        i = args[0].is_a?(Rect) ? 1 : 4
        args[i] = RpgmTranslate.tr(args[i]) if args[i].is_a?(String) && args[i].length > 1
        draw_text_without_translate(*args)
      end
    end
  end
end

file = ENV['TUXTAVERN_TRANSLATE'].to_s
unless file.empty?
  begin
    RpgmTranslate.start(file, ENV['TUXTAVERN_TRANSLATOR'])
    RpgmTranslate.hook_bitmap
    module Input
      class << self
        alias_method :update_without_translate, :update

        def update(*args)
          result = update_without_translate(*args)
          RpgmTranslate.frame
          result
        end
      end
    end
    at_exit { RpgmTranslate.sync rescue nil }
  rescue StandardError => e
    $stdout.puts "tuxtavern: #{file}: #{e.message}; translation is off and the file is left alone"
  end
end
