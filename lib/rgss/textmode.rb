module RpgmTextMode
  def self.read_text?(mode)
    case mode
    when nil then true
    when String then mode.split(':', 2).first == 'r'
    else false
    end
  end

  def self.decorate(name, mode, opts)
    return opts if name.is_a?(String) && name.start_with?('|')
    return opts if opts.key?(:universal_newline) || opts.key?(:newline)
    return opts if opts[:binmode] || opts[:textmode]
    return opts unless read_text?(opts.key?(:mode) ? opts[:mode] : mode)

    opts.merge(universal_newline: true)
  end

end

unless File.respond_to?(:open_without_textmode)
  class << File
    alias_method :open_without_textmode, :open
    alias_method :read_without_textmode, :read
    alias_method :readlines_without_textmode, :readlines
    alias_method :foreach_without_textmode, :foreach

    def open(name, mode = nil, *rest, **opts, &block)
      open_without_textmode(name, *[mode, *rest].compact, **RpgmTextMode.decorate(name, mode, opts), &block)
    end

    def read(name, *rest, **opts)
      read_without_textmode(name, *rest, **RpgmTextMode.decorate(name, nil, opts))
    end

    def readlines(name, *rest, **opts)
      readlines_without_textmode(name, *rest, **RpgmTextMode.decorate(name, nil, opts))
    end

    def foreach(name, *rest, **opts, &block)
      foreach_without_textmode(name, *rest, **RpgmTextMode.decorate(name, nil, opts), &block)
    end
  end

  module Kernel
    alias_method :open_without_textmode, :open
    private :open_without_textmode

    def open(name, mode = nil, *rest, **opts, &block)
      if name.respond_to?(:to_open) || (name.is_a?(String) && name.start_with?('|'))
        return open_without_textmode(name, *[mode, *rest].compact, **opts, &block)
      end

      open_without_textmode(name, *[mode, *rest].compact, **RpgmTextMode.decorate(name, mode, opts), &block)
    end
    private :open
  end
end
