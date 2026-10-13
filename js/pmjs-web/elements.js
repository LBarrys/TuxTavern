function ImageData(data, width, height) {
  if (arguments.length < 2) throw new TypeError('ImageData requires two arguments');
  // Tested by tag: a worker's arrays come from its own context (see workers.js).
  var suppliedPixels = Object.prototype.toString.call(data) === '[object Uint8ClampedArray]';
  if (!suppliedPixels) {
    height = +width >>> 0;
    width = +data >>> 0;
    if (!width || !height) throw canvasIndexSizeError('ImageData dimensions must be nonzero');
    data = new Uint8ClampedArray(width * height * 4);
  } else {
    width = +width >>> 0;
    if (!width || !data.length || data.length % (width * 4)) {
      throw canvasIndexSizeError('ImageData data does not form complete rows');
    }
    var inferredHeight = data.length / (width * 4);
    height = height === undefined ? inferredHeight : +height >>> 0;
    if (!height || height !== inferredHeight) throw canvasIndexSizeError('ImageData height does not match data');
  }
  if (Object.prototype.toString.call(data) !== '[object Uint8ClampedArray]' || width <= 0 || height <= 0 ||
      data.length !== width * height * 4) {
    throw new TypeError('invalid ImageData constructor arguments');
  }
  this.data = data;
  this.width = width;
  this.height = height;
}
globalThis.ImageData = ImageData;

// element.style keeps plain properties, plus the methods plugins call on it.
function CSSStyleDeclaration() {}
function cssStyleKey(name) {
  // Custom properties (--x) keep their name; others become style.backgroundColor and so on.
  name = String(name);
  return name.indexOf('--') === 0 ? name :
    name.replace(/-([a-z])/g, function(_, letter) { return letter.toUpperCase(); });
}
CSSStyleDeclaration.prototype.setProperty = function(name, value) {
  this[cssStyleKey(name)] = value === null || value === undefined ? '' : String(value);
};
CSSStyleDeclaration.prototype.getPropertyValue = function(name) {
  var value = this[cssStyleKey(name)];
  return value === undefined || value === null ? '' : String(value);
};
CSSStyleDeclaration.prototype.removeProperty = function(name) {
  var value = this.getPropertyValue(name);
  delete this[cssStyleKey(name)];
  return value;
};
globalThis.CSSStyleDeclaration = CSSStyleDeclaration;

function base64Bytes(bytes) {
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var encoded = '';
  for (var index = 0; index < bytes.length; index += 3) {
    var first = bytes[index];
    var second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    var third = index + 2 < bytes.length ? bytes[index + 2] : 0;
    encoded += alphabet[first >> 2];
    encoded += alphabet[(first & 3) << 4 | second >> 4];
    encoded += index + 1 < bytes.length ?
      alphabet[(second & 15) << 2 | third >> 6] : '=';
    encoded += index + 2 < bytes.length ? alphabet[third & 63] : '=';
  }
  return encoded;
}

function CanvasElement() {
  EventTarget.call(this);
  this._width = 300;
  this._height = 150;
  this.__pmjsContentRevision = 0;
  this.style = new CSSStyleDeclaration();
  this.screencanvas = false;
  this._context2d = null;
  this._nativeCanvas = null;
}

