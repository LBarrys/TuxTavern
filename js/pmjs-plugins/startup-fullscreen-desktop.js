'use strict';

(function() {
  // These plugins check Utils.isNwjs() once at load: StartUpFullScreen to go fullscreen,
  // Satisfy Him's maka-constants to enable save naming instead of alerting "Running in browser".
  var desktopPlugins = ['startupfullscreen', 'maka-constants'];
  PMJS.phases.on('beforePlugins', 'pmjs.startup-fullscreen.desktop', function() {
    var load = PluginManager.loadScript;
    PluginManager.loadScript = function(name) {
      if (desktopPlugins.indexOf(String(name).replace(/\.js$/i, '').toLowerCase()) < 0) {
        return load.apply(this, arguments);
      }
      var isNwjs = Utils.isNwjs;
      Utils.isNwjs = function() { return true; };
      try { return load.apply(this, arguments); }
      finally { Utils.isNwjs = isNwjs; }
    };
  });
})();
