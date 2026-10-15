module Win32API_Impl
  module User32
    def self.game_width
      Graphics.width
    rescue StandardError
      640
    end

    def self.game_height
      Graphics.height
    rescue StandardError
      480
    end

    class GetWindowRect
      TITLEBAR = 24
      def call(args)
        memcpy_string(args[1],
                      [0, 0, User32.game_width, User32.game_height + TITLEBAR].pack('l4'))
        1
      end
    end

    class GetSystemMetrics
      SM_CXSCREEN = 0
      SM_CYSCREEN = 1
      def call(args)
        case args[0]
        when SM_CXSCREEN then User32.game_width
        when SM_CYSCREEN then User32.game_height
        else 0
        end
      end
    end

    class SystemParametersInfo
      SPI_GETWORKAREA = 0x30
      ROOM = 4
      def call(args)
        return 0 unless args[0] == SPI_GETWORKAREA
        memcpy_string(args[2],
                      [0, 0, User32.game_width * ROOM, User32.game_height * ROOM].pack('l4'))
        1
      end
    end

    class FindWindow
      def call(args)
        42
      end
    end

    class FindWindowEx
      def call(args)
        42
      end
    end

    class SetWindowLong
      GWL_STYLE = -16
      WS_CAPTION = 0x00C00000
      def call(args)
        return 0 unless args[1] == GWL_STYLE

        Graphics.fullscreen = (args[2].to_i & WS_CAPTION).zero?
        0
      rescue StandardError
        0
      end
    end
  end
end
