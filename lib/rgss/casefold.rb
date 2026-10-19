# Windows file names ignore case, and games rely on it (LonaRPG loads
# Data/HCGframes/Grab_eventExt1_Grab.rb, saved as Grab_EventExt1_Grab.rb). A path the game's own Ruby
# code names that does not exist is looked up folder by folder ignoring case; mkxp-z already does so
# for the graphics and sounds it loads.
module RpgmCasefold
  @children = {}

  def self.children(dir)
    mtime = File.mtime_without_casefold(dir)
    hit = @children[dir]
    return hit[1] if hit && hit[0] == mtime
    names = Dir.children(dir)
    @children[dir] = [mtime, names]
    names
  rescue SystemCallError
    []
  end

  def self.resolve(path)
    return path unless path.is_a?(String) && !path.empty? && !File.exist_without_casefold?(path)
    parts = path.split('/')
    dir = parts.first == '' ? '/' : '.'
    found = []
    parts.each_with_index do |part, i|
      if part == '' || part == '.' || part == '..'
        found << part
        dir = part == '' ? dir : File.join(dir, part)
        next
      end
      last = i == parts.size - 1
      here = File.join(dir, part)
      unless last ? File.exist_without_casefold?(here) : File.directory_without_casefold?(here)
        match = children(dir).find do |name|
          name.casecmp?(part) && (last || File.directory_without_casefold?(File.join(dir, name)))
        end
        part = match if match
        here = File.join(dir, part)
      end
      found << part
      dir = here
    end
    found.join('/')
  end
end

unless File.respond_to?(:exist_without_casefold?)
  class << File
    alias_method :exist_without_casefold?, :exist?
    alias_method :directory_without_casefold?, :directory?
    alias_method :mtime_without_casefold, :mtime

    %i[open read readlines foreach binread write binwrite exist? exists? file? directory? size size? mtime stat].each do |name|
      next unless method_defined?(name)
      original = :"#{name.to_s.delete('?')}_before_casefold#{name.to_s.end_with?('?') ? '?' : ''}"
      alias_method original, name
      define_method(name) do |path, *rest, **opts, &block|
        __send__(original, RpgmCasefold.resolve(path), *rest, **opts, &block)
      end
    end
  end

  class << Dir
    alias_method :exist_before_casefold?, :exist?
    def exist?(path)
      exist_before_casefold?(RpgmCasefold.resolve(path))
    end
  end

  class << FileTest
    %i[exist? exists? file? directory? size size?].each do |name|
      next unless method_defined?(name)
      original = :"#{name.to_s.delete('?')}_before_casefold#{name.to_s.end_with?('?') ? '?' : ''}"
      alias_method original, name
      define_method(name) do |path, *rest|
        __send__(original, RpgmCasefold.resolve(path), *rest)
      end
    end
  end
end
