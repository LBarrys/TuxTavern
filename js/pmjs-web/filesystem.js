var posixPath = globalThis.__pmjsBuiltinRequire('path').posix;
function normalizePath(path) {
  return posixPath.normalize(String(path).replace(/\\/g, '/'));
}
function dirname(path) { return posixPath.dirname(path); }

function gamePath(path) {
  var normalized = normalizePath(path);
  if (normalized === '/game') return '.';
  if (normalized.indexOf('/game/') === 0) return normalized.slice(6);
  return normalized.charAt(0) === '/' ? normalized.slice(1) : normalized;
}

function gameReadPath(path) {
  var resolved = gamePath(path);
  var aliases = PMJS.config.virtualFiles &&
    PMJS.config.virtualFiles.extensionAliases || {};
  var extension = pathModule.extname(resolved);
  var replacement = aliases[extension.toLowerCase()];
  return replacement === undefined
    ? resolved : resolved.slice(0, -extension.length) + replacement;
}

function gameDirectoryEntries(path, entries) {
  var aliases = PMJS.config.virtualFiles &&
    PMJS.config.virtualFiles.directoryEntryAliases || {};
  var directories = normalizePath(path).replace(/\/$/, '').toLowerCase().split('/');
  var extensions;
  for (var index = directories.length - 1; index >= 0; index--) {
    extensions = aliases[directories[index]];
    if (extensions) break;
  }
  if (!extensions) return entries;
  return entries.map(function(name) {
    var extension = pathModule.extname(name);
    var replacement = extensions[extension.toLowerCase()];
    return replacement === undefined
      ? name : name.slice(0, -extension.length) + replacement;
  });
}

function writablePath(path) {
  var normalized = normalizePath(path);
  if (normalized === '/save' || normalized === '/save/') return '';
  return normalized.indexOf('/save/') === 0 ? normalized.slice(6) : null;
}

var pathModule = Object.assign({}, posixPath, {
  resolve: function() {
    return posixPath.resolve.apply(posixPath, ['/game'].concat(Array.prototype.slice.call(arguments)));
  },
  relative: function(from, to) {
    return posixPath.relative(pathModule.resolve(from), pathModule.resolve(to));
  }
});
pathModule.posix = pathModule;

function fsReadContents(path, options) {
  var writable = writablePath(path);
  var host = writable !== null && NativeHost.storage ? NativeHost.storage : NativeHost.fs;
  var resolved = writable !== null && NativeHost.storage ? writable : gameReadPath(path);
  var result = host.readBytes(resolved);
  return fsDecodeContents(path, options, result);
}

function fsReadContentsAsync(path, options) {
  var writable = writablePath(path);
  var host = writable !== null && NativeHost.storage ? NativeHost.storage : NativeHost.fs;
  var resolved = writable !== null && NativeHost.storage ? writable : gameReadPath(path);
  return host.readBytesAsync(resolved).then(function(result) {
    return fsDecodeContents(path, options, result);
  });
}

function fsDecodeContents(path, options, result) {
  var writable = writablePath(path);
  var encoding = typeof options === 'string' ? options : options && options.encoding;
  var missingFiles = PMJS.config.missingTextFiles || {};
  if (result === null && writable !== null &&
      Object.prototype.hasOwnProperty.call(missingFiles, writable)) {
    result = Buffer.from(String(missingFiles[writable]), 'utf8');
  }
  if (result === null) {
    var error = new Error('ENOENT: ' + path);
    error.code = 'ENOENT';
    throw error;
  }
  var buffer = ArrayBuffer.isView(result)
    ? Buffer.from(result.buffer, result.byteOffset, result.byteLength)
    : Buffer.from(result);
  return encoding ? buffer.toString(encoding) : Buffer.from(buffer);
}

function fsCloseDiscardedReader(reader) {
  Promise.resolve().then(function() { return reader.close(); }).catch(function(error) {
    console.error('[pmjs] file close failed:', error);
  });
}

function fsReaderStopListener(reader) {
  // A shutdown listener must not retain an abandoned reader.
  var weak = new WeakRef(reader);
  return PMJS.tasks.onStop(function() {
    var opened = weak.deref();
    if (opened) fsCloseDiscardedReader(opened);
  });
}

