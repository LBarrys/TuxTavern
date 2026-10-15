if Object.const_defined?(:Input) && Input.respond_to?(:update) &&
   Object.const_defined?(:Graphics) && Graphics.respond_to?(:update) &&
   !Input.respond_to?(:mkxp_native_update)

  module Input
    class << self
      alias_method :mkxp_native_update, :update
      alias_method :update_without_poll_mark, :update

      def update(*args)
        $rpgm_input_polled = true
        update_without_poll_mark(*args)
      end
    end
  end

  module Graphics
    class << self
      alias_method :update_without_input_poll, :update

      def update(*args)
        result = update_without_input_poll(*args)
        Input.mkxp_native_update unless $rpgm_input_polled
        $rpgm_input_polled = false
        result
      end
    end
  end
end