CanvasElement.prototype = Object.create(EventTarget.prototype);
CanvasElement.prototype.constructor = CanvasElement;
CanvasElement.prototype._pmjsContentChanged = function() {
  this.__pmjsContentRevision++;
};
CanvasElement.prototype._releaseNativeCanvas = function() {
  if (this._pmjsPrimitiveContent) this._pmjsPrimitiveContent.reset();
  releaseNativeResource(this._nativeCanvas, 'canvas');
  this._nativeCanvas = null;
  this._pmjsContentChanged();
};
CanvasElement.prototype._ensureNativeCanvas = function() {
  if (this._pmjsPrimitiveContent) this._pmjsPrimitiveContent.materialize();
  if (!this._nativeCanvas) {
    var width = Math.max(1, this.width);
    var height = Math.max(1, this.height);
    this._nativeCanvas = trackNativeResource(
      NativeHost.canvas.create(width, height, !!(this._context2d && this._context2d._alpha === false)),
      'canvas');
  }
  return this._nativeCanvas;
};
Object.defineProperty(CanvasElement.prototype, 'width', {
  get: function() { return this._width; },
  set: function(value) {
    this._width = Math.max(0, Number(value) | 0);
    this._releaseNativeCanvas();
    if (this._context2d) resetCanvasContextState(this._context2d);
  }
});
Object.defineProperty(CanvasElement.prototype, 'height', {
  get: function() { return this._height; },
  set: function(value) {
    this._height = Math.max(0, Number(value) | 0);
    this._releaseNativeCanvas();
    if (this._context2d) resetCanvasContextState(this._context2d);
  }
});
CanvasElement.prototype.getContext = function(type, options) {
  if (type === '2d') {
    if (!this._context2d) {
      this._context2d = new CanvasContext2D(this);
      this._context2d._alpha = !options || options.alpha === undefined || !!options.alpha;
    }
    return this._context2d;
  }
  return null;
};
CanvasElement.prototype.toDataURL = function(type, quality) {
  if (!this.width || !this.height) return 'data:,';
  type = type === undefined ? 'image/png' : String(type).toLowerCase();
  var handle = this._ensureNativeCanvas().handle;
  var suppliedQuality = typeof quality === 'number' && quality >= 0 && quality <= 1;
  var bytes;
  if (type === 'image/jpeg') bytes = NativeHost.canvas.encodeJpeg(handle, suppliedQuality ? quality : 0.92);
  else if (type === 'image/webp') bytes = NativeHost.canvas.encodeWebP(handle, suppliedQuality ? quality : 0.8);
  else { type = 'image/png'; bytes = NativeHost.canvas.encodePng(handle); }
  return 'data:' + type + ';base64,' + base64Bytes(bytes);
};
CanvasElement.prototype.getBoundingClientRect = function() {
  return this._pmjsPresentationRect || { left: 0, top: 0, width: this.width, height: this.height };
};

Object.defineProperties(CanvasElement.prototype, {
  offsetLeft: { get: function() { return this.getBoundingClientRect().left; } },
  offsetTop: { get: function() { return this.getBoundingClientRect().top; } }
});

function GenericElement(tagName) {
  EventTarget.call(this);
  this.tagName = String(tagName).toUpperCase();
  this.style = new CSSStyleDeclaration();
  this.children = [];
  this.parentNode = null;
}

