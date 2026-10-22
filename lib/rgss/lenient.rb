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
  end
end
