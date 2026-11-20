'use strict';

// Nothing draws HTML here, so a sweetalert2 dialog (Karryn's Prison's mod manager, ModsSettings
// and FastCutIns use window.Alert) prints its title and text and resolves as dismissed, instead
// of failing to build its markup. A dialog that asks for a value (ModsSettings' "Enter value" and
// "Choose value") asks through the game's native prompt instead, so the setting can be changed.
(function() {
  function text(value) {
    if (value && typeof value === 'object') value = value.textContent;
    return String(value === undefined || value === null ? '' : value)
      .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function message(options) {
    return [options.title, options.titleText, options.text, options.html].map(text).filter(Boolean).join(' - ');
  }
  function choices(options) {
    var list = options.inputOptions instanceof Map ? Array.from(options.inputOptions)
      : Object.keys(options.inputOptions || {}).map(function(key) { return [key, options.inputOptions[key]]; });
    return list.map(function(entry) { return { value: String(entry[0]), label: text(entry[1]) }; });
  }
  // A number from the list, a choice's label or its value; undefined when none matches.
  function choose(list, answer) {
    answer = String(answer).trim();
    var index = /^\d+$/.test(answer) ? Number(answer) - 1 : -1;
    if (list[index]) return list[index].value;
    var found = list.filter(function(item) { return item.label === answer || item.value === answer; })[0];
    return found ? found.value : undefined;
  }
  function ask(options, reason) {
    var dismissed = { isConfirmed: false, isDenied: false, isDismissed: true, dismiss: reason };
    var title = message(options), current = options.inputValue === undefined ? '' : String(options.inputValue);
    var list = /^(select|radio)$/.test(options.input) ? choices(options) : null;
    if (list) {
      title += '\n' + list.map(function(item, index) { return (index + 1) + '. ' + item.label; }).join('\n');
      var selected = list.findIndex(function(item) { return item.value === current; });
      current = selected < 0 ? '' : String(selected + 1);
    }
    var error = '';
    return (function attempt() {
      var answer;
      if (options.input === 'checkbox') answer = globalThis.confirm((error ? error + '\n' : '') + title) ? 1 : 0;
      else {
        answer = globalThis.prompt((error ? error + '\n' : '') + title, current);
        if (answer === null) return Promise.resolve(dismissed);
        current = answer;
        if (list) {
          answer = choose(list, answer);
          if (answer === undefined) { error = 'Choose one of the numbers below.'; return attempt(); }
        }
      }
      return Promise.resolve(options.inputValidator ? options.inputValidator(answer) : null).then(function(invalid) {
        if (invalid) { error = text(invalid); return attempt(); }
        return Promise.resolve(options.preConfirm ? options.preConfirm(answer) : undefined).then(function(value) {
          if (value === false) return dismissed;
          return { isConfirmed: true, isDenied: false, isDismissed: false, value: value === undefined ? answer : value };
        });
      });
    })();
  }
  function adapt(module) {
    var dialogs = module && module.default && typeof module.default.fire === 'function' ? module.default : module;
    if (!dialogs || typeof dialogs.fire !== 'function' || typeof dialogs.isVisible !== 'function' ||
        dialogs.__pmjsPrinted) return;
    var reason = dialogs.DismissReason && dialogs.DismissReason.cancel || 'cancel';
    dialogs.fire = function(options, html, icon) {
      if (!options || typeof options !== 'object') options = { title: options, html: html, icon: icon };
      if (options.input && typeof globalThis.prompt === 'function') return ask(options, reason);
      console.warn('[pmjs] dialog' + (options.icon ? ' (' + options.icon + ')' : '') + ': ' + message(options));
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