GenericElement.prototype = Object.create(EventTarget.prototype);
GenericElement.prototype.constructor = GenericElement;
// Simple selectors only (tag, #id, .class), as Karryn's Prison's sweetalert uses.
GenericElement.prototype.querySelectorAll = function(selector) {
  var match = /^(#|\.)?([\w-]+)$/.exec(String(selector).trim());
  var found = [];
  if (!match) return found;
  (function walk(node) {
    (node.children || []).forEach(function(child) {
      var classes = String(child.className || '').split(/\s+/);
      if (match[1] === '#' ? child.id === match[2] : match[1] === '.' ? classes.indexOf(match[2]) >= 0 :
        String(child.tagName || '').toLowerCase() === match[2].toLowerCase()) found.push(child);
      walk(child);
    });
  })(this);
  return found;
};
GenericElement.prototype.querySelector = function(selector) {
  return this.querySelectorAll(selector)[0] || null;
};
GenericElement.prototype.appendChild = function(child) {
  for (var ancestor = this; ancestor; ancestor = ancestor.parentNode) {
    if (ancestor === child) throw new Error('Cannot append an ancestor');
  }
  if (child.parentNode) child.parentNode.removeChild(child);
  child.parentNode = this;
  this.children.push(child);
  if (this instanceof ScriptElement) this._prepare();
  prepareConnectedScripts(child);
  return child;
};
GenericElement.prototype.removeChild = function(child) {
  var index = this.children.indexOf(child);
  if (index >= 0) this.children.splice(index, 1);
  child.parentNode = null;
  return child;
};
GenericElement.prototype.remove = function() {
  if (this.parentNode) this.parentNode.removeChild(this);
};
// Canvases and images aren't GenericElements but are attached to them (Karryn's Prison's
// FastCutIns removes its preview canvases).
CanvasElement.prototype.remove = GenericElement.prototype.remove;
GenericElement.prototype.insertBefore = function(child, reference) {
  this.appendChild(child);
  var index = reference ? this.children.indexOf(reference) : -1;
  if (index >= 0) this.children.splice(index, 0, this.children.pop());
  return child;
};
function elementNodes(nodes) {
  return Array.prototype.map.call(nodes, function(node) {
    return typeof node === 'string' ? documentTarget.createTextNode(node) : node;
  });
}
GenericElement.prototype.prepend = function() {
  var first = this.children[0];
  elementNodes(arguments).forEach(function(node) { this.insertBefore(node, first); }, this);
};
GenericElement.prototype.append = function() {
  elementNodes(arguments).forEach(function(node) { this.appendChild(node); }, this);
};
// class and style are the element's className and style declarations; other attributes are properties.
GenericElement.prototype.setAttribute = function(name, value) {
  name = String(name);
  value = String(value);
  if (name === 'class') this.className = value;
  else if (name === 'style') {
    value.split(';').forEach(function(rule) {
      var colon = rule.indexOf(':');
      if (colon > 0) this.style.setProperty(rule.slice(0, colon).trim(), rule.slice(colon + 1).trim());
    }, this);
  } else this[name] = value;
};
GenericElement.prototype.getAttribute = function(name) {
  var value = name === 'class' ? this.className : this[name];
  // An emptied value reads as absent: removeAttribute blanks accessor-backed attributes (src).
  return value === undefined || value === null || value === '' || typeof value === 'object' ? null : String(value);
};
GenericElement.prototype.hasAttribute = function(name) { return this.getAttribute(name) !== null; };
GenericElement.prototype.removeAttribute = function(name) {
  name = String(name);
  if (Object.prototype.hasOwnProperty.call(this, name)) {
    delete this[name];
    return;
  }
  var descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this), name);
  if (descriptor && descriptor.set) this[name] = '';
};
GenericElement.prototype.getElementsByTagName = function() { return []; };

