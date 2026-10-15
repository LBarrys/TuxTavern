module Win32API_Impl
  module Kernel32
    def self.read(path)
      File.open(path, 'rb') { |f| f.read } rescue nil
    end

    def self.table(path)
      st = File.stat(path) rescue nil
      return nil unless st
      @tables ||= {}
      hit = @tables[path]
      return hit[2] if hit && hit[0] == st.mtime && hit[1] == st.size
      data = read(path)
      return nil unless data
      table = {}
      current = nil
      data.each_line do |line|
        line = line.strip
        next if line.empty? || line.start_with?(';', '#')
        if line =~ /\A\[(.*)\]\z/
          current = $1.strip.downcase
        elsif current && line.include?('=')
          k, v = line.split('=', 2)
          (table[current] ||= {})[k.to_s.strip.downcase] ||= v.to_s.strip
        end
      end
      @tables[path] = [st.mtime, st.size, table]
      table
    end

    def self.lookup(path, section, key)
      table = table(path.to_s)
      table && (table[section.to_s.strip.downcase] || {})[key.to_s.strip.downcase]
    end

    def self.store(path, section, key, value)
      path = path.to_s
      data = read(path) || ''
      want_section = section.to_s.strip.downcase
      want_key = key.to_s.strip.downcase
      lines = data.split(/\r?\n/, -1)
      out = []
      current = nil
      done = false
      section_end = nil
      lines.each do |line|
        stripped = line.strip
        if stripped =~ /\A\[(.*)\]\z/
          section_end = out.size if current == want_section && !done
          current = $1.strip.downcase
        elsif !done && current == want_section && stripped.include?('=')
          k, = stripped.split('=', 2)
          if k.to_s.strip.downcase == want_key
            out << "#{key}=#{value}"
            done = true
            next
          end
        end
        out << line
      end
      unless done
        if section_end
          out.insert(section_end, "#{key}=#{value}")
        elsif current == want_section
          out << "#{key}=#{value}"
        else
          out << '' unless out.empty? || out.last.to_s.strip.empty?
          out << "[#{section}]"
          out << "#{key}=#{value}"
        end
      end
      File.open(path, 'wb') { |f| f.write(out.join("\r\n")) }
      @tables.delete(path) if @tables
      true
    rescue StandardError
      false
    end

    class GetPrivateProfileInt
      def call(args)
        section, key, default, file = args
        value = Kernel32.lookup(file, section, key)
        return default.to_i if value.nil?
        (value[/\A[+-]?\d+/] || default).to_i
      end
    end

    class GetPrivateProfileStringA
      def call(args)
        section, key, default, buffer, size, file = args
        value = Kernel32.lookup(file, section, key) || default.to_s
        size = size.to_i
        value = value[0, size - 1] if size > 0 && value.length >= size
        if buffer.is_a?(String)
          padded = value + "\0" * [buffer.bytesize - value.bytesize, 1].max
          buffer[0, buffer.bytesize] = padded[0, buffer.bytesize]
        end
        value.length
      end
    end

    class WritePrivateProfileStringA
      def call(args)
        section, key, value, file = args
        Kernel32.store(file, section, key, value.to_s.split("\0").first.to_s) ? 1 : 0
      end
    end

    GetPrivateProfileString = GetPrivateProfileStringA
    WritePrivateProfileString = WritePrivateProfileStringA
  end
end