function FsReadStream(path, options) {
  options = typeof options === 'string' ? { encoding: options } : options || {};
  var start = options.start === undefined ? 0 : options.start;
  var end = options.end === undefined ? Infinity : options.end;
  function validateRange(value, name, infinity) {
    var error;
    if (typeof value !== 'number') {
      error = new TypeError(name + ' must be a number'); error.code = 'ERR_INVALID_ARG_TYPE';
    } else if (!(infinity && value === Infinity) && (!Number.isSafeInteger(value) || value < 0)) {
      error = new RangeError(name + ' must be a non-negative safe integer'); error.code = 'ERR_OUT_OF_RANGE';
    }
    if (error) throw error;
  }
  validateRange(start, 'start', false);
  validateRange(end, 'end', true);
  if (start > end) {
    var rangeError = new RangeError('start must not exceed end');
    rangeError.code = 'ERR_OUT_OF_RANGE'; throw rangeError;
  }
  var Readable = globalThis.__pmjsBuiltinRequire('stream').Readable;
  var reader, demand = 0, queued = false, position = start;
  function discardReader() {
    var closing = reader; reader = null;
    if (closing) fsCloseDiscardedReader(closing);
  }
  function scheduleRead() {
    if (!reader || !demand || queued || stream.destroyed) return;
    queued = true;
    PMJS.tasks.enqueue(function() {
      if (stream.destroyed) { queued = false; return; }
      var size = Math.min(demand, end === Infinity ? Infinity : end - position + 1);
      var reading = reader;
      demand = 0;
      Promise.resolve().then(function() { return reading.readAsync(size); }).then(function(contents) {
        PMJS.tasks.enqueue(function() {
          queued = false;
          if (stream.destroyed) return;
          position += contents.byteLength;
          if (!contents.byteLength) { stream.push(null); return; }
          stream.push(contents);
          if (!stream.destroyed && position > end) stream.push(null);
          scheduleRead();
        }, { discard: discardReader });
      }, function(error) {
        PMJS.tasks.enqueue(function() { queued = false; stream.destroy(error); }, { discard: discardReader });
      });
    }, { discard: discardReader });
  }

  var stream = new Readable({
    encoding: options.encoding,
    highWaterMark: options.highWaterMark === undefined ? 64 * 1024 : options.highWaterMark,
    read: function(size) { demand = size || 1; scheduleRead(); },
    destroy: function(error, callback) {
      if (removeStopListener) removeStopListener();
      var closing = reader; reader = null;
      Promise.resolve().then(function() { if (closing) return closing.close(); }).then(
        function() { callback(error); }, function(closeError) { callback(error || closeError); });
    }
  });
  var removeStopListener;
  stream.path = path;
  PMJS.tasks.enqueue(function() {
    if (stream.destroyed) return;
    Promise.resolve().then(function() {
      var writable = writablePath(path);
      var host = writable !== null && NativeHost.storage ? NativeHost.storage : NativeHost.fs;
      var resolved = writable !== null && NativeHost.storage ? writable : gameReadPath(path);
      return host.openReadAsync(resolved, start).then(function(opened) {
        var missingFiles = PMJS.config.missingTextFiles || {};
        if (!opened && writable !== null && Object.prototype.hasOwnProperty.call(missingFiles, writable)) {
          var bytes = Buffer.from(String(missingFiles[writable]), 'utf8'), offset = start;
          opened = { readAsync: function(size) {
            var chunk = bytes.subarray(offset, offset + size); offset += chunk.length;
            return Promise.resolve(chunk);
          }, close: function() { bytes = null; } };
        }
        if (!opened) {
          var error = new Error('ENOENT: ' + path); error.code = 'ENOENT'; throw error;
        }
        PMJS.tasks.enqueue(function() {
          if (stream.destroyed) { fsCloseDiscardedReader(opened); return; }
          reader = opened;
          if (PMJS.tasks.onStop) removeStopListener = fsReaderStopListener(opened);
          stream.emit('open', 0);
          stream.emit('ready');
          scheduleRead();
        }, { discard: function() {
          fsCloseDiscardedReader(opened);
        } });
      });
    }).catch(function(error) { PMJS.tasks.enqueue(function() { stream.destroy(error); }); });
  });
  return stream;
}

