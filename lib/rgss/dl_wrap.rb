unless defined?(::DL)
  module DL
    class Buffer
      def initialize(size, bytes = nil)
        @bytes = (bytes || '').to_s.b.ljust(size, "\0")[0, size]
      end

      def to_i
        self
      end

      def [](index, length = nil)
        return @bytes.byteslice(index, length) if length

        @bytes.getbyte(index)
      end

      def []=(index, value)
        if value.is_a?(String)
          value.bytes.each_with_index { |b, i| @bytes.setbyte(index + i, b) }
        else
          @bytes.setbyte(index, value.to_i & 0xFF)
        end
        value
      end

      def getbyte(index)
        @bytes.getbyte(index)
      end

      def setbyte(index, value)
        @bytes.setbyte(index, value.to_i & 0xFF)
      end

      def size
        @bytes.bytesize
      end
      alias length size

      def to_s
        @bytes.dup
      end
      alias to_str to_s

      def free; end
      alias ptr to_i
      alias ref to_i
    end

    class CPtr
      def self.new(buffer, size = nil)
        return buffer if buffer.is_a?(Buffer)

        Buffer.new(size || 256, buffer)
      end

      def self.malloc(size)
        Buffer.new(size)
      end
    end

    CPtr::TYPE_VOIDP = 0 unless defined?(CPtr::TYPE_VOIDP)

    def self.malloc(size)
      Buffer.new(size)
    end
  end

  ::DL::CPtr::SIZEOF_VOIDP = 8 unless defined?(::DL::CPtr::SIZEOF_VOIDP)
end
