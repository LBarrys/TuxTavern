'use strict';

// SVG images, drawn with the canvas: shapes, paths, groups and transforms with solid fills and
// strokes (Karryn's Prison's menu cursor is three small Inkscape SVGs loaded as Pixi textures).
// Gradients, text and other elements are left out and reported once.
(function() {
  var UNITS = { px: 1, mm: 96 / 25.4, cm: 96 / 2.54, 'in': 96, pt: 4 / 3, pc: 16 };
  var SKIP = { defs: 1, metadata: 1, title: 1, desc: 1, style: 1, sodipodi: 1 };

  function parse(text) {
    var root = { name: '#root', attrs: {}, children: [] }, stack = [root];
    var tag = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[?!][^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
    var attr = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g, match;
    while ((match = tag.exec(text))) {
      if (match[1]) { if (stack.length > 1) stack.pop(); continue; }
      if (!match[2]) continue;
      var node = { name: match[2].replace(/^svg:/, ''), attrs: {}, children: [] }, a;
      attr.lastIndex = 0;
      while ((a = attr.exec(match[3]))) node.attrs[a[1]] = a[3] !== undefined ? a[3] : a[4];
      stack[stack.length - 1].children.push(node);
      if (!match[4]) stack.push(node);
    }
    var svg = root.children.filter(function(node) { return node.name === 'svg'; })[0];
    if (!svg) throw new Error('not an SVG document');
    return svg;
  }

  function length(value, fallback) {
    var match = /^\s*([-+]?[\d.]+(?:e[-+]?\d+)?)\s*([a-z]*)\s*$/i.exec(value || '');
    if (!match || !(match[2] in UNITS || match[2] === '')) return fallback;
    return parseFloat(match[1]) * (UNITS[match[2]] || 1);
  }
  function numbers(value) {
    return (String(value || '').match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []).map(Number);
  }

  function multiply(m, n) {
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3],
      m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  }
  function transform(value) {
    var m = [1, 0, 0, 1, 0, 0], part = /(\w+)\s*\(([^)]*)\)/g, match;
    while ((match = part.exec(value || ''))) {
      var v = numbers(match[2]), t;
      if (match[1] === 'matrix' && v.length === 6) t = v;
      else if (match[1] === 'translate') t = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
      else if (match[1] === 'scale') t = [v[0], 0, 0, v.length > 1 ? v[1] : v[0], 0, 0];
      else if (match[1] === 'rotate') {
        var r = (v[0] || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), x = v[1] || 0, y = v[2] || 0;
        t = [c, s, -s, c, x - c * x + s * y, y - s * x - c * y];
      } else if (match[1] === 'skewX') t = [1, 0, Math.tan(v[0] * Math.PI / 180), 1, 0, 0];
      else if (match[1] === 'skewY') t = [1, Math.tan(v[0] * Math.PI / 180), 0, 1, 0, 0];
      if (t) m = multiply(m, t);
    }
    return m;
  }

  var INHERITED = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity',
    'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'visibility'];
  function style(node, parent) {
    var own = {}, result = {};
    Object.keys(node.attrs).forEach(function(key) { own[key] = node.attrs[key]; });
    String(node.attrs.style || '').split(';').forEach(function(rule) {
      var at = rule.indexOf(':');
      if (at > 0) own[rule.slice(0, at).trim()] = rule.slice(at + 1).trim();
    });
    INHERITED.forEach(function(key) { result[key] = key in own ? own[key] : parent[key]; });
    result.display = own.display;
    result.opacity = (parent.opacity === undefined ? 1 : parent.opacity) *
      (own.opacity === undefined ? 1 : Number(own.opacity));
    return result;
  }

  function reported(what) { if (PMJS.compat) PMJS.compat.observed('image.svg', what); }

  // SVG arcs by their centre, as the canvas draws them (SVG 1.1, appendix F.6).
  function arc(context, x1, y1, rx, ry, angle, large, sweep, x2, y2) {
    if (!rx || !ry) { context.lineTo(x2, y2); return; }
    rx = Math.abs(rx); ry = Math.abs(ry);
    var phi = angle * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
    var dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x = cos * dx + sin * dy, y = -sin * dx + cos * dy;
    var scale = x * x / (rx * rx) + y * y / (ry * ry);
    if (scale > 1) { rx *= Math.sqrt(scale); ry *= Math.sqrt(scale); }
    var sign = large === sweep ? -1 : 1;
    var q = Math.max(0, (rx * rx * ry * ry - rx * rx * y * y - ry * ry * x * x) / (rx * rx * y * y + ry * ry * x * x));
    var cx = sign * Math.sqrt(q) * rx * y / ry, cy = -sign * Math.sqrt(q) * ry * x / rx;
    var mx = cos * cx - sin * cy + (x1 + x2) / 2, my = sin * cx + cos * cy + (y1 + y2) / 2;
    var start = Math.atan2((y - cy) / ry, (x - cx) / rx), end = Math.atan2((-y - cy) / ry, (-x - cx) / rx);
    context.ellipse(mx, my, rx, ry, phi, start, end, !sweep);
  }

  function tracePath(context, d) {
    var tokens = String(d || '').match(/[a-df-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [];
    var i = 0, command = '', x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0, previous = '';
    function next() { return Number(tokens[i++]); }
    while (i < tokens.length) {
      if (/^[a-z]$/i.test(tokens[i])) command = tokens[i++];
      var relative = command === command.toLowerCase(), c = command.toUpperCase();
      var ox = relative ? x : 0, oy = relative ? y : 0, x1, y1, x2, y2;
      if (c === 'M') {
        x = ox + next(); y = oy + next(); sx = x; sy = y;
        context.moveTo(x, y);
        command = relative ? 'l' : 'L';
      } else if (c === 'L') { x = ox + next(); y = oy + next(); context.lineTo(x, y); }
      else if (c === 'H') { x = ox + next(); context.lineTo(x, y); }
      else if (c === 'V') { y = oy + next(); context.lineTo(x, y); }
      else if (c === 'C' || c === 'S') {
        if (c === 'C') { x1 = ox + next(); y1 = oy + next(); }
        else if (/[CS]/i.test(previous)) { x1 = 2 * x - cx; y1 = 2 * y - cy; } else { x1 = x; y1 = y; }
        x2 = ox + next(); y2 = oy + next(); x = ox + next(); y = oy + next();
        context.bezierCurveTo(x1, y1, x2, y2, x, y); cx = x2; cy = y2;
      } else if (c === 'Q' || c === 'T') {
        if (c === 'Q') { x1 = ox + next(); y1 = oy + next(); }
        else if (/[QT]/i.test(previous)) { x1 = 2 * x - cx; y1 = 2 * y - cy; } else { x1 = x; y1 = y; }
        x = ox + next(); y = oy + next();
        context.quadraticCurveTo(x1, y1, x, y); cx = x1; cy = y1;
      } else if (c === 'A') {
        var rx = next(), ry = next(), angle = next(), large = next(), sweep = next();
        x2 = ox + next(); y2 = oy + next();
        arc(context, x, y, rx, ry, angle, !!large, !!sweep, x2, y2); x = x2; y = y2;
      } else if (c === 'Z') { context.closePath(); x = sx; y = sy; }
      else return;
      previous = c;
    }
  }

  function trace(context, node) {
    var a = node.attrs, v;
    if (node.name === 'path') tracePath(context, a.d);
    else if (node.name === 'rect') {
      var x = length(a.x, 0), y = length(a.y, 0), w = length(a.width, 0), h = length(a.height, 0);
      var rx = Math.min(length(a.rx, length(a.ry, 0)), w / 2), ry = Math.min(length(a.ry, rx), h / 2);
      if (!(w > 0 && h > 0)) return false;
      if (!rx || !ry) { context.rect(x, y, w, h); return true; }
      context.moveTo(x + rx, y);
      context.lineTo(x + w - rx, y); context.ellipse(x + w - rx, y + ry, rx, ry, 0, -Math.PI / 2, 0);
      context.lineTo(x + w, y + h - ry); context.ellipse(x + w - rx, y + h - ry, rx, ry, 0, 0, Math.PI / 2);
      context.lineTo(x + rx, y + h); context.ellipse(x + rx, y + h - ry, rx, ry, 0, Math.PI / 2, Math.PI);
      context.lineTo(x, y + ry); context.ellipse(x + rx, y + ry, rx, ry, 0, Math.PI, Math.PI * 1.5);
      context.closePath();
    } else if (node.name === 'circle' || node.name === 'ellipse') {
      var r = length(a.r, 0), erx = node.name === 'circle' ? r : length(a.rx, 0), ery = node.name === 'circle' ? r : length(a.ry, 0);
      if (!(erx > 0 && ery > 0)) return false;
      context.moveTo(length(a.cx, 0) + erx, length(a.cy, 0));
      context.ellipse(length(a.cx, 0), length(a.cy, 0), erx, ery, 0, 0, Math.PI * 2);
    } else if (node.name === 'line') {
      context.moveTo(length(a.x1, 0), length(a.y1, 0)); context.lineTo(length(a.x2, 0), length(a.y2, 0));
    } else if (node.name === 'polyline' || node.name === 'polygon') {
      v = numbers(a.points);
      for (var i = 0; i + 1 < v.length; i += 2) context[i ? 'lineTo' : 'moveTo'](v[i], v[i + 1]);
      if (node.name === 'polygon') context.closePath();
    } else return false;
    return true;
  }

  function paint(value, opacity) {
    if (!value || value === 'none' || opacity <= 0) return null;
    if (/^url\(/.test(value)) { reported('paint server'); return null; }
    return value === 'currentColor' ? '#000' : value;
  }

  function draw(context, node, inherited, matrix, alpha) {
    if (SKIP[node.name] || /:/.test(node.name)) return;
    var computed = style(node, inherited);
    if (computed.display === 'none') return;
    var m = multiply(matrix, transform(node.attrs.transform));
    if (node.name === 'g' || node.name === 'svg' || node.name === 'a') {
      node.children.forEach(function(child) { draw(context, child, computed, m, alpha); });
      return;
    }
    if (computed.visibility === 'hidden') return;
    context.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    context.beginPath();
    if (!trace(context, node)) { if (!/^(path|rect|circle|ellipse|line|polyline|polygon)$/.test(node.name)) reported(node.name); return; }
    var opacity = alpha * computed.opacity;
    var fillOpacity = opacity * (computed['fill-opacity'] === undefined ? 1 : Number(computed['fill-opacity']));
    var fill = paint(computed.fill === undefined ? '#000' : computed.fill, fillOpacity);
    if (fill && node.name !== 'line') {
      context.globalAlpha = fillOpacity;
      context.fillStyle = fill;
      context.fill(computed['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero');
    }
    var strokeWidth = length(computed['stroke-width'], 1);
    var strokeOpacity = opacity * (computed['stroke-opacity'] === undefined ? 1 : Number(computed['stroke-opacity']));
    var stroke = paint(computed.stroke, strokeOpacity);
    if (stroke && strokeWidth > 0) {
      context.globalAlpha = strokeOpacity;
      context.strokeStyle = stroke;
      context.lineWidth = strokeWidth;
      context.lineCap = computed['stroke-linecap'] || 'butt';
      context.lineJoin = computed['stroke-linejoin'] || 'miter';
      context.miterLimit = Number(computed['stroke-miterlimit']) || 4;
      context.stroke();
    }
  }

  // The SVG drawn on a canvas at its own size (width and height, else its viewBox).
  function canvasFromSvg(text) {
    var svg = parse(text), box = numbers(svg.attrs.viewBox);
    var width = length(svg.attrs.width, box.length === 4 ? box[2] : 300);
    var height = length(svg.attrs.height, box.length === 4 ? box[3] : 150);
    if (!(width > 0 && height > 0)) throw new Error('SVG has no size');
    var canvas = new CanvasElement();
    // Chromium rounds the image size but keeps the viewBox at the exact one.
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    var matrix = [1, 0, 0, 1, 0, 0];
    if (box.length === 4 && box[2] > 0 && box[3] > 0) {
      var scale = Math.min(width / box[2], height / box[3]);
      matrix = [scale, 0, 0, scale, (width - box[2] * scale) / 2 - box[0] * scale, (height - box[3] * scale) / 2 - box[1] * scale];
    }
    var context = canvas.getContext('2d');
    context.save();
    svg.children.forEach(function(child) { draw(context, child, {}, matrix, 1); });
    context.restore();
    return canvas;
  }

  // The SVG text of a data URL or a game file, or null for any other source.
  function svgText(source, path) {
    var data = /^data:image\/svg\+xml([^,]*),([\s\S]*)$/i.exec(source);
    if (data) {
      if (/;base64$/i.test(data[1])) return new TextDecoder().decode(Uint8Array.from(atob(data[2]), function(c) { return c.charCodeAt(0); }));
      return decodeURIComponent(data[2]);
    }
    if (!/\.svg$/i.test(path)) return null;
    var text = NativeHost.fs.readText(gameReadPath(path));
    if (text === null) throw new Error('SVG not found: ' + path);
    return text;
  }

  PMJS.web = PMJS.web || {};
  PMJS.web.svg = { canvas: canvasFromSvg, text: svgText };
})();
