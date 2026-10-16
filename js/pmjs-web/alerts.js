'use strict';

// Nothing draws HTML here, so a sweetalert2 dialog (Karryn's Prison's mod manager and FastCutIns
// use window.Alert) prints its title and text and resolves as dismissed, instead of failing to
// build its markup.
(function() {
  function text(value) {
    if (value && typeof value === 'object') value = value.textContent;
    return String(value === undefined || value === null ? '' : value)
      .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function adapt(module) {
    var dialogs = module && module.default && typeof module.default.fire === 'function' ? module.default : module;
    if (!dialogs || typeof dialogs.fire !== 'function' || typeof dialogs.isVisible !== 'function' ||
        dialogs.__pmjsPrinted) return;
    var reason = dialogs.DismissReason && dialogs.DismissReason.cancel || 'cancel';
    dialogs.fire = function(options, html, icon) {
      if (!options || typeof options !== 'object') options = { title: options, html: html, icon: icon };
      console.warn('[pmjs] dialog' + (options.icon ? ' (' + options.icon + ')' : '') + ': ' +
        [options.title, options.text, options.html].map(text).filter(Boolean).join(' - '));
      return Promise.resolve({ isConfirmed: false, isDenied: false, isDismissed: true, dismiss: reason });
    };
    dialogs.mixin = function() { return dialogs; };
    dialogs.isVisible = function() { return false; };
    dialogs.getConfirmButton = function() { return null; };
    ['clickConfirm', 'clickCancel', 'clickDeny', 'close', 'showLoading', 'hideLoading', 'update']
      .forEach(function(name) { dialogs[name] = function() {}; });
    dialogs.__pmjsPrinted = true;
  }
  ['Alert', 'Swal'].forEach(function(name) {
    var value = globalThis[name];
    adapt(value);
    Object.defineProperty(globalThis, name, { configurable: true, enumerable: true,
      get: function() { return value; },
      set: function(next) { adapt(next); value = next; } });
  });
})();
