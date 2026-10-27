{
  'Sprite' => %i[visible mirror],
  'Window' => %i[visible active pause openness_visible arrows_visible],
  'Plane' => %i[visible],
  'Viewport' => %i[visible],
  'Tilemap' => %i[visible],
  'Font' => %i[bold italic outline shadow],
}.each do |class_name, setters|
  next unless Object.const_defined?(class_name)
  klass = Object.const_get(class_name)
  setters.each do |s|
    next unless klass.method_defined?(:"#{s}=")
    next if klass.method_defined?(:"#{s}_without_coercion=")
    klass.class_eval(<<~RUBY, __FILE__, __LINE__ + 1)
      alias_method :#{s}_without_coercion=, :#{s}=
      def #{s}=(value)
        self.#{s}_without_coercion = value ? true : false
      end
    RUBY
  end
end

if Object.const_defined?(:Win32API) && Win32API.method_defined?(:mkxp_native_call)
  class Win32API
    alias_method :initialize_without_odd_names, :initialize

    def initialize(dll, func, *args)
      initialize_without_odd_names(dll, func, *args)
    rescue NameError
      @dll = dll
      @func = func
      @called = false
      @mkxp_wrap_impl = nil
      @kgl2_wrap_impl = nil
      @mkxp_native_available = false
    end

    alias_method :call_without_frozen_receiver, :call

    # Nettle Tribe's Input-EX freezes its Win32API objects. mkxp-z marks a call it can only
    # tolerate (a Windows DLL) in @called, which raises FrozenError on a frozen object; RGSS
    # never wrote to it. Tolerate it the same way, logging once per function.
    def call(*args)
      unless frozen? && TOLERATE_ERRORS && !@mkxp_wrap_impl && !@kgl2_wrap_impl && !@mkxp_native_available
        return call_without_frozen_receiver(*args)
      end
      @@tuxtavern_frozen_calls ||= {}
      unless @@tuxtavern_frozen_calls["#{@dll}:#{@func}"]
        @@tuxtavern_frozen_calls["#{@dll}:#{@func}"] = true
        $stdout.puts("[Win32API] [#{@dll}:#{@func}] #{args}")
      end
      0
    end
  end
end
