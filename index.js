var through = require("through2");
var gutil = require("gulp-util");

var Filesystem = require("asar/lib/filesystem");
var pickle = require("chromium-pickle-js");

const PLUGIN_NAME = "gulp-asar";

module.exports = function(destFilename, opts) {
  opts = opts || {};
  if (!destFilename) {
    throw new gutil.PluginError(PLUGIN_NAME, "destFilename required");
  }

  var cwd = opts.base || process.cwd(); // ?
  var filesystem = new Filesystem(cwd);
  var out = [];
  var outLen = 0;

  var stream = through.obj(function(file, enc, cb) {
    if (file.isStream()) {
      return cb(new gutil.PluginError(PLUGIN_NAME, "Streaming not supported"));
    }

    if (file.stat.isDirectory()) {
      filesystem.insertDirectory(file.relative);
      cb();
    } else if (file.stat.isSymbolicLink()) {
      filesystem.insertLink(file.relative, file.stat);
      cb();
    } else {
      // File length could have changed if the file have been modified:
      file.stat.size = file.contents.length;

      filesystem.insertFile(file.relative, false, file, {}, function() {
        outLen += file.contents.length;
        out.push(file.contents);

        cb();
      });
    }
  }, function(cb) {
    var headerPickle = pickle.createEmpty();
    headerPickle.writeString(JSON.stringify(filesystem.header));
    var headerBuf = headerPickle.toBuffer();

    var sizePickle = pickle.createEmpty();
    sizePickle.writeUInt32(headerBuf.length);
    var sizeBuf = sizePickle.toBuffer();

    outLen += headerBuf.length;
    outLen += sizeBuf.length;
    out.unshift(headerBuf);
    out.unshift(sizeBuf);

    var archive = Buffer.concat(out, outLen);
    out = [];

    this.push(new gutil.File({
      cwd: cwd,
      base: cwd,
      path: destFilename,
      contents: archive,
      enc: "utf8"
    }));

    cb();
  });

  return stream;
};
