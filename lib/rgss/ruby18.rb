if ENV['TUXTAVERN_RGSS_VERSION'].to_i.between?(1, 2)
  module RpgmRuby18
    class Names < Array
      def include?(name)
        super(name.is_a?(String) ? name.to_sym : name)
      end
    end

    def self.wrap_lists(klass, names)
      names.each do |m|
        next if klass.method_defined?(:"#{m}_without_ruby18")
        klass.class_eval(<<~RUBY, __FILE__, __LINE__ + 1)
          alias_method :#{m}_without_ruby18, :#{m}
          def #{m}(*args)
            RpgmRuby18::Names.new(#{m}_without_ruby18(*args))
          end
        RUBY
      end
    end
  end

  class Object
    def type
      self.class
    end
  end
  RpgmRuby18.wrap_lists(Object, %i[methods singleton_methods public_methods private_methods])
  RpgmRuby18.wrap_lists(Module, %i[instance_methods public_instance_methods private_instance_methods protected_instance_methods])

  class Array
    def nitems
      count { |x| !x.nil? }
    end unless method_defined?(:nitems)

    def choice
      sample
    end unless method_defined?(:choice)
  end
end

class Hash
  def index(value)
    key(value)
  end unless method_defined?(:index)
end