// Node's fs.Stats and fs.Dirent (types as in Node: 1 file, 2 directory); bundled copies of
// Node code extend fs.Dirent (Karryn's Prison's ImageReplacer, through fast-glob).
function FsStats(directory) { this._directory = directory; }
FsStats.prototype.isDirectory = function() { return this._directory; };
FsStats.prototype.isFile = function() { return !this._directory; };
function FsDirent(name, type, path) {
  this.name = name;
  this.parentPath = this.path = path;
  this._type = type;
}
FsDirent.prototype.isFile = function() { return this._type === 1; };
FsDirent.prototype.isDirectory = function() { return this._type === 2; };
['isSymbolicLink', 'isBlockDevice', 'isCharacterDevice', 'isFIFO', 'isSocket'].forEach(function(name) {
  FsStats.prototype[name] = FsDirent.prototype[name] = function() { return false; };
});

var fsModule = {
  Stats: FsStats,
  Dirent: FsDirent,
  existsSync: function(path) {
    var writable = writablePath(path);
    return writable !== null && NativeHost.storage
      ? (writable === '' || NativeHost.storage.exists(writable))
      : NativeHost.fs.exists(gameReadPath(path));
  },
  readFileSync: function(path, options) {
    return fsReadContents(path, options);
  },
  readFile: function(path, options, callback) {
    if (typeof options === 'function') { callback = options; options = null; }
    PMJS.tasks.enqueue(function() {
      Promise.resolve().then(function() { return fsReadContentsAsync(path, options); }).then(
        function(result) { PMJS.tasks.enqueue(function() { callback(null, result); }); },
        function(error) { PMJS.tasks.enqueue(function() { callback(error, null); }); });
    });
  },
  createReadStream: function(path, options) { return new FsReadStream(path, options); },
  // Collects the bytes and stores the file when the stream ends or closes (Karryn's Prison's
  // FastCutIns writes its sprite sheets this way).
  createWriteStream: function(path) {
    var chunks = [];
    var stream = new (globalThis.__pmjsBuiltinRequire('stream').Writable)({
      write: function(chunk, encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); },
      final: function(callback) {
        try { fsModule.writeFileSync(path, Buffer.concat(chunks)); } catch (error) { callback(error); return; }
        callback();
      }
    });
    stream.path = path;
    stream.close = function(callback) { stream.end(callback); };
    return stream;
  },
  writeFileSync: function(path, contents, options) {
    var writable = writablePath(path);
    var host = writable !== null ? NativeHost.storage : NativeHost.fs;
    if (!host) throw new Error('EACCES: ' + path);
    var encoding = typeof options === 'string' ? options : options && options.encoding;
    var bytes = ArrayBuffer.isView(contents)
      ? Buffer.from(contents.buffer, contents.byteOffset, contents.byteLength)
      : Buffer.from(String(contents), encoding || 'utf8');
    var resolved = writable !== null ? writable : gameReadPath(path);
    if (typeof host.writeBytes === 'function') host.writeBytes(resolved, bytes);
    else if (writable !== null && typeof contents === 'string' && (!encoding || encoding === 'utf8')) {
      host.writeText(resolved, contents);
    } else throw new Error('filesystem byte writes are unavailable');
  },
  writeFile: function(path, contents, options, callback) {
    if (typeof options === 'function') { callback = options; options = null; }
    var error = null;
    try { this.writeFileSync(path, contents, options); } catch (caught) { error = caught; }
    PMJS.tasks.enqueue(function() { if (callback) callback(error); });
  },
  appendFileSync: function(path, contents, options) {
    var previous;
    try { previous = fsReadContents(path); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      previous = Buffer.alloc(0);
    }
    var encoding = typeof options === 'string' ? options : options && options.encoding;
    var bytes = ArrayBuffer.isView(contents)
      ? Buffer.from(contents.buffer, contents.byteOffset, contents.byteLength)
      : Buffer.from(String(contents), encoding || 'utf8');
    fsModule.writeFileSync(path, Buffer.concat([previous, bytes]));
  },
  mkdirSync: function(path, options) {
    var writable = writablePath(path);
    var host = writable !== null ? NativeHost.storage : NativeHost.fs;
    if (!host) throw new Error('EACCES: ' + path);
    if (writable !== '') host.makeDirectory(writable !== null ? writable : gamePath(path), options);
  },
  mkdir: function(path, options, callback) {
    if (typeof options === 'function') { callback = options; options = null; }
    var error = null;
    try { this.mkdirSync(path, options); } catch (caught) { error = caught; }
    PMJS.tasks.enqueue(function() { if (callback) callback(error); });
  },
  unlinkSync: function(path) {
    var writable = writablePath(path);
    var host = writable !== null ? NativeHost.storage : NativeHost.fs;
    if (!host) throw new Error('EACCES: ' + path);
    host.remove(writable !== null ? writable : gameReadPath(path));
  },
  unlink: function(path, callback) {
    var error = null;
    try { this.unlinkSync(path); } catch (caught) { error = caught; }
    PMJS.tasks.enqueue(function() { if (callback) callback(error); });
  },
  renameSync: function(from, to) {
    var source = writablePath(from);
    var destination = writablePath(to);
    if ((source === null) !== (destination === null)) {
      var error = new Error('EXDEV: ' + from);
      error.code = 'EXDEV';
      throw error;
    }
    var host = source !== null ? NativeHost.storage : NativeHost.fs;
    host.rename(source !== null ? source : gameReadPath(from),
      destination !== null ? destination : gameReadPath(to));
  },
  rename: function(from, to, callback) {
    var error = null;
    try { this.renameSync(from, to); } catch (caught) { error = caught; }
    PMJS.tasks.enqueue(function() { if (callback) callback(error); });
  },
  readdirSync: function(path, options) {
    var writable = writablePath(path);
    var entries = writable !== null && NativeHost.storage
      ? NativeHost.storage.readDirectory(writable)
      : NativeHost.fs.readDirectory(gamePath(path));
    if (entries === null) {
      var error = new Error('ENOENT: ' + path);
      error.code = 'ENOENT';
      throw error;
    }
    entries = gameDirectoryEntries(path, entries);
    if (!options || !options.withFileTypes) return entries;
    return entries.map(function(name) {
      var directory = fsModule.statSync(pathModule.join(path, name)).isDirectory();
      return new FsDirent(name, directory ? 2 : 1, path);
    });
  },
  statSync: function(path) {
    var writable = writablePath(path);
    var exists, directory;
    if (writable !== null && NativeHost.storage) {
      exists = writable === '' || NativeHost.storage.exists(writable);
      directory = exists && (writable === '' || NativeHost.storage.isDirectory(writable));
    } else {
      var resolved = gameReadPath(path);
      exists = NativeHost.fs.exists(resolved);
      directory = exists && NativeHost.fs.isDirectory(resolved);
    }
    if (!exists) {
      var error = new Error('ENOENT: ' + path);
      error.code = 'ENOENT';
      throw error;
    }
    return new FsStats(directory);
  },
  stat: function(path, options, callback) {
    if (typeof options === 'function') { callback = options; options = null; }
    if (typeof callback !== 'function') throw new TypeError('stat requires a callback');
    var result, error = null;
    try { result = fsModule.statSync(path, options); } catch (caught) { error = caught; }
    PMJS.tasks.enqueue(function() { callback(error, result); });
  }
};
// The callback and promise forms NW.js pages have (Karryn's Prison's logger, mod manager and
// mods), from the calls above; there are no links, so lstat is stat and realpath normalizes.
fsModule.lstatSync = fsModule.statSync;
fsModule.realpathSync = function(path) {
  fsModule.statSync(path);
  return normalizePath(path);
};
fsModule.accessSync = function(path) { fsModule.statSync(path); };
['readdir', 'lstat', 'realpath', 'access'].forEach(function(name) {
  fsModule[name] = function() {
    var args = Array.prototype.slice.call(arguments);
    var callback = args.pop();
    if (typeof callback !== 'function') throw new TypeError(name + ' requires a callback');
    var result, error = null;
    try { result = fsModule[name + 'Sync'].apply(fsModule, args); } catch (caught) { error = caught; }
    PMJS.tasks.enqueue(function() { callback(error, result); });
  };
});
fsModule.promises = {};
['readFile', 'writeFile', 'appendFile', 'mkdir', 'unlink', 'rename', 'readdir', 'stat', 'lstat', 'realpath',
  'access'].forEach(function(name) {
  fsModule.promises[name] = function() {
    var args = arguments;
    return new Promise(function(resolve) { resolve(fsModule[name + 'Sync'].apply(fsModule, args)); });
  };
});
