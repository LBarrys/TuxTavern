find_program(NODE_EXECUTABLE node REQUIRED)

install(TARGETS pmjs_native LIBRARY DESTINATION lib)
install(PROGRAMS tuxtavern DESTINATION bin)
install(PROGRAMS tools/pmjs.sh DESTINATION bin RENAME pmjs)
install(DIRECTORY lib/ DESTINATION share/tuxtavern)
install(DIRECTORY js runner DESTINATION share/pmjs
  FILES_MATCHING PATTERN "*.js" PATTERN "*.cjs" PATTERN "*.json" PATTERN "*.ttf" PATTERN "*.LICENSE")
install(FILES tools/build-js-runtime.mjs tools/game-inspect.mjs tools/pmjs.mjs
  tools/package-self-test.cjs DESTINATION share/pmjs/tools)
install(FILES LICENSE THIRD_PARTY_NOTICES.md DESTINATION .)
install(DIRECTORY third_party/ DESTINATION share/pmjs/notices FILES_MATCHING PATTERN "*.LICENSE")

configure_file(cmake/build-config.json.in build-config.json @ONLY)
install(CODE "execute_process(COMMAND \"${NODE_EXECUTABLE}\" \"${CMAKE_CURRENT_SOURCE_DIR}/tools/install-manifest.mjs\"
  \"\$ENV{DESTDIR}\${CMAKE_INSTALL_PREFIX}\" \"${CMAKE_CURRENT_BINARY_DIR}\" \"${CMAKE_CURRENT_SOURCE_DIR}\"
  COMMAND_ERROR_IS_FATAL ANY)")
