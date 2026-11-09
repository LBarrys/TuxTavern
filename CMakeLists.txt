cmake_minimum_required(VERSION 3.20)
project(tuxtavern VERSION 0.1.0 LANGUAGES NONE)
enable_testing()

# The launcher and its library; before pmjs/, whose install manifest lists every installed file.
install(PROGRAMS tt DESTINATION bin)
install(DIRECTORY lib/ DESTINATION share/tuxtavern)
add_subdirectory(pmjs)
