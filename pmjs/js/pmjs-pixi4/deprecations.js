// Pixi 4 prints a stack trace on every use of a deprecated name (Terrax uses
// DisplayObjectContainer on each map). A browser folds these into its console;
// here they flooded the terminal, so each message prints once.
(function() {
  var seen = {}, skipping = 0;
  var group = console.groupCollapsed, warn = console.warn, end = console.groupEnd;
  if (typeof group !== 'function') return;
  console.groupCollapsed = function(format, style, detailStyle, message) {
    if (skipping || /^%cDeprecation Warning/.test(format) && seen[message]) {
      skipping++;
      return;
    }
    if (/^%cDeprecation Warning/.test(format)) seen[message] = true;
    return group.apply(this, arguments);
  };
  console.warn = function() {
    if (!skipping) return warn.apply(this, arguments);
  };
  console.groupEnd = function() {
    if (skipping) skipping--;
    else return end.apply(this, arguments);
  };
})();
