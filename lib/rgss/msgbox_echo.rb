module Kernel
  def msgbox_echo_say(label, lines)
    $stdout.puts "--- #{label} ---"
    Array(lines).each { |l| $stdout.puts l }
    $stdout.puts '-' * (label.length + 8)
    $stdout.flush
  rescue StandardError
    nil
  end
  module_function :msgbox_echo_say

  alias_method :msgbox_without_echo, :msgbox

  def msgbox(*args)
    msgbox_echo_say('msgbox', args.join)
    msgbox_without_echo(*args)
  end
  module_function :msgbox

  if private_method_defined?(:msgbox_p) || method_defined?(:msgbox_p)
    alias_method :msgbox_p_without_echo, :msgbox_p

    def msgbox_p(*args)
      msgbox_echo_say('msgbox_p', args.map(&:inspect))
      msgbox_p_without_echo(*args)
    end
    module_function :msgbox_p
  end
end

at_exit do
  ex = $!
  if ex.nil?
    Kernel.msgbox_echo_say('exit', 'ruby finished with no exception pending')
  else
    Kernel.msgbox_echo_say('exit', ["#{ex.class}: #{ex.message}", *Array(ex.backtrace)])
  end
end