function escapeElementText(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function decodeElementText(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, function(_, entity) {
    if (entity[0] === '#') return String.fromCodePoint(parseInt(entity.slice(entity[1].toLowerCase() === 'x' ? 2 : 1), entity[1].toLowerCase() === 'x' ? 16 : 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }[entity.toLowerCase()];
  });
}
// Enough HTML for markup that mods build and then query (Karryn's Prison's FastCutIns progress
// display): elements, attributes, text and comments. Nothing draws it.
var voidElements = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
function parseElementHtml(parent, html) {
  var stack = [parent];
  var token = /<!--[\s\S]*?-->|<\/([\w:-]+)\s*>|<([\w:-]+)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|[^<]+|</g;
  var match;
  while ((match = token.exec(html))) {
    var top = stack[stack.length - 1];
    if (match[1]) {
      var name = match[1].toUpperCase();
      for (var depth = stack.length - 1; depth > 0; depth--) {
        if (stack[depth].tagName === name) { stack.length = depth; break; }
      }
    } else if (match[2]) {
      var element = documentTarget.createElement(match[2]);
      var attribute = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g, pair;
      while ((pair = attribute.exec(match[3]))) {
        var value = pair[2] !== undefined ? pair[2] : pair[3] !== undefined ? pair[3] : pair[4];
        element.setAttribute(pair[1], decodeElementText(value === undefined ? '' : value));
      }
      top.appendChild(element);
      if (!match[4] && !voidElements.test(match[2])) stack.push(element);
    } else if (match[0].indexOf('<!--') !== 0) {
      top.appendChild(documentTarget.createTextNode(decodeElementText(match[0])));
    }
  }
}
Object.defineProperties(GenericElement.prototype, {
  textContent: {
    configurable: true,
    get: function() {
      return (this._textContent || '') + this.children.map(function(child) { return child.textContent || ''; }).join('');
    },
    set: function(value) {
      this.children.forEach(function(child) { child.parentNode = null; });
      this.children = [];
      this._textContent = value === null ? '' : String(value);
    }
  },
  innerText: {
    configurable: true,
    get: function() { return this.textContent; },
    set: function(value) { this.textContent = value; }
  },
  innerHTML: {
    configurable: true,
    get: function() {
      return escapeElementText(this._textContent || '') +
        this.children.map(function(child) { return child.outerHTML || ''; }).join('');
    },
    set: function(value) {
      this.textContent = '';
      parseElementHtml(this, value === null ? '' : String(value));
    }
  },
  outerHTML: {
    get: function() {
      if (this.tagName === '#TEXT') return escapeElementText(this.textContent);
      var tag = this.tagName.toLowerCase();
      var attributes = ['id', 'className'].filter(function(name) { return this[name]; }, this)
        .map(function(name) {
          return ' ' + (name === 'className' ? 'class' : name) + '="' +
            escapeElementText(this[name]).replace(/"/g, '&quot;') + '"';
        }, this).join('');
      return '<' + tag + attributes + '>' + (voidElements.test(tag) ? '' : this.innerHTML + '</' + tag + '>');
    }
  },
  childNodes: {
    configurable: true,
    get: function() { return this.children; }
  },
  classList: {
    configurable: true,
    get: function() {
      var element = this;
      function names() { return String(element.className || '').split(/\s+/).filter(Boolean); }
      function set(list) { element.className = list.join(' '); }
      return {
        get length() { return names().length; },
        item: function(index) { return names()[index] || null; },
        contains: function(name) { return names().indexOf(String(name)) >= 0; },
        add: function() {
          var list = names();
          Array.prototype.forEach.call(arguments, function(name) { if (list.indexOf(String(name)) < 0) list.push(String(name)); });
          set(list);
        },
        remove: function() {
          var removed = Array.prototype.map.call(arguments, String);
          set(names().filter(function(name) { return removed.indexOf(name) < 0; }));
        },
        toggle: function(name, force) {
          var present = this.contains(name);
          if (force === undefined ? present : !force) this.remove(name); else this.add(name);
          return !present || force === true;
        },
        toString: function() { return names().join(' '); }
      };
    }
  }
});

function prepareConnectedScripts(node) {
  if (node instanceof ScriptElement) node._prepare();
  (node.children || []).slice().forEach(prepareConnectedScripts);
}

function ScriptElement() {
  GenericElement.call(this, 'script');
  this.src = '';
  this.type = '';
  this._started = false;
}
ScriptElement.prototype = Object.create(GenericElement.prototype);
ScriptElement.prototype.constructor = ScriptElement;
ScriptElement.prototype._prepare = function() {
  if (this._started) return;
  var root = this;
  while (root.parentNode) root = root.parentNode;
  if (root !== documentTarget) return;
  var type = String(this.type || '').trim().toLowerCase();
  if (type && type !== 'text/javascript' && type !== 'application/javascript') return;
  if (this.src) {
    this._started = true;
    pmjsLoadScriptElement(this);
    return;
  }
  if (!this.textContent) return;
  this._started = true;
  var script = this;
  try { pmjsExecuteScriptElement(script); }
  catch (error) { pmjsReportEventError(error); }
};
Object.defineProperties(ScriptElement.prototype, {
  textContent: {
    configurable: true,
    get: function() {
      return this.children.map(function(child) { return child.textContent || ''; }).join('');
    },
    set: function(value) {
      this.children.forEach(function(child) { child.parentNode = null; });
      var text = new GenericElement('#text');
      text.textContent = value === null ? '' : String(value);
      text.parentNode = this;
      this.children = [text];
      this._prepare();
    }
  },
  text: {
    configurable: true,
    get: function() { return this.textContent; },
    set: function(value) { this.textContent = value; }
  }
});

function AudioElement() {
  GenericElement.call(this, 'audio');
}

AudioElement.prototype = Object.create(GenericElement.prototype);
AudioElement.prototype.constructor = AudioElement;
AudioElement.prototype.canPlayType = function(type) {
  return /^audio\//.test(String(type)) ? 'maybe' : '';
};
