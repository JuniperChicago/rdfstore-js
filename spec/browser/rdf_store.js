!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.rdfstore=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){

},{}],2:[function(_dereq_,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = _dereq_('base64-js')
var ieee754 = _dereq_('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
  // Detect if browser supports Typed Arrays. Supported browsers are IE 10+, Firefox 4+,
  // Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+. If the browser does not support adding
  // properties to `Uint8Array` instances, then that's the same as no `Uint8Array` support
  // because we need to be able to add all the node Buffer API methods. This is an issue
  // in Firefox 4-29. Now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // assume that object is array-like
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer._useTypedArrays && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    for (i = 0; i < length; i++) {
      if (Buffer.isBuffer(subject))
        buf[i] = subject.readUInt8(i)
      else
        buf[i] = subject[i]
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b !== null && b !== undefined && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list, [totalLength])\n' +
      'list should be an Array.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (typeof totalLength !== 'number') {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

// BUFFER INSTANCE METHODS
// =======================

function _hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  Buffer._charsWritten = i * 2
  return i
}

function _utf8Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function _asciiWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function _binaryWrite (buf, string, offset, length) {
  return _asciiWrite(buf, string, offset, length)
}

function _base64Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function _utf16leWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = _asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = _binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = _base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end !== undefined)
    ? Number(end)
    : end = self.length

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = _asciiSlice(self, start, end)
      break
    case 'binary':
      ret = _binarySlice(self, start, end)
      break
    case 'base64':
      ret = _base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 100 || !Buffer._useTypedArrays) {
    for (var i = 0; i < len; i++)
      target[i + target_start] = this[i + start]
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

function _base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function _utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function _asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++)
    ret += String.fromCharCode(buf[i])
  return ret
}

function _binarySlice (buf, start, end) {
  return _asciiSlice(buf, start, end)
}

function _hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function _utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i+1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (Buffer._useTypedArrays) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function _readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return _readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return _readUInt16(this, offset, false, noAssert)
}

function _readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return _readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return _readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function _readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return _readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return _readInt16(this, offset, false, noAssert)
}

function _readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return _readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return _readInt32(this, offset, false, noAssert)
}

function _readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return _readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return _readFloat(this, offset, false, noAssert)
}

function _readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return _readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return _readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
}

function _writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, false, noAssert)
}

function _writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
}

function _writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, false, noAssert)
}

function _writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, false, noAssert)
}

function _writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, false, noAssert)
}

function _writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (typeof value === 'string') {
    value = value.charCodeAt(0)
  }

  assert(typeof value === 'number' && !isNaN(value), 'value is not a number')
  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  for (var i = start; i < end; i++) {
    this[i] = value
  }
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer._useTypedArrays) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1)
        buf[i] = this[i]
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F)
      byteArray.push(str.charCodeAt(i))
    else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16))
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  var pos
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

},{"base64-js":3,"ieee754":4}],3:[function(_dereq_,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)
	var PLUS_URL_SAFE = '-'.charCodeAt(0)
	var SLASH_URL_SAFE = '_'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS ||
		    code === PLUS_URL_SAFE)
			return 62 // '+'
		if (code === SLASH ||
		    code === SLASH_URL_SAFE)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],4:[function(_dereq_,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],5:[function(_dereq_,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],6:[function(_dereq_,module,exports){
var http = module.exports;
var EventEmitter = _dereq_('events').EventEmitter;
var Request = _dereq_('./lib/request');
var url = _dereq_('url')

http.request = function (params, cb) {
    if (typeof params === 'string') {
        params = url.parse(params)
    }
    if (!params) params = {};
    if (!params.host && !params.port) {
        params.port = parseInt(window.location.port, 10);
    }
    if (!params.host && params.hostname) {
        params.host = params.hostname;
    }
    
    if (!params.scheme) params.scheme = window.location.protocol.split(':')[0];
    if (!params.host) {
        params.host = window.location.hostname || window.location.host;
    }
    if (/:/.test(params.host)) {
        if (!params.port) {
            params.port = params.host.split(':')[1];
        }
        params.host = params.host.split(':')[0];
    }
    if (!params.port) params.port = params.scheme == 'https' ? 443 : 80;
    
    var req = new Request(new xhrHttp, params);
    if (cb) req.on('response', cb);
    return req;
};

http.get = function (params, cb) {
    params.method = 'GET';
    var req = http.request(params, cb);
    req.end();
    return req;
};

http.Agent = function () {};
http.Agent.defaultMaxSockets = 4;

var xhrHttp = (function () {
    if (typeof window === 'undefined') {
        throw new Error('no window object present');
    }
    else if (window.XMLHttpRequest) {
        return window.XMLHttpRequest;
    }
    else if (window.ActiveXObject) {
        var axs = [
            'Msxml2.XMLHTTP.6.0',
            'Msxml2.XMLHTTP.3.0',
            'Microsoft.XMLHTTP'
        ];
        for (var i = 0; i < axs.length; i++) {
            try {
                var ax = new(window.ActiveXObject)(axs[i]);
                return function () {
                    if (ax) {
                        var ax_ = ax;
                        ax = null;
                        return ax_;
                    }
                    else {
                        return new(window.ActiveXObject)(axs[i]);
                    }
                };
            }
            catch (e) {}
        }
        throw new Error('ajax not supported in this browser')
    }
    else {
        throw new Error('ajax not supported in this browser');
    }
})();

http.STATUS_CODES = {
    100 : 'Continue',
    101 : 'Switching Protocols',
    102 : 'Processing',                 // RFC 2518, obsoleted by RFC 4918
    200 : 'OK',
    201 : 'Created',
    202 : 'Accepted',
    203 : 'Non-Authoritative Information',
    204 : 'No Content',
    205 : 'Reset Content',
    206 : 'Partial Content',
    207 : 'Multi-Status',               // RFC 4918
    300 : 'Multiple Choices',
    301 : 'Moved Permanently',
    302 : 'Moved Temporarily',
    303 : 'See Other',
    304 : 'Not Modified',
    305 : 'Use Proxy',
    307 : 'Temporary Redirect',
    400 : 'Bad Request',
    401 : 'Unauthorized',
    402 : 'Payment Required',
    403 : 'Forbidden',
    404 : 'Not Found',
    405 : 'Method Not Allowed',
    406 : 'Not Acceptable',
    407 : 'Proxy Authentication Required',
    408 : 'Request Time-out',
    409 : 'Conflict',
    410 : 'Gone',
    411 : 'Length Required',
    412 : 'Precondition Failed',
    413 : 'Request Entity Too Large',
    414 : 'Request-URI Too Large',
    415 : 'Unsupported Media Type',
    416 : 'Requested Range Not Satisfiable',
    417 : 'Expectation Failed',
    418 : 'I\'m a teapot',              // RFC 2324
    422 : 'Unprocessable Entity',       // RFC 4918
    423 : 'Locked',                     // RFC 4918
    424 : 'Failed Dependency',          // RFC 4918
    425 : 'Unordered Collection',       // RFC 4918
    426 : 'Upgrade Required',           // RFC 2817
    428 : 'Precondition Required',      // RFC 6585
    429 : 'Too Many Requests',          // RFC 6585
    431 : 'Request Header Fields Too Large',// RFC 6585
    500 : 'Internal Server Error',
    501 : 'Not Implemented',
    502 : 'Bad Gateway',
    503 : 'Service Unavailable',
    504 : 'Gateway Time-out',
    505 : 'HTTP Version Not Supported',
    506 : 'Variant Also Negotiates',    // RFC 2295
    507 : 'Insufficient Storage',       // RFC 4918
    509 : 'Bandwidth Limit Exceeded',
    510 : 'Not Extended',               // RFC 2774
    511 : 'Network Authentication Required' // RFC 6585
};
},{"./lib/request":7,"events":5,"url":28}],7:[function(_dereq_,module,exports){
var Stream = _dereq_('stream');
var Response = _dereq_('./response');
var Base64 = _dereq_('Base64');
var inherits = _dereq_('inherits');

var Request = module.exports = function (xhr, params) {
    var self = this;
    self.writable = true;
    self.xhr = xhr;
    self.body = [];
    
    self.uri = (params.scheme || 'http') + '://'
        + params.host
        + (params.port ? ':' + params.port : '')
        + (params.path || '/')
    ;
    
    if (typeof params.withCredentials === 'undefined') {
        params.withCredentials = true;
    }

    try { xhr.withCredentials = params.withCredentials }
    catch (e) {}
    
    xhr.open(
        params.method || 'GET',
        self.uri,
        true
    );

    self._headers = {};
    
    if (params.headers) {
        var keys = objectKeys(params.headers);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (!self.isSafeRequestHeader(key)) continue;
            var value = params.headers[key];
            self.setHeader(key, value);
        }
    }
    
    if (params.auth) {
        //basic auth
        this.setHeader('Authorization', 'Basic ' + Base64.btoa(params.auth));
    }

    var res = new Response;
    res.on('close', function () {
        self.emit('close');
    });
    
    res.on('ready', function () {
        self.emit('response', res);
    });
    
    xhr.onreadystatechange = function () {
        // Fix for IE9 bug
        // SCRIPT575: Could not complete the operation due to error c00c023f
        // It happens when a request is aborted, calling the success callback anyway with readyState === 4
        if (xhr.__aborted) return;
        res.handle(xhr);
    };
};

inherits(Request, Stream);

Request.prototype.setHeader = function (key, value) {
    this._headers[key.toLowerCase()] = value
};

Request.prototype.getHeader = function (key) {
    return this._headers[key.toLowerCase()]
};

Request.prototype.removeHeader = function (key) {
    delete this._headers[key.toLowerCase()]
};

Request.prototype.write = function (s) {
    this.body.push(s);
};

Request.prototype.destroy = function (s) {
    this.xhr.__aborted = true;
    this.xhr.abort();
    this.emit('close');
};

Request.prototype.end = function (s) {
    if (s !== undefined) this.body.push(s);

    var keys = objectKeys(this._headers);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var value = this._headers[key];
        if (isArray(value)) {
            for (var j = 0; j < value.length; j++) {
                this.xhr.setRequestHeader(key, value[j]);
            }
        }
        else this.xhr.setRequestHeader(key, value)
    }

    if (this.body.length === 0) {
        this.xhr.send('');
    }
    else if (typeof this.body[0] === 'string') {
        this.xhr.send(this.body.join(''));
    }
    else if (isArray(this.body[0])) {
        var body = [];
        for (var i = 0; i < this.body.length; i++) {
            body.push.apply(body, this.body[i]);
        }
        this.xhr.send(body);
    }
    else if (/Array/.test(Object.prototype.toString.call(this.body[0]))) {
        var len = 0;
        for (var i = 0; i < this.body.length; i++) {
            len += this.body[i].length;
        }
        var body = new(this.body[0].constructor)(len);
        var k = 0;
        
        for (var i = 0; i < this.body.length; i++) {
            var b = this.body[i];
            for (var j = 0; j < b.length; j++) {
                body[k++] = b[j];
            }
        }
        this.xhr.send(body);
    }
    else {
        var body = '';
        for (var i = 0; i < this.body.length; i++) {
            body += this.body[i].toString();
        }
        this.xhr.send(body);
    }
};

// Taken from http://dxr.mozilla.org/mozilla/mozilla-central/content/base/src/nsXMLHttpRequest.cpp.html
Request.unsafeHeaders = [
    "accept-charset",
    "accept-encoding",
    "access-control-request-headers",
    "access-control-request-method",
    "connection",
    "content-length",
    "cookie",
    "cookie2",
    "content-transfer-encoding",
    "date",
    "expect",
    "host",
    "keep-alive",
    "origin",
    "referer",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "user-agent",
    "via"
];

Request.prototype.isSafeRequestHeader = function (headerName) {
    if (!headerName) return false;
    return indexOf(Request.unsafeHeaders, headerName.toLowerCase()) === -1;
};

var objectKeys = Object.keys || function (obj) {
    var keys = [];
    for (var key in obj) keys.push(key);
    return keys;
};

var isArray = Array.isArray || function (xs) {
    return Object.prototype.toString.call(xs) === '[object Array]';
};

var indexOf = function (xs, x) {
    if (xs.indexOf) return xs.indexOf(x);
    for (var i = 0; i < xs.length; i++) {
        if (xs[i] === x) return i;
    }
    return -1;
};

},{"./response":8,"Base64":9,"inherits":11,"stream":19}],8:[function(_dereq_,module,exports){
var Stream = _dereq_('stream');
var util = _dereq_('util');

var Response = module.exports = function (res) {
    this.offset = 0;
    this.readable = true;
};

util.inherits(Response, Stream);

var capable = {
    streaming : true,
    status2 : true
};

function parseHeaders (res) {
    var lines = res.getAllResponseHeaders().split(/\r?\n/);
    var headers = {};
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line === '') continue;
        
        var m = line.match(/^([^:]+):\s*(.*)/);
        if (m) {
            var key = m[1].toLowerCase(), value = m[2];
            
            if (headers[key] !== undefined) {
            
                if (isArray(headers[key])) {
                    headers[key].push(value);
                }
                else {
                    headers[key] = [ headers[key], value ];
                }
            }
            else {
                headers[key] = value;
            }
        }
        else {
            headers[line] = true;
        }
    }
    return headers;
}

Response.prototype.getResponse = function (xhr) {
    var respType = String(xhr.responseType).toLowerCase();
    if (respType === 'blob') return xhr.responseBlob || xhr.response;
    if (respType === 'arraybuffer') return xhr.response;
    return xhr.responseText;
}

Response.prototype.getHeader = function (key) {
    return this.headers[key.toLowerCase()];
};

Response.prototype.handle = function (res) {
    if (res.readyState === 2 && capable.status2) {
        try {
            this.statusCode = res.status;
            this.headers = parseHeaders(res);
        }
        catch (err) {
            capable.status2 = false;
        }
        
        if (capable.status2) {
            this.emit('ready');
        }
    }
    else if (capable.streaming && res.readyState === 3) {
        try {
            if (!this.statusCode) {
                this.statusCode = res.status;
                this.headers = parseHeaders(res);
                this.emit('ready');
            }
        }
        catch (err) {}
        
        try {
            this._emitData(res);
        }
        catch (err) {
            capable.streaming = false;
        }
    }
    else if (res.readyState === 4) {
        if (!this.statusCode) {
            this.statusCode = res.status;
            this.emit('ready');
        }
        this._emitData(res);
        
        if (res.error) {
            this.emit('error', this.getResponse(res));
        }
        else this.emit('end');
        
        this.emit('close');
    }
};

Response.prototype._emitData = function (res) {
    var respBody = this.getResponse(res);
    if (respBody.toString().match(/ArrayBuffer/)) {
        this.emit('data', new Uint8Array(respBody, this.offset));
        this.offset = respBody.byteLength;
        return;
    }
    if (respBody.length > this.offset) {
        this.emit('data', respBody.slice(this.offset));
        this.offset = respBody.length;
    }
};

var isArray = Array.isArray || function (xs) {
    return Object.prototype.toString.call(xs) === '[object Array]';
};

},{"stream":19,"util":30}],9:[function(_dereq_,module,exports){
;(function () {

  var object = typeof exports != 'undefined' ? exports : this; // #8: web workers
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  function InvalidCharacterError(message) {
    this.message = message;
  }
  InvalidCharacterError.prototype = new Error;
  InvalidCharacterError.prototype.name = 'InvalidCharacterError';

  // encoder
  // [https://gist.github.com/999166] by [https://github.com/nignag]
  object.btoa || (
  object.btoa = function (input) {
    for (
      // initialize result and counter
      var block, charCode, idx = 0, map = chars, output = '';
      // if the next input index does not exist:
      //   change the mapping table to "="
      //   check if d has no fractional digits
      input.charAt(idx | 0) || (map = '=', idx % 1);
      // "8 - idx % 1 * 8" generates the sequence 2, 4, 6, 8
      output += map.charAt(63 & block >> 8 - idx % 1 * 8)
    ) {
      charCode = input.charCodeAt(idx += 3/4);
      if (charCode > 0xFF) {
        throw new InvalidCharacterError("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.");
      }
      block = block << 8 | charCode;
    }
    return output;
  });

  // decoder
  // [https://gist.github.com/1020396] by [https://github.com/atk]
  object.atob || (
  object.atob = function (input) {
    input = input.replace(/=+$/, '');
    if (input.length % 4 == 1) {
      throw new InvalidCharacterError("'atob' failed: The string to be decoded is not correctly encoded.");
    }
    for (
      // initialize result and counters
      var bc = 0, bs, buffer, idx = 0, output = '';
      // get next character
      buffer = input.charAt(idx++);
      // character found in table? initialize bit storage and add its ascii value;
      ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer,
        // and if not first of each 4 characters,
        // convert the first 8 bits to one ascii character
        bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0
    ) {
      // try to find character in table (0-63, not found => -1)
      buffer = chars.indexOf(buffer);
    }
    return output;
  });

}());

},{}],10:[function(_dereq_,module,exports){
var http = _dereq_('http');

var https = module.exports;

for (var key in http) {
    if (http.hasOwnProperty(key)) https[key] = http[key];
};

https.request = function (params, cb) {
    if (!params) params = {};
    params.scheme = 'https';
    return http.request.call(this, params, cb);
}

},{"http":6}],11:[function(_dereq_,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],12:[function(_dereq_,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,_dereq_("VCmEsw"))
},{"VCmEsw":13}],13:[function(_dereq_,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],14:[function(_dereq_,module,exports){
(function (global){
/*! http://mths.be/punycode v1.2.4 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports;
	var freeModule = typeof module == 'object' && module &&
		module.exports == freeExports && module;
	var freeGlobal = typeof global == 'object' && global;
	if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^ -~]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /\x2E|\u3002|\uFF0E|\uFF61/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		while (length--) {
			array[length] = fn(array[length]);
		}
		return array;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings.
	 * @private
	 * @param {String} domain The domain name.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		return map(string.split(regexSeparators), fn).join('.');
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <http://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * http://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols to a Punycode string of ASCII-only
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name to Unicode. Only the
	 * Punycoded parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it on a string that has already been converted to
	 * Unicode.
	 * @memberOf punycode
	 * @param {String} domain The Punycode domain name to convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(domain) {
		return mapDomain(domain, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name to Punycode. Only the
	 * non-ASCII parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it with a domain that's already in ASCII.
	 * @memberOf punycode
	 * @param {String} domain The domain name to convert, as a Unicode string.
	 * @returns {String} The Punycode representation of the given domain name.
	 */
	function toASCII(domain) {
		return mapDomain(domain, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.2.4',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <http://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && !freeExports.nodeType) {
		if (freeModule) { // in Node.js or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else { // in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else { // in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],15:[function(_dereq_,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],16:[function(_dereq_,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return obj[k].map(function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],17:[function(_dereq_,module,exports){
'use strict';

exports.decode = exports.parse = _dereq_('./decode');
exports.encode = exports.stringify = _dereq_('./encode');

},{"./decode":15,"./encode":16}],18:[function(_dereq_,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.

module.exports = Duplex;
var inherits = _dereq_('inherits');
var setImmediate = _dereq_('process/browser.js').nextTick;
var Readable = _dereq_('./readable.js');
var Writable = _dereq_('./writable.js');

inherits(Duplex, Readable);

Duplex.prototype.write = Writable.prototype.write;
Duplex.prototype.end = Writable.prototype.end;
Duplex.prototype._write = Writable.prototype._write;

function Duplex(options) {
  if (!(this instanceof Duplex))
    return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  if (options && options.readable === false)
    this.readable = false;

  if (options && options.writable === false)
    this.writable = false;

  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false)
    this.allowHalfOpen = false;

  this.once('end', onend);
}

// the no-half-open enforcer
function onend() {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
  if (this.allowHalfOpen || this._writableState.ended)
    return;

  // no more data can be written.
  // But allow more writes to happen in this tick.
  var self = this;
  setImmediate(function () {
    self.end();
  });
}

},{"./readable.js":22,"./writable.js":24,"inherits":11,"process/browser.js":20}],19:[function(_dereq_,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Stream;

var EE = _dereq_('events').EventEmitter;
var inherits = _dereq_('inherits');

inherits(Stream, EE);
Stream.Readable = _dereq_('./readable.js');
Stream.Writable = _dereq_('./writable.js');
Stream.Duplex = _dereq_('./duplex.js');
Stream.Transform = _dereq_('./transform.js');
Stream.PassThrough = _dereq_('./passthrough.js');

// Backwards-compat with node 0.4.x
Stream.Stream = Stream;



// old-style streams.  Note that the pipe method (the only relevant
// part of this class) is overridden in the Readable class.

function Stream() {
  EE.call(this);
}

Stream.prototype.pipe = function(dest, options) {
  var source = this;

  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        source.pause();
      }
    }
  }

  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) {
      source.resume();
    }
  }

  dest.on('drain', ondrain);

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once.
  if (!dest._isStdio && (!options || options.end !== false)) {
    source.on('end', onend);
    source.on('close', onclose);
  }

  var didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest.end();
  }


  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;

    if (typeof dest.destroy === 'function') dest.destroy();
  }

  // don't leave dangling pipes when there are errors.
  function onerror(er) {
    cleanup();
    if (EE.listenerCount(this, 'error') === 0) {
      throw er; // Unhandled stream error in pipe.
    }
  }

  source.on('error', onerror);
  dest.on('error', onerror);

  // remove all the event listeners that were added.
  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);

    source.removeListener('end', onend);
    source.removeListener('close', onclose);

    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);

    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);

    dest.removeListener('close', cleanup);
  }

  source.on('end', cleanup);
  source.on('close', cleanup);

  dest.on('close', cleanup);

  dest.emit('pipe', source);

  // Allow for unix-like usage: A.pipe(B).pipe(C)
  return dest;
};

},{"./duplex.js":18,"./passthrough.js":21,"./readable.js":22,"./transform.js":23,"./writable.js":24,"events":5,"inherits":11}],20:[function(_dereq_,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],21:[function(_dereq_,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a passthrough stream.
// basically just the most minimal sort of Transform stream.
// Every written chunk gets output as-is.

module.exports = PassThrough;

var Transform = _dereq_('./transform.js');
var inherits = _dereq_('inherits');
inherits(PassThrough, Transform);

function PassThrough(options) {
  if (!(this instanceof PassThrough))
    return new PassThrough(options);

  Transform.call(this, options);
}

PassThrough.prototype._transform = function(chunk, encoding, cb) {
  cb(null, chunk);
};

},{"./transform.js":23,"inherits":11}],22:[function(_dereq_,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Readable;
Readable.ReadableState = ReadableState;

var EE = _dereq_('events').EventEmitter;
var Stream = _dereq_('./index.js');
var Buffer = _dereq_('buffer').Buffer;
var setImmediate = _dereq_('process/browser.js').nextTick;
var StringDecoder;

var inherits = _dereq_('inherits');
inherits(Readable, Stream);

function ReadableState(options, stream) {
  options = options || {};

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : 16 * 1024;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.buffer = [];
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = false;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // In streams that never have any data, and do push(null) right away,
  // the consumer can miss the 'end' event if they do some I/O before
  // consuming the stream.  So, we don't emit('end') until some reading
  // happens.
  this.calledRead = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, becuase any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;


  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
  this.objectMode = !!options.objectMode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // when piping, we only care about 'readable' events that happen
  // after read()ing all the bytes and not getting any pushback.
  this.ranOut = false;

  // the number of writers that are awaiting a drain event in .pipe()s
  this.awaitDrain = 0;

  // if true, a maybeReadMore has been scheduled
  this.readingMore = false;

  this.decoder = null;
  this.encoding = null;
  if (options.encoding) {
    if (!StringDecoder)
      StringDecoder = _dereq_('string_decoder').StringDecoder;
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

function Readable(options) {
  if (!(this instanceof Readable))
    return new Readable(options);

  this._readableState = new ReadableState(options, this);

  // legacy
  this.readable = true;

  Stream.call(this);
}

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
Readable.prototype.push = function(chunk, encoding) {
  var state = this._readableState;

  if (typeof chunk === 'string' && !state.objectMode) {
    encoding = encoding || state.defaultEncoding;
    if (encoding !== state.encoding) {
      chunk = new Buffer(chunk, encoding);
      encoding = '';
    }
  }

  return readableAddChunk(this, state, chunk, encoding, false);
};

// Unshift should *always* be something directly out of read()
Readable.prototype.unshift = function(chunk) {
  var state = this._readableState;
  return readableAddChunk(this, state, chunk, '', true);
};

function readableAddChunk(stream, state, chunk, encoding, addToFront) {
  var er = chunkInvalid(state, chunk);
  if (er) {
    stream.emit('error', er);
  } else if (chunk === null || chunk === undefined) {
    state.reading = false;
    if (!state.ended)
      onEofChunk(stream, state);
  } else if (state.objectMode || chunk && chunk.length > 0) {
    if (state.ended && !addToFront) {
      var e = new Error('stream.push() after EOF');
      stream.emit('error', e);
    } else if (state.endEmitted && addToFront) {
      var e = new Error('stream.unshift() after end event');
      stream.emit('error', e);
    } else {
      if (state.decoder && !addToFront && !encoding)
        chunk = state.decoder.write(chunk);

      // update the buffer info.
      state.length += state.objectMode ? 1 : chunk.length;
      if (addToFront) {
        state.buffer.unshift(chunk);
      } else {
        state.reading = false;
        state.buffer.push(chunk);
      }

      if (state.needReadable)
        emitReadable(stream);

      maybeReadMore(stream, state);
    }
  } else if (!addToFront) {
    state.reading = false;
  }

  return needMoreData(state);
}



// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
function needMoreData(state) {
  return !state.ended &&
         (state.needReadable ||
          state.length < state.highWaterMark ||
          state.length === 0);
}

// backwards compatibility.
Readable.prototype.setEncoding = function(enc) {
  if (!StringDecoder)
    StringDecoder = _dereq_('string_decoder').StringDecoder;
  this._readableState.decoder = new StringDecoder(enc);
  this._readableState.encoding = enc;
};

// Don't raise the hwm > 128MB
var MAX_HWM = 0x800000;
function roundUpToNextPowerOf2(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2
    n--;
    for (var p = 1; p < 32; p <<= 1) n |= n >> p;
    n++;
  }
  return n;
}

function howMuchToRead(n, state) {
  if (state.length === 0 && state.ended)
    return 0;

  if (state.objectMode)
    return n === 0 ? 0 : 1;

  if (isNaN(n) || n === null) {
    // only flow one buffer at a time
    if (state.flowing && state.buffer.length)
      return state.buffer[0].length;
    else
      return state.length;
  }

  if (n <= 0)
    return 0;

  // If we're asking for more than the target buffer level,
  // then raise the water mark.  Bump up to the next highest
  // power of 2, to prevent increasing it excessively in tiny
  // amounts.
  if (n > state.highWaterMark)
    state.highWaterMark = roundUpToNextPowerOf2(n);

  // don't have that much.  return null, unless we've ended.
  if (n > state.length) {
    if (!state.ended) {
      state.needReadable = true;
      return 0;
    } else
      return state.length;
  }

  return n;
}

// you can override either this method, or the async _read(n) below.
Readable.prototype.read = function(n) {
  var state = this._readableState;
  state.calledRead = true;
  var nOrig = n;

  if (typeof n !== 'number' || n > 0)
    state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 &&
      state.needReadable &&
      (state.length >= state.highWaterMark || state.ended)) {
    emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0)
      endReadable(this);
    return null;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  var doRead = state.needReadable;

  // if we currently have less than the highWaterMark, then also read some
  if (state.length - n <= state.highWaterMark)
    doRead = true;

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading)
    doRead = false;

  if (doRead) {
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0)
      state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
  }

  // If _read called its callback synchronously, then `reading`
  // will be false, and we need to re-evaluate how much data we
  // can return to the user.
  if (doRead && !state.reading)
    n = howMuchToRead(nOrig, state);

  var ret;
  if (n > 0)
    ret = fromList(n, state);
  else
    ret = null;

  if (ret === null) {
    state.needReadable = true;
    n = 0;
  }

  state.length -= n;

  // If we have nothing in the buffer, then we want to know
  // as soon as we *do* get something into the buffer.
  if (state.length === 0 && !state.ended)
    state.needReadable = true;

  // If we happened to read() exactly the remaining amount in the
  // buffer, and the EOF has been seen at this point, then make sure
  // that we emit 'end' on the very next tick.
  if (state.ended && !state.endEmitted && state.length === 0)
    endReadable(this);

  return ret;
};

function chunkInvalid(state, chunk) {
  var er = null;
  if (!Buffer.isBuffer(chunk) &&
      'string' !== typeof chunk &&
      chunk !== null &&
      chunk !== undefined &&
      !state.objectMode &&
      !er) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  return er;
}


function onEofChunk(stream, state) {
  if (state.decoder && !state.ended) {
    var chunk = state.decoder.end();
    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  // if we've ended and we have some data left, then emit
  // 'readable' now to make sure it gets picked up.
  if (state.length > 0)
    emitReadable(stream);
  else
    endReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (state.emittedReadable)
    return;

  state.emittedReadable = true;
  if (state.sync)
    setImmediate(function() {
      emitReadable_(stream);
    });
  else
    emitReadable_(stream);
}

function emitReadable_(stream) {
  stream.emit('readable');
}


// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    setImmediate(function() {
      maybeReadMore_(stream, state);
    });
  }
}

function maybeReadMore_(stream, state) {
  var len = state.length;
  while (!state.reading && !state.flowing && !state.ended &&
         state.length < state.highWaterMark) {
    stream.read(0);
    if (len === state.length)
      // didn't get any data, stop spinning.
      break;
    else
      len = state.length;
  }
  state.readingMore = false;
}

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
Readable.prototype._read = function(n) {
  this.emit('error', new Error('not implemented'));
};

Readable.prototype.pipe = function(dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;
    case 1:
      state.pipes = [state.pipes, dest];
      break;
    default:
      state.pipes.push(dest);
      break;
  }
  state.pipesCount += 1;

  var doEnd = (!pipeOpts || pipeOpts.end !== false) &&
              dest !== process.stdout &&
              dest !== process.stderr;

  var endFn = doEnd ? onend : cleanup;
  if (state.endEmitted)
    setImmediate(endFn);
  else
    src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable) {
    if (readable !== src) return;
    cleanup();
  }

  function onend() {
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  function cleanup() {
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', cleanup);

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (!dest._writableState || dest._writableState.needDrain)
      ondrain();
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  // check for listeners before emit removes one-time listeners.
  var errListeners = EE.listenerCount(dest, 'error');
  function onerror(er) {
    unpipe();
    if (errListeners === 0 && EE.listenerCount(dest, 'error') === 0)
      dest.emit('error', er);
  }
  dest.once('error', onerror);

  // Both close and finish should trigger unpipe, but only once.
  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    // the handler that waits for readable events after all
    // the data gets sucked out in flow.
    // This would be easier to follow with a .once() handler
    // in flow(), but that is too slow.
    this.on('readable', pipeOnReadable);

    state.flowing = true;
    setImmediate(function() {
      flow(src);
    });
  }

  return dest;
};

function pipeOnDrain(src) {
  return function() {
    var dest = this;
    var state = src._readableState;
    state.awaitDrain--;
    if (state.awaitDrain === 0)
      flow(src);
  };
}

function flow(src) {
  var state = src._readableState;
  var chunk;
  state.awaitDrain = 0;

  function write(dest, i, list) {
    var written = dest.write(chunk);
    if (false === written) {
      state.awaitDrain++;
    }
  }

  while (state.pipesCount && null !== (chunk = src.read())) {

    if (state.pipesCount === 1)
      write(state.pipes, 0, null);
    else
      forEach(state.pipes, write);

    src.emit('data', chunk);

    // if anyone needs a drain, then we have to wait for that.
    if (state.awaitDrain > 0)
      return;
  }

  // if every destination was unpiped, either before entering this
  // function, or in the while loop, then stop flowing.
  //
  // NB: This is a pretty rare edge case.
  if (state.pipesCount === 0) {
    state.flowing = false;

    // if there were data event listeners added, then switch to old mode.
    if (EE.listenerCount(src, 'data') > 0)
      emitDataEvents(src);
    return;
  }

  // at this point, no one needed a drain, so we just ran out of data
  // on the next readable event, start it over again.
  state.ranOut = true;
}

function pipeOnReadable() {
  if (this._readableState.ranOut) {
    this._readableState.ranOut = false;
    flow(this);
  }
}


Readable.prototype.unpipe = function(dest) {
  var state = this._readableState;

  // if we're not piping anywhere, then do nothing.
  if (state.pipesCount === 0)
    return this;

  // just one destination.  most common case.
  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes)
      return this;

    if (!dest)
      dest = state.pipes;

    // got a match.
    state.pipes = null;
    state.pipesCount = 0;
    this.removeListener('readable', pipeOnReadable);
    state.flowing = false;
    if (dest)
      dest.emit('unpipe', this);
    return this;
  }

  // slow case. multiple pipe destinations.

  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    this.removeListener('readable', pipeOnReadable);
    state.flowing = false;

    for (var i = 0; i < len; i++)
      dests[i].emit('unpipe', this);
    return this;
  }

  // try to find the right one.
  var i = indexOf(state.pipes, dest);
  if (i === -1)
    return this;

  state.pipes.splice(i, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1)
    state.pipes = state.pipes[0];

  dest.emit('unpipe', this);

  return this;
};

// set up data events if they are asked for
// Ensure readable listeners eventually get something
Readable.prototype.on = function(ev, fn) {
  var res = Stream.prototype.on.call(this, ev, fn);

  if (ev === 'data' && !this._readableState.flowing)
    emitDataEvents(this);

  if (ev === 'readable' && this.readable) {
    var state = this._readableState;
    if (!state.readableListening) {
      state.readableListening = true;
      state.emittedReadable = false;
      state.needReadable = true;
      if (!state.reading) {
        this.read(0);
      } else if (state.length) {
        emitReadable(this, state);
      }
    }
  }

  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
Readable.prototype.resume = function() {
  emitDataEvents(this);
  this.read(0);
  this.emit('resume');
};

Readable.prototype.pause = function() {
  emitDataEvents(this, true);
  this.emit('pause');
};

function emitDataEvents(stream, startPaused) {
  var state = stream._readableState;

  if (state.flowing) {
    // https://github.com/isaacs/readable-stream/issues/16
    throw new Error('Cannot switch to old mode now.');
  }

  var paused = startPaused || false;
  var readable = false;

  // convert to an old-style stream.
  stream.readable = true;
  stream.pipe = Stream.prototype.pipe;
  stream.on = stream.addListener = Stream.prototype.on;

  stream.on('readable', function() {
    readable = true;

    var c;
    while (!paused && (null !== (c = stream.read())))
      stream.emit('data', c);

    if (c === null) {
      readable = false;
      stream._readableState.needReadable = true;
    }
  });

  stream.pause = function() {
    paused = true;
    this.emit('pause');
  };

  stream.resume = function() {
    paused = false;
    if (readable)
      setImmediate(function() {
        stream.emit('readable');
      });
    else
      this.read(0);
    this.emit('resume');
  };

  // now make it start, just in case it hadn't already.
  stream.emit('readable');
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function(stream) {
  var state = this._readableState;
  var paused = false;

  var self = this;
  stream.on('end', function() {
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length)
        self.push(chunk);
    }

    self.push(null);
  });

  stream.on('data', function(chunk) {
    if (state.decoder)
      chunk = state.decoder.write(chunk);
    if (!chunk || !state.objectMode && !chunk.length)
      return;

    var ret = self.push(chunk);
    if (!ret) {
      paused = true;
      stream.pause();
    }
  });

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
  for (var i in stream) {
    if (typeof stream[i] === 'function' &&
        typeof this[i] === 'undefined') {
      this[i] = function(method) { return function() {
        return stream[method].apply(stream, arguments);
      }}(i);
    }
  }

  // proxy certain important events.
  var events = ['error', 'close', 'destroy', 'pause', 'resume'];
  forEach(events, function(ev) {
    stream.on(ev, function (x) {
      return self.emit.apply(self, ev, x);
    });
  });

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
  self._read = function(n) {
    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return self;
};



// exposed for testing purposes only.
Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
function fromList(n, state) {
  var list = state.buffer;
  var length = state.length;
  var stringMode = !!state.decoder;
  var objectMode = !!state.objectMode;
  var ret;

  // nothing in the list, definitely empty.
  if (list.length === 0)
    return null;

  if (length === 0)
    ret = null;
  else if (objectMode)
    ret = list.shift();
  else if (!n || n >= length) {
    // read it all, truncate the array.
    if (stringMode)
      ret = list.join('');
    else
      ret = Buffer.concat(list, length);
    list.length = 0;
  } else {
    // read just some of it.
    if (n < list[0].length) {
      // just take a part of the first list item.
      // slice is the same for buffers and strings.
      var buf = list[0];
      ret = buf.slice(0, n);
      list[0] = buf.slice(n);
    } else if (n === list[0].length) {
      // first list is a perfect match
      ret = list.shift();
    } else {
      // complex case.
      // we have enough to cover it, but it spans past the first buffer.
      if (stringMode)
        ret = '';
      else
        ret = new Buffer(n);

      var c = 0;
      for (var i = 0, l = list.length; i < l && c < n; i++) {
        var buf = list[0];
        var cpy = Math.min(n - c, buf.length);

        if (stringMode)
          ret += buf.slice(0, cpy);
        else
          buf.copy(ret, c, 0, cpy);

        if (cpy < buf.length)
          list[0] = buf.slice(cpy);
        else
          list.shift();

        c += cpy;
      }
    }
  }

  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
  if (state.length > 0)
    throw new Error('endReadable called on non-empty stream');

  if (!state.endEmitted && state.calledRead) {
    state.ended = true;
    setImmediate(function() {
      // Check that we didn't get one last unshift.
      if (!state.endEmitted && state.length === 0) {
        state.endEmitted = true;
        stream.readable = false;
        stream.emit('end');
      }
    });
  }
}

function forEach (xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

function indexOf (xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }
  return -1;
}

}).call(this,_dereq_("VCmEsw"))
},{"./index.js":19,"VCmEsw":13,"buffer":2,"events":5,"inherits":11,"process/browser.js":20,"string_decoder":25}],23:[function(_dereq_,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.

module.exports = Transform;

var Duplex = _dereq_('./duplex.js');
var inherits = _dereq_('inherits');
inherits(Transform, Duplex);


function TransformState(options, stream) {
  this.afterTransform = function(er, data) {
    return afterTransform(stream, er, data);
  };

  this.needTransform = false;
  this.transforming = false;
  this.writecb = null;
  this.writechunk = null;
}

function afterTransform(stream, er, data) {
  var ts = stream._transformState;
  ts.transforming = false;

  var cb = ts.writecb;

  if (!cb)
    return stream.emit('error', new Error('no writecb in Transform class'));

  ts.writechunk = null;
  ts.writecb = null;

  if (data !== null && data !== undefined)
    stream.push(data);

  if (cb)
    cb(er);

  var rs = stream._readableState;
  rs.reading = false;
  if (rs.needReadable || rs.length < rs.highWaterMark) {
    stream._read(rs.highWaterMark);
  }
}


function Transform(options) {
  if (!(this instanceof Transform))
    return new Transform(options);

  Duplex.call(this, options);

  var ts = this._transformState = new TransformState(options, this);

  // when the writable side finishes, then flush out anything remaining.
  var stream = this;

  // start out asking for a readable event once data is transformed.
  this._readableState.needReadable = true;

  // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
  this._readableState.sync = false;

  this.once('finish', function() {
    if ('function' === typeof this._flush)
      this._flush(function(er) {
        done(stream, er);
      });
    else
      done(stream);
  });
}

Transform.prototype.push = function(chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
};

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
Transform.prototype._transform = function(chunk, encoding, cb) {
  throw new Error('not implemented');
};

Transform.prototype._write = function(chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;
  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform ||
        rs.needReadable ||
        rs.length < rs.highWaterMark)
      this._read(rs.highWaterMark);
  }
};

// Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.
Transform.prototype._read = function(n) {
  var ts = this._transformState;

  if (ts.writechunk && ts.writecb && !ts.transforming) {
    ts.transforming = true;
    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};


function done(stream, er) {
  if (er)
    return stream.emit('error', er);

  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided
  var ws = stream._writableState;
  var rs = stream._readableState;
  var ts = stream._transformState;

  if (ws.length)
    throw new Error('calling transform done when ws.length != 0');

  if (ts.transforming)
    throw new Error('calling transform done when still transforming');

  return stream.push(null);
}

},{"./duplex.js":18,"inherits":11}],24:[function(_dereq_,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// A bit simpler than readable streams.
// Implement an async ._write(chunk, cb), and it'll handle all
// the drain event emission and buffering.

module.exports = Writable;
Writable.WritableState = WritableState;

var isUint8Array = typeof Uint8Array !== 'undefined'
  ? function (x) { return x instanceof Uint8Array }
  : function (x) {
    return x && x.constructor && x.constructor.name === 'Uint8Array'
  }
;
var isArrayBuffer = typeof ArrayBuffer !== 'undefined'
  ? function (x) { return x instanceof ArrayBuffer }
  : function (x) {
    return x && x.constructor && x.constructor.name === 'ArrayBuffer'
  }
;

var inherits = _dereq_('inherits');
var Stream = _dereq_('./index.js');
var setImmediate = _dereq_('process/browser.js').nextTick;
var Buffer = _dereq_('buffer').Buffer;

inherits(Writable, Stream);

function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
}

function WritableState(options, stream) {
  options = options || {};

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : 16 * 1024;

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.needDrain = false;
  // at the start of calling end()
  this.ending = false;
  // when end() has been called, and returned
  this.ended = false;
  // when 'finish' is emitted
  this.finished = false;

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
  this.length = 0;

  // a flag to see when we're in the middle of a write.
  this.writing = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, becuase any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
  this.bufferProcessing = false;

  // the callback that's passed to _write(chunk,cb)
  this.onwrite = function(er) {
    onwrite(stream, er);
  };

  // the callback that the user supplies to write(chunk,encoding,cb)
  this.writecb = null;

  // the amount that is being written when _write is called.
  this.writelen = 0;

  this.buffer = [];
}

function Writable(options) {
  // Writable ctor is applied to Duplexes, though they're not
  // instanceof Writable, they're instanceof Readable.
  if (!(this instanceof Writable) && !(this instanceof Stream.Duplex))
    return new Writable(options);

  this._writableState = new WritableState(options, this);

  // legacy.
  this.writable = true;

  Stream.call(this);
}

// Otherwise people can pipe Writable streams, which is just wrong.
Writable.prototype.pipe = function() {
  this.emit('error', new Error('Cannot pipe. Not readable.'));
};


function writeAfterEnd(stream, state, cb) {
  var er = new Error('write after end');
  // TODO: defer error events consistently everywhere, not just the cb
  stream.emit('error', er);
  setImmediate(function() {
    cb(er);
  });
}

// If we get something that is not a buffer, string, null, or undefined,
// and we're not in objectMode, then that's an error.
// Otherwise stream chunks are all considered to be of length=1, and the
// watermarks determine how many objects to keep in the buffer, rather than
// how many bytes or characters.
function validChunk(stream, state, chunk, cb) {
  var valid = true;
  if (!Buffer.isBuffer(chunk) &&
      'string' !== typeof chunk &&
      chunk !== null &&
      chunk !== undefined &&
      !state.objectMode) {
    var er = new TypeError('Invalid non-string/buffer chunk');
    stream.emit('error', er);
    setImmediate(function() {
      cb(er);
    });
    valid = false;
  }
  return valid;
}

Writable.prototype.write = function(chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (!Buffer.isBuffer(chunk) && isUint8Array(chunk))
    chunk = new Buffer(chunk);
  if (isArrayBuffer(chunk) && typeof Uint8Array !== 'undefined')
    chunk = new Buffer(new Uint8Array(chunk));
  
  if (Buffer.isBuffer(chunk))
    encoding = 'buffer';
  else if (!encoding)
    encoding = state.defaultEncoding;

  if (typeof cb !== 'function')
    cb = function() {};

  if (state.ended)
    writeAfterEnd(this, state, cb);
  else if (validChunk(this, state, chunk, cb))
    ret = writeOrBuffer(this, state, chunk, encoding, cb);

  return ret;
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode &&
      state.decodeStrings !== false &&
      typeof chunk === 'string') {
    chunk = new Buffer(chunk, encoding);
  }
  return chunk;
}

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, chunk, encoding, cb) {
  chunk = decodeChunk(state, chunk, encoding);
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  state.needDrain = !ret;

  if (state.writing)
    state.buffer.push(new WriteReq(chunk, encoding, cb));
  else
    doWrite(stream, state, len, chunk, encoding, cb);

  return ret;
}

function doWrite(stream, state, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  if (sync)
    setImmediate(function() {
      cb(er);
    });
  else
    cb(er);

  stream.emit('error', er);
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;

  onwriteStateUpdate(state);

  if (er)
    onwriteError(stream, state, sync, er, cb);
  else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(stream, state);

    if (!finished && !state.bufferProcessing && state.buffer.length)
      clearBuffer(stream, state);

    if (sync) {
      setImmediate(function() {
        afterWrite(stream, state, finished, cb);
      });
    } else {
      afterWrite(stream, state, finished, cb);
    }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished)
    onwriteDrain(stream, state);
  cb();
  if (finished)
    finishMaybe(stream, state);
}

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
}


// if there's something in the buffer waiting, then process it
function clearBuffer(stream, state) {
  state.bufferProcessing = true;

  for (var c = 0; c < state.buffer.length; c++) {
    var entry = state.buffer[c];
    var chunk = entry.chunk;
    var encoding = entry.encoding;
    var cb = entry.callback;
    var len = state.objectMode ? 1 : chunk.length;

    doWrite(stream, state, len, chunk, encoding, cb);

    // if we didn't call the onwrite immediately, then
    // it means that we need to wait until it does.
    // also, that means that the chunk and cb are currently
    // being processed, so move the buffer counter past them.
    if (state.writing) {
      c++;
      break;
    }
  }

  state.bufferProcessing = false;
  if (c < state.buffer.length)
    state.buffer = state.buffer.slice(c);
  else
    state.buffer.length = 0;
}

Writable.prototype._write = function(chunk, encoding, cb) {
  cb(new Error('not implemented'));
};

Writable.prototype.end = function(chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (typeof chunk !== 'undefined' && chunk !== null)
    this.write(chunk, encoding);

  // ignore unnecessary end() calls.
  if (!state.ending && !state.finished)
    endWritable(this, state, cb);
};


function needFinish(stream, state) {
  return (state.ending &&
          state.length === 0 &&
          !state.finished &&
          !state.writing);
}

function finishMaybe(stream, state) {
  var need = needFinish(stream, state);
  if (need) {
    state.finished = true;
    stream.emit('finish');
  }
  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);
  if (cb) {
    if (state.finished)
      setImmediate(cb);
    else
      stream.once('finish', cb);
  }
  state.ended = true;
}

},{"./index.js":19,"buffer":2,"inherits":11,"process/browser.js":20}],25:[function(_dereq_,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var Buffer = _dereq_('buffer').Buffer;

function assertEncoding(encoding) {
  if (encoding && !Buffer.isEncoding(encoding)) {
    throw new Error('Unknown encoding: ' + encoding);
  }
}

var StringDecoder = exports.StringDecoder = function(encoding) {
  this.encoding = (encoding || 'utf8').toLowerCase().replace(/[-_]/, '');
  assertEncoding(encoding);
  switch (this.encoding) {
    case 'utf8':
      // CESU-8 represents each of Surrogate Pair by 3-bytes
      this.surrogateSize = 3;
      break;
    case 'ucs2':
    case 'utf16le':
      // UTF-16 represents each of Surrogate Pair by 2-bytes
      this.surrogateSize = 2;
      this.detectIncompleteChar = utf16DetectIncompleteChar;
      break;
    case 'base64':
      // Base-64 stores 3 bytes in 4 chars, and pads the remainder.
      this.surrogateSize = 3;
      this.detectIncompleteChar = base64DetectIncompleteChar;
      break;
    default:
      this.write = passThroughWrite;
      return;
  }

  this.charBuffer = new Buffer(6);
  this.charReceived = 0;
  this.charLength = 0;
};


StringDecoder.prototype.write = function(buffer) {
  var charStr = '';
  var offset = 0;

  // if our last write ended with an incomplete multibyte character
  while (this.charLength) {
    // determine how many remaining bytes this buffer has to offer for this char
    var i = (buffer.length >= this.charLength - this.charReceived) ?
                this.charLength - this.charReceived :
                buffer.length;

    // add the new bytes to the char buffer
    buffer.copy(this.charBuffer, this.charReceived, offset, i);
    this.charReceived += (i - offset);
    offset = i;

    if (this.charReceived < this.charLength) {
      // still not enough chars in this buffer? wait for more ...
      return '';
    }

    // get the character that was split
    charStr = this.charBuffer.slice(0, this.charLength).toString(this.encoding);

    // lead surrogate (D800-DBFF) is also the incomplete character
    var charCode = charStr.charCodeAt(charStr.length - 1);
    if (charCode >= 0xD800 && charCode <= 0xDBFF) {
      this.charLength += this.surrogateSize;
      charStr = '';
      continue;
    }
    this.charReceived = this.charLength = 0;

    // if there are no more bytes in this buffer, just emit our char
    if (i == buffer.length) return charStr;

    // otherwise cut off the characters end from the beginning of this buffer
    buffer = buffer.slice(i, buffer.length);
    break;
  }

  var lenIncomplete = this.detectIncompleteChar(buffer);

  var end = buffer.length;
  if (this.charLength) {
    // buffer the incomplete character bytes we got
    buffer.copy(this.charBuffer, 0, buffer.length - lenIncomplete, end);
    this.charReceived = lenIncomplete;
    end -= lenIncomplete;
  }

  charStr += buffer.toString(this.encoding, 0, end);

  var end = charStr.length - 1;
  var charCode = charStr.charCodeAt(end);
  // lead surrogate (D800-DBFF) is also the incomplete character
  if (charCode >= 0xD800 && charCode <= 0xDBFF) {
    var size = this.surrogateSize;
    this.charLength += size;
    this.charReceived += size;
    this.charBuffer.copy(this.charBuffer, size, 0, size);
    this.charBuffer.write(charStr.charAt(charStr.length - 1), this.encoding);
    return charStr.substring(0, end);
  }

  // or just emit the charStr
  return charStr;
};

StringDecoder.prototype.detectIncompleteChar = function(buffer) {
  // determine how many bytes we have to check at the end of this buffer
  var i = (buffer.length >= 3) ? 3 : buffer.length;

  // Figure out if one of the last i bytes of our buffer announces an
  // incomplete char.
  for (; i > 0; i--) {
    var c = buffer[buffer.length - i];

    // See http://en.wikipedia.org/wiki/UTF-8#Description

    // 110XXXXX
    if (i == 1 && c >> 5 == 0x06) {
      this.charLength = 2;
      break;
    }

    // 1110XXXX
    if (i <= 2 && c >> 4 == 0x0E) {
      this.charLength = 3;
      break;
    }

    // 11110XXX
    if (i <= 3 && c >> 3 == 0x1E) {
      this.charLength = 4;
      break;
    }
  }

  return i;
};

StringDecoder.prototype.end = function(buffer) {
  var res = '';
  if (buffer && buffer.length)
    res = this.write(buffer);

  if (this.charReceived) {
    var cr = this.charReceived;
    var buf = this.charBuffer;
    var enc = this.encoding;
    res += buf.slice(0, cr).toString(enc);
  }

  return res;
};

function passThroughWrite(buffer) {
  return buffer.toString(this.encoding);
}

function utf16DetectIncompleteChar(buffer) {
  var incomplete = this.charReceived = buffer.length % 2;
  this.charLength = incomplete ? 2 : 0;
  return incomplete;
}

function base64DetectIncompleteChar(buffer) {
  var incomplete = this.charReceived = buffer.length % 3;
  this.charLength = incomplete ? 3 : 0;
  return incomplete;
}

},{"buffer":2}],26:[function(_dereq_,module,exports){
// DOM APIs, for completeness

if (typeof setTimeout !== 'undefined') exports.setTimeout = function() { return setTimeout.apply(window, arguments); };
if (typeof clearTimeout !== 'undefined') exports.clearTimeout = function() { clearTimeout.apply(window, arguments); };
if (typeof setInterval !== 'undefined') exports.setInterval = function() { return setInterval.apply(window, arguments); };
if (typeof clearInterval !== 'undefined') exports.clearInterval = function() { clearInterval.apply(window, arguments); };

// TODO: Change to more effiecient list approach used in Node.js
// For now, we just implement the APIs using the primitives above.

exports.enroll = function(item, delay) {
  item._timeoutID = setTimeout(item._onTimeout, delay);
};

exports.unenroll = function(item) {
  clearTimeout(item._timeoutID);
};

exports.active = function(item) {
  // our naive impl doesn't care (correctness is still preserved)
};

exports.setImmediate = _dereq_('process/browser.js').nextTick;

},{"process/browser.js":27}],27:[function(_dereq_,module,exports){
module.exports=_dereq_(20)
},{}],28:[function(_dereq_,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var punycode = _dereq_('punycode');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

exports.Url = Url;

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
    hostEndingChars = ['/', '?', '#'],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = _dereq_('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && isObject(url) && url instanceof Url) return url;

  var u = new Url;
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
  if (!isString(url)) {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  var rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
    var hostEnd = -1;
    for (var i = 0; i < hostEndingChars.length; i++) {
      var hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
    var auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = decodeURIComponent(auth);
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (var i = 0; i < nonHostChars.length; i++) {
      var hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1)
      hostEnd = rest.length;

    this.host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    this.hostname = this.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      var hostparts = this.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    } else {
      // hostnames are always lower case.
      this.hostname = this.hostname.toLowerCase();
    }

    if (!ipv6Hostname) {
      // IDNA Support: Returns a puny coded representation of "domain".
      // It only converts the part of the domain name that
      // has non ASCII characters. I.e. it dosent matter if
      // you call it with a domain that already is in ASCII.
      var domainArray = this.hostname.split('.');
      var newOut = [];
      for (var i = 0; i < domainArray.length; ++i) {
        var s = domainArray[i];
        newOut.push(s.match(/[^A-Za-z0-9_-]/) ?
            'xn--' + punycode.encode(s) : s);
      }
      this.hostname = newOut.join('.');
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;
    this.href += this.host;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    this.query = rest.substr(qm + 1);
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  if (rest) this.pathname = rest;
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  //to support http.request
  if (this.pathname || this.search) {
    var p = this.pathname || '';
    var s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (isString(obj)) obj = urlParse(obj);
  if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}

Url.prototype.format = function() {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = this.protocol || '',
      pathname = this.pathname || '',
      hash = this.hash || '',
      host = false,
      query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ?
        this.hostname :
        '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }

  if (this.query &&
      isObject(this.query) &&
      Object.keys(this.query).length) {
    query = querystring.stringify(this.query);
  }

  var search = this.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  pathname = pathname.replace(/[?#]/g, function(match) {
    return encodeURIComponent(match);
  });
  search = search.replace('#', '%23');

  return protocol + host + pathname + search + hash;
};

function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

Url.prototype.resolve = function(relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}

Url.prototype.resolveObject = function(relative) {
  if (isString(relative)) {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  var result = new Url();
  Object.keys(this).forEach(function(k) {
    result[k] = this[k];
  }, this);

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    Object.keys(relative).forEach(function(k) {
      if (k !== 'protocol')
        result[k] = relative[k];
    });

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] &&
        result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      Object.keys(relative).forEach(function(k) {
        result[k] = relative[k];
      });
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }

  var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (result.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;
      else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    result.host = (relative.host || relative.host === '') ?
                  relative.host : result.host;
    result.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (!isNullOrUndefined(relative.search)) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especialy happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = result.host && result.host.indexOf('@') > 0 ?
                       result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (!isNull(result.pathname) || !isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
                    (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (result.host || relative.host) && (last === '.' || last === '..') ||
      last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last == '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    result.hostname = result.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especialy happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = result.host && result.host.indexOf('@') > 0 ?
                     result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (result.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (!isNull(result.pathname) || !isNull(result.search)) {
    result.path = (result.pathname ? result.pathname : '') +
                  (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function() {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};

function isString(arg) {
  return typeof arg === "string";
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isNull(arg) {
  return arg === null;
}
function isNullOrUndefined(arg) {
  return  arg == null;
}

},{"punycode":14,"querystring":17}],29:[function(_dereq_,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],30:[function(_dereq_,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = _dereq_('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = _dereq_('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,_dereq_("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":29,"VCmEsw":13,"inherits":11}],31:[function(_dereq_,module,exports){
// Ignore module for browserify (see package.json)
},{}],32:[function(_dereq_,module,exports){
(function (process,global,__dirname){
/**
 * A JavaScript implementation of the JSON-LD API.
 *
 * @author Dave Longley
 *
 * BSD 3-Clause License
 * Copyright (c) 2011-2014 Digital Bazaar, Inc.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 *
 * Redistributions in binary form must reproduce the above copyright
 * notice, this list of conditions and the following disclaimer in the
 * documentation and/or other materials provided with the distribution.
 *
 * Neither the name of the Digital Bazaar, Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
 * IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
 * TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
 * PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
 * TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
(function() {

// determine if in-browser or using node.js
var _nodejs = (
  typeof process !== 'undefined' && process.versions && process.versions.node);
var _browser = !_nodejs &&
  (typeof window !== 'undefined' || typeof self !== 'undefined');
if(_browser) {
  if(typeof global === 'undefined') {
    if(typeof window !== 'undefined') {
      global = window;
    } else if(typeof self !== 'undefined') {
      global = self;
    } else if(typeof $ !== 'undefined') {
      global = $;
    }
  }
}

// attaches jsonld API to the given object
var wrapper = function(jsonld) {

/* Core API */

/**
 * Performs JSON-LD compaction.
 *
 * @param input the JSON-LD input to compact.
 * @param ctx the context to compact with.
 * @param [options] options to use:
 *          [base] the base IRI to use.
 *          [compactArrays] true to compact arrays to single values when
 *            appropriate, false not to (default: true).
 *          [graph] true to always output a top-level graph (default: false).
 *          [expandContext] a context to expand with.
 *          [skipExpansion] true to assume the input is expanded and skip
 *            expansion, false not to, defaults to false.
 *          [documentLoader(url, callback(err, remoteDoc))] the document loader.
 * @param callback(err, compacted, ctx) called once the operation completes.
 */
jsonld.compact = function(input, ctx, options, callback) {
  if(arguments.length < 2) {
    return jsonld.nextTick(function() {
      callback(new TypeError('Could not compact, too few arguments.'));
    });
  }

  // get arguments
  if(typeof options === 'function') {
    callback = options;
    options = {};
  }
  options = options || {};

  if(ctx === null) {
    return jsonld.nextTick(function() {
      callback(new JsonLdError(
        'The compaction context must not be null.',
        'jsonld.CompactError', {code: 'invalid local context'}));
    });
  }

  // nothing to compact
  if(input === null) {
    return jsonld.nextTick(function() {
      callback(null, null);
    });
  }

  // set default options
  if(!('base' in options)) {
    options.base = (typeof input === 'string') ? input : '';
  }
  if(!('compactArrays' in options)) {
    options.compactArrays = true;
  }
  if(!('graph' in options)) {
    options.graph = false;
  }
  if(!('skipExpansion' in options)) {
    options.skipExpansion = false;
  }
  if(!('documentLoader' in options)) {
    options.documentLoader = jsonld.loadDocument;
  }
  if(!('link' in options)) {
    options.link = false;
  }
  if(options.link) {
    // force skip expansion when linking, "link" is not part of the public
    // API, it should only be called from framing
    options.skipExpansion = true;
  }

  var expand = function(input, options, callback) {
    jsonld.nextTick(function() {
      if(options.skipExpansion) {
        return callback(null, input);
      }
      jsonld.expand(input, options, callback);
    });
  };

  // expand input then do compaction
  expand(input, options, function(err, expanded) {
    if(err) {
      return callback(new JsonLdError(
        'Could not expand input before compaction.',
        'jsonld.CompactError', {cause: err}));
    }

    // process context
    var activeCtx = _getInitialContext(options);
    jsonld.processContext(activeCtx, ctx, options, function(err, activeCtx) {
      if(err) {
        return callback(new JsonLdError(
          'Could not process context before compaction.',
          'jsonld.CompactError', {cause: err}));
      }

      var compacted;
      try {
        // do compaction
        compacted = new Processor().compact(activeCtx, null, expanded, options);
      } catch(ex) {
        return callback(ex);
      }

      cleanup(null, compacted, activeCtx, options);
    });
  });

  // performs clean up after compaction
  function cleanup(err, compacted, activeCtx, options) {
    if(err) {
      return callback(err);
    }

    if(options.compactArrays && !options.graph && _isArray(compacted)) {
      if(compacted.length === 1) {
        // simplify to a single item
        compacted = compacted[0];
      } else if(compacted.length === 0) {
        // simplify to an empty object
        compacted = {};
      }
    } else if(options.graph && _isObject(compacted)) {
      // always use array if graph option is on
      compacted = [compacted];
    }

    // follow @context key
    if(_isObject(ctx) && '@context' in ctx) {
      ctx = ctx['@context'];
    }

    // build output context
    ctx = _clone(ctx);
    if(!_isArray(ctx)) {
      ctx = [ctx];
    }
    // remove empty contexts
    var tmp = ctx;
    ctx = [];
    for(var i = 0; i < tmp.length; ++i) {
      if(!_isObject(tmp[i]) || Object.keys(tmp[i]).length > 0) {
        ctx.push(tmp[i]);
      }
    }

    // remove array if only one context
    var hasContext = (ctx.length > 0);
    if(ctx.length === 1) {
      ctx = ctx[0];
    }

    // add context and/or @graph
    if(_isArray(compacted)) {
      // use '@graph' keyword
      var kwgraph = _compactIri(activeCtx, '@graph');
      var graph = compacted;
      compacted = {};
      if(hasContext) {
        compacted['@context'] = ctx;
      }
      compacted[kwgraph] = graph;
    } else if(_isObject(compacted) && hasContext) {
      // reorder keys so @context is first
      var graph = compacted;
      compacted = {'@context': ctx};
      for(var key in graph) {
        compacted[key] = graph[key];
      }
    }

    callback(null, compacted, activeCtx);
  }
};

/**
 * Performs JSON-LD expansion.
 *
 * @param input the JSON-LD input to expand.
 * @param [options] the options to use:
 *          [base] the base IRI to use.
 *          [expandContext] a context to expand with.
 *          [keepFreeFloatingNodes] true to keep free-floating nodes,
 *            false not to, defaults to false.
 *          [documentLoader(url, callback(err, remoteDoc))] the document loader.
 * @param callback(err, expanded) called once the operation completes.
 */
jsonld.expand = function(input, options, callback) {
  if(arguments.length < 1) {
    return jsonld.nextTick(function() {
      callback(new TypeError('Could not expand, too few arguments.'));
    });
  }

  // get arguments
  if(typeof options === 'function') {
    callback = options;
    options = {};
  }
  options = options || {};

  // set default options
  if(!('documentLoader' in options)) {
    options.documentLoader = jsonld.loadDocument;
  }
  if(!('keepFreeFloatingNodes' in options)) {
    options.keepFreeFloatingNodes = false;
  }

  jsonld.nextTick(function() {
    // if input is a string, attempt to dereference remote document
    if(typeof input === 'string') {
      var done = function(err, remoteDoc) {
        if(err) {
          return callback(err);
        }
        try {
          if(!remoteDoc.document) {
            throw new JsonLdError(
              'No remote document found at the given URL.',
              'jsonld.NullRemoteDocument');
          }
          if(typeof remoteDoc.document === 'string') {
            remoteDoc.document = JSON.parse(remoteDoc.document);
          }
        } catch(ex) {
          return callback(new JsonLdError(
            'Could not retrieve a JSON-LD document from the URL. URL ' +
            'dereferencing not implemented.', 'jsonld.LoadDocumentError', {
              code: 'loading document failed',
              cause: ex,
              remoteDoc: remoteDoc
          }));
        }
        expand(remoteDoc);
      };
      var promise = options.documentLoader(input, done);
      if(promise && 'then' in promise) {
        promise.then(done.bind(null, null), done);
      }
      return;
    }
    // nothing to load
    expand({contextUrl: null, documentUrl: null, document: input});
  });

  function expand(remoteDoc) {
    // set default base
    if(!('base' in options)) {
      options.base = remoteDoc.documentUrl || '';
    }
    // build meta-object and retrieve all @context URLs
    var input = {
      document: _clone(remoteDoc.document),
      remoteContext: {'@context': remoteDoc.contextUrl}
    };
    if('expandContext' in options) {
      var expandContext = _clone(options.expandContext);
      if(typeof expandContext === 'object' && '@context' in expandContext) {
        input.expandContext = expandContext;
      } else {
        input.expandContext = {'@context': expandContext};
      }
    }
    _retrieveContextUrls(input, options, function(err, input) {
      if(err) {
        return callback(err);
      }

      var expanded;
      try {
        var processor = new Processor();
        var activeCtx = _getInitialContext(options);
        var document = input.document;
        var remoteContext = input.remoteContext['@context'];

        // process optional expandContext
        if(input.expandContext) {
          activeCtx = processor.processContext(
            activeCtx, input.expandContext['@context'], options);
        }

        // process remote context from HTTP Link Header
        if(remoteContext) {
          activeCtx = processor.processContext(
            activeCtx, remoteContext, options);
        }

        // expand document
        expanded = processor.expand(
          activeCtx, null, document, options, false);

        // optimize away @graph with no other properties
        if(_isObject(expanded) && ('@graph' in expanded) &&
          Object.keys(expanded).length === 1) {
          expanded = expanded['@graph'];
        } else if(expanded === null) {
          expanded = [];
        }

        // normalize to an array
        if(!_isArray(expanded)) {
          expanded = [expanded];
        }
      } catch(ex) {
        return callback(ex);
      }
      callback(null, expanded);
    });
  }
};

/**
 * Performs JSON-LD flattening.
 *
 * @param input the JSON-LD to flatten.
 * @param ctx the context to use to compact the flattened output, or null.
 * @param [options] the options to use:
 *          [base] the base IRI to use.
 *          [expandContext] a context to expand with.
 *          [documentLoader(url, callback(err, remoteDoc))] the document loader.
 * @param callback(err, flattened) called once the operation completes.
 */
jsonld.flatten = function(input, ctx, options, callback) {
  if(arguments.length < 1) {
    return jsonld.nextTick(function() {
      callback(new TypeError('Could not flatten, too few arguments.'));
    });
  }

  // get arguments
  if(typeof options === 'function') {
    callback = options;
    options = {};
  } else if(typeof ctx === 'function') {
    callback = ctx;
    ctx = null;
    options = {};
  }
  options = options || {};

  // set default options
  if(!('base' in options)) {
    options.base = (typeof input === 'string') ? input : '';
  }
  if(!('documentLoader' in options)) {
    options.documentLoader = jsonld.loadDocument;
  }

  // expand input
  jsonld.expand(input, options, function(err, _input) {
    if(err) {
      return callback(new JsonLdError(
        'Could not expand input before flattening.',
        'jsonld.FlattenError', {cause: err}));
    }

    var flattened;
    try {
      // do flattening
      flattened = new Processor().flatten(_input);
    } catch(ex) {
      return callback(ex);
    }

    if(ctx === null) {
      return callback(null, flattened);
    }

    // compact result (force @graph option to true, skip expansion)
    options.graph = true;
    options.skipExpansion = true;
    jsonld.compact(flattened, ctx, options, function(err, compacted) {
      if(err) {
        return callback(new JsonLdError(
          'Could not compact flattened output.',
          'jsonld.FlattenError', {cause: err}));
      }
      callback(null, compacted);
    });
  });
};

/**
 * Performs JSON-LD framing.
 *
 * @param input the JSON-LD input to frame.
 * @param frame the JSON-LD frame to use.
 * @param [options] the framing options.
 *          [base] the base IRI to use.
 *          [expandContext] a context to expand with.
 *          [embed] default @embed flag: '@last', '@always', '@never', '@link'
 *            (default: '@last').
 *          [explicit] default @explicit flag (default: false).
 *          [requireAll] default @requireAll flag (default: true).
 *          [omitDefault] default @omitDefault flag (default: false).
 *          [documentLoader(url, callback(err, remoteDoc))] the document loader.
 * @param callback(err, framed) called once the operation completes.
 */
jsonld.frame = function(input, frame, options, callback) {
  if(arguments.length < 2) {
    return jsonld.nextTick(function() {
      callback(new TypeError('Could not frame, too few arguments.'));
    });
  }

  // get arguments
  if(typeof options === 'function') {
    callback = options;
    options = {};
  }
  options = options || {};

  // set default options
  if(!('base' in options)) {
    options.base = (typeof input === 'string') ? input : '';
  }
  if(!('documentLoader' in options)) {
    options.documentLoader = jsonld.loadDocument;
  }
  if(!('embed' in options)) {
    options.embed = '@last';
  }
  options.explicit = options.explicit || false;
  if(!('requireAll' in options)) {
    options.requireAll = true;
  }
  options.omitDefault = options.omitDefault || false;

  jsonld.nextTick(function() {
    // if frame is a string, attempt to dereference remote document
    if(typeof frame === 'string') {
      var done = function(err, remoteDoc) {
        if(err) {
          return callback(err);
        }
        try {
          if(!remoteDoc.document) {
            throw new JsonLdError(
              'No remote document found at the given URL.',
              'jsonld.NullRemoteDocument');
          }
          if(typeof remoteDoc.document === 'string') {
            remoteDoc.document = JSON.parse(remoteDoc.document);
          }
        } catch(ex) {
          return callback(new JsonLdError(
            'Could not retrieve a JSON-LD document from the URL. URL ' +
            'dereferencing not implemented.', 'jsonld.LoadDocumentError', {
              code: 'loading document failed',
              cause: ex,
              remoteDoc: remoteDoc
          }));
        }
        doFrame(remoteDoc);
      };
      var promise = options.documentLoader(frame, done);
      if(promise && 'then' in promise) {
        promise.then(done.bind(null, null), done);
      }
      return;
    }
    // nothing to load
    doFrame({contextUrl: null, documentUrl: null, document: frame});
  });

  function doFrame(remoteFrame) {
    // preserve frame context and add any Link header context
    var frame = remoteFrame.document;
    var ctx;
    if(frame) {
      ctx = frame['@context'];
      if(remoteFrame.contextUrl) {
        if(!ctx) {
          ctx = remoteFrame.contextUrl;
        } else if(_isArray(ctx)) {
          ctx.push(remoteFrame.contextUrl);
        } else {
          ctx = [ctx, remoteFrame.contextUrl];
        }
        frame['@context'] = ctx;
      } else {
        ctx = ctx || {};
      }
    } else {
      ctx = {};
    }

    // expand input
    jsonld.expand(input, options, function(err, expanded) {
      if(err) {
        return callback(new JsonLdError(
          'Could not expand input before framing.',
          'jsonld.FrameError', {cause: err}));
      }

      // expand frame
      var opts = _clone(options);
      opts.isFrame = true;
      opts.keepFreeFloatingNodes = true;
      jsonld.expand(frame, opts, function(err, expandedFrame) {
        if(err) {
          return callback(new JsonLdError(
            'Could not expand frame before framing.',
            'jsonld.FrameError', {cause: err}));
        }

        var framed;
        try {
          // do framing
          framed = new Processor().frame(expanded, expandedFrame, opts);
        } catch(ex) {
          return callback(ex);
        }

        // compact result (force @graph option to true, skip expansion,
        // check for linked embeds)
        opts.graph = true;
        opts.skipExpansion = true;
        opts.link = {};
        jsonld.compact(framed, ctx, opts, function(err, compacted, ctx) {
          if(err) {
            return callback(new JsonLdError(
              'Could not compact framed output.',
              'jsonld.FrameError', {cause: err}));
          }
          // get graph alias
          var graph = _compactIri(ctx, '@graph');
          // remove @preserve from results
          opts.link = {};
          compacted[graph] = _removePreserve(ctx, compacted[graph], opts);
          callback(null, compacted);
        });
      });
    });
  }
};

/**
 * **Experimental**
 *
 * Links a JSON-LD document's nodes in memory.
 *
 * @param input the JSON-LD document to link.
 * @param ctx the JSON-LD context to apply.
 * @param [options] the options to use:
 *          [base] the base IRI to use.
 *          [expandContext] a context to expand with.
 *          [documentLoader(url, callback(err, remoteDoc))] the document loader.
 * @param callback(err, linked) called once the operation completes.
 */
jsonld.link = function(input, ctx, options, callback) {
  // API matches running frame with a wildcard frame and embed: '@link'
  // get arguments
  var frame = {};
  if(ctx) {
    frame['@context'] = ctx;
  }
  frame['@embed'] = '@link';
  jsonld.frame(input, frame, options, callback);
};

/**
 * **Deprecated**
 *
 * Performs JSON-LD objectification.
 *
 * @param input the JSON-LD document to objectify.
 * @param ctx the JSON-LD context to apply.
 * @param [options] the options to use:
 *          [base] the base IRI to use.
 *          [expandContext] a context to expand with.
 *          [documentLoader(url, callback(err, remoteDoc))] the document loader.
 * @param callback(err, linked) called once the operation completes.
 */
jsonld.objectify = function(input, ctx, options, callback) {
  if(typeof options === 'function') {
    callback = options;
    options = {};
  }
  options = options || {};

  // set default options
  if(!('base' in options)) {
    options.base = (typeof input === 'string') ? input : '';
  }
  if(!('documentLoader' in options)) {
    options.documentLoader = jsonld.loadDocument;
  }

  // expand input
  jsonld.expand(input, options, function(err, _input) {
    if(err) {
      return callback(new JsonLdError(
        'Could not expand input before linking.',
        'jsonld.LinkError', {cause: err}));
    }

    var flattened;
    try {
      // flatten the graph
      flattened = new Processor().flatten(_input);
    } catch(ex) {
      return callback(ex);
    }

    // compact result (force @graph option to true, skip expansion)
    options.graph = true;
    options.skipExpansion = true;
    jsonld.compact(flattened, ctx, options, function(err, compacted, ctx) {
      if(err) {
        return callback(new JsonLdError(
          'Could not compact flattened output before linking.',
          'jsonld.LinkError', {cause: err}));
      }
      // get graph alias
      var graph = _compactIri(ctx, '@graph');
      var top = compacted[graph][0];

      var recurse = function(subject) {
        // can't replace just a string
        if(!_isObject(subject) && !_isArray(subject)) {
          return;
        }

        // bottom out recursion on re-visit
        if(_isObject(subject)) {
          if(recurse.visited[subject['@id']]) {
            return;
          }
          recurse.visited[subject['@id']] = true;
        }

        // each array element *or* object key
        for(var k in subject) {
          var obj = subject[k];
          var isid = (jsonld.getContextValue(ctx, k, '@type') === '@id');

          // can't replace a non-object or non-array unless it's an @id
          if(!_isArray(obj) && !_isObject(obj) && !isid) {
            continue;
          }

          if(_isString(obj) && isid) {
            subject[k] = obj = top[obj];
            recurse(obj);
          } else if(_isArray(obj)) {
            for(var i = 0; i < obj.length; ++i) {
              if(_isString(obj[i]) && isid) {
                obj[i] = top[obj[i]];
              } else if(_isObject(obj[i]) && '@id' in obj[i]) {
                obj[i] = top[obj[i]['@id']];
              }
              recurse(obj[i]);
            }
          } else if(_isObject(obj)) {
            var sid = obj['@id'];
            subject[k] = obj = top[sid];
            recurse(obj);
          }
        }
      };
      recurse.visited = {};
      recurse(top);

      compacted.of_type = {};
      for(var s in top) {
        if(!('@type' in top[s])) {
          continue;
        }
        var types = top[s]['@type'];
        if(!_isArray(types)) {
          types = [types];
        }
        for(var t = 0; t < types.length; ++t) {
          if(!(types[t] in compacted.of_type)) {
            compacted.of_type[types[t]] = [];
          }
          compacted.of_type[types[t]].push(top[s]);
        }
      }
      callback(null, compacted);
    });
  });
};

/**
 * Performs RDF dataset normalization on the given JSON-LD input. The output
 * is an RDF dataset unless the 'format' option is used.
 *
 * @param input the JSON-LD input to normalize.
 * @param [options] the options to use:
 *          [base] the base IRI to use.
 *          [expandContext] a context to expand with.
 *          [format] the format if output is a string:
 *            'application/nquads' for N-Quads.
 *          [documentLoader(url, callback(err, remoteDoc))] the document loader.
 * @param callback(err, normalized) called once the operation completes.
 */
jsonld.normalize = function(input, options, callback) {
  if(arguments.length < 1) {
    return jsonld.nextTick(function() {
      callback(new TypeError('Could not normalize, too few arguments.'));
    });
  }

  // get arguments
  if(typeof options === 'function') {
    callback = options;
    options = {};
  }
  options = options || {};

  // set default options
  if(!('base' in options)) {
    options.base = (typeof input === 'string') ? input : '';
  }
  if(!('documentLoader' in options)) {
    options.documentLoader = jsonld.loadDocument;
  }

  // convert to RDF dataset then do normalization
  var opts = _clone(options);
  delete opts.format;
  opts.produceGeneralizedRdf = false;
  jsonld.toRDF(input, opts, function(err, dataset) {
    if(err) {
      return callback(new JsonLdError(
        'Could not convert input to RDF dataset before normalization.',
        'jsonld.NormalizeError', {cause: err}));
    }

    // do normalization
    new Processor().normalize(dataset, options, callback);
  });
};

/**
 * Converts an RDF dataset to JSON-LD.
 *
 * @param dataset a serialized string of RDF in a format specified by the
 *          format option or an RDF dataset to convert.
 * @param [options] the options to use:
 *          [format] the format if dataset param must first be parsed:
 *            'application/nquads' for N-Quads (default).
 *          [rdfParser] a custom RDF-parser to use to parse the dataset.
 *          [useRdfType] true to use rdf:type, false to use @type
 *            (default: false).
 *          [useNativeTypes] true to convert XSD types into native types
 *            (boolean, integer, double), false not to (default: false).
 * @param callback(err, output) called once the operation completes.
 */
jsonld.fromRDF = function(dataset, options, callback) {
  if(arguments.length < 1) {
    return jsonld.nextTick(function() {
      callback(new TypeError('Could not convert from RDF, too few arguments.'));
    });
  }

  // get arguments
  if(typeof options === 'function') {
    callback = options;
    options = {};
  }
  options = options || {};

  // set default options
  if(!('useRdfType' in options)) {
    options.useRdfType = false;
  }
  if(!('useNativeTypes' in options)) {
    options.useNativeTypes = false;
  }

  if(!('format' in options) && _isString(dataset)) {
    // set default format to nquads
    if(!('format' in options)) {
      options.format = 'application/nquads';
    }
  }

  jsonld.nextTick(function() {
    // handle special format
    var rdfParser;
    if(options.format) {
      // check supported formats
      rdfParser = options.rdfParser || _rdfParsers[options.format];
      if(!rdfParser) {
        return callback(new JsonLdError(
          'Unknown input format.',
          'jsonld.UnknownFormat', {format: options.format}));
      }
    } else {
      // no-op parser, assume dataset already parsed
      rdfParser = function() {
        return dataset;
      };
    }

    var callbackCalled = false;
    try {
      // rdf parser may be async or sync, always pass callback
      dataset = rdfParser(dataset, function(err, dataset) {
        callbackCalled = true;
        if(err) {
          return callback(err);
        }
        fromRDF(dataset, options, callback);
      });
    } catch(e) {
      if(!callbackCalled) {
        return callback(e);
      }
      throw e;
    }
    // handle synchronous or promise-based parser
    if(dataset) {
      // if dataset is actually a promise
      if('then' in dataset) {
        return dataset.then(function(dataset) {
          fromRDF(dataset, options, callback);
        }, callback);
      }
      // parser is synchronous
      fromRDF(dataset, options, callback);
    }

    function fromRDF(dataset, options, callback) {
      // convert from RDF
      new Processor().fromRDF(dataset, options, callback);
    }
  });
};

/**
 * Outputs the RDF dataset found in the given JSON-LD object.
 *
 * @param input the JSON-LD input.
 * @param [options] the options to use:
 *          [base] the base IRI to use.
 *          [expandContext] a context to expand with.
 *          [format] the format to use to output a string:
 *            'application/nquads' for N-Quads.
 *          [produceGeneralizedRdf] true to output generalized RDF, false
 *            to produce only standard RDF (default: false).
 *          [documentLoader(url, callback(err, remoteDoc))] the document loader.
 * @param callback(err, dataset) called once the operation completes.
 */
jsonld.toRDF = function(input, options, callback) {
  if(arguments.length < 1) {
    return jsonld.nextTick(function() {
      callback(new TypeError('Could not convert to RDF, too few arguments.'));
    });
  }

  // get arguments
  if(typeof options === 'function') {
    callback = options;
    options = {};
  }
  options = options || {};

  // set default options
  if(!('base' in options)) {
    options.base = (typeof input === 'string') ? input : '';
  }
  if(!('documentLoader' in options)) {
    options.documentLoader = jsonld.loadDocument;
  }

  // expand input
  jsonld.expand(input, options, function(err, expanded) {
    if(err) {
      return callback(new JsonLdError(
        'Could not expand input before serialization to RDF.',
        'jsonld.RdfError', {cause: err}));
    }

    var dataset;
    try {
      // output RDF dataset
      dataset = Processor.prototype.toRDF(expanded, options);
      if(options.format) {
        if(options.format === 'application/nquads') {
          return callback(null, _toNQuads(dataset));
        }
        throw new JsonLdError(
          'Unknown output format.',
          'jsonld.UnknownFormat', {format: options.format});
      }
    } catch(ex) {
      return callback(ex);
    }
    callback(null, dataset);
  });
};

/**
 * **Experimental**
 *
 * Recursively flattens the nodes in the given JSON-LD input into a map of
 * node ID => node.
 *
 * @param input the JSON-LD input.
 * @param [options] the options to use:
 *          [base] the base IRI to use.
 *          [expandContext] a context to expand with.
 *          [namer] a jsonld.UniqueNamer to use to label blank nodes.
 *          [documentLoader(url, callback(err, remoteDoc))] the document loader.
 * @param callback(err, nodeMap) called once the operation completes.
 */
jsonld.createNodeMap = function(input, options, callback) {
  if(arguments.length < 1) {
    return jsonld.nextTick(function() {
      callback(new TypeError('Could not create node map, too few arguments.'));
    });
  }

  // get arguments
  if(typeof options === 'function') {
    callback = options;
    options = {};
  }
  options = options || {};

  // set default options
  if(!('base' in options)) {
    options.base = (typeof input === 'string') ? input : '';
  }
  if(!('documentLoader' in options)) {
    options.documentLoader = jsonld.loadDocument;
  }

  // expand input
  jsonld.expand(input, options, function(err, _input) {
    if(err) {
      return callback(new JsonLdError(
        'Could not expand input before creating node map.',
        'jsonld.CreateNodeMapError', {cause: err}));
    }

    var nodeMap;
    try {
      nodeMap = new Processor().createNodeMap(_input, options);
    } catch(ex) {
      return callback(ex);
    }

    callback(null, nodeMap);
  });
};

/**
 * **Experimental**
 *
 * Merges two or more JSON-LD documents into a single flattened document.
 *
 * @param docs the JSON-LD documents to merge together.
 * @param ctx the context to use to compact the merged result, or null.
 * @param [options] the options to use:
 *          [base] the base IRI to use.
 *          [expandContext] a context to expand with.
 *          [namer] a jsonld.UniqueNamer to use to label blank nodes.
 *          [mergeNodes] true to merge properties for nodes with the same ID,
 *            false to ignore new properties for nodes with the same ID once
 *            the ID has been defined; note that this may not prevent merging
 *            new properties where a node is in the `object` position
 *            (default: true).
 *          [documentLoader(url, callback(err, remoteDoc))] the document loader.
 * @param callback(err, merged) called once the operation completes.
 */
jsonld.merge = function(docs, ctx, options, callback) {
  if(arguments.length < 1) {
    return jsonld.nextTick(function() {
      callback(new TypeError('Could not merge, too few arguments.'));
    });
  }
  if(!_isArray(docs)) {
    return jsonld.nextTick(function() {
      callback(new TypeError('Could not merge, "docs" must be an array.'));
    });
  }

  // get arguments
  if(typeof options === 'function') {
    callback = options;
    options = {};
  } else if(typeof ctx === 'function') {
    callback = ctx;
    ctx = null;
    options = {};
  }
  options = options || {};

  // expand all documents
  var expanded = [];
  var error = null;
  var count = docs.length;
  for(var i = 0; i < docs.length; ++i) {
    var opts = {};
    for(var key in options) {
      opts[key] = options[key];
    }
    jsonld.expand(docs[i], opts, expandComplete);
  }

  function expandComplete(err, _input) {
    if(error) {
      return;
    }
    if(err) {
      error = err;
      return callback(new JsonLdError(
        'Could not expand input before flattening.',
        'jsonld.FlattenError', {cause: err}));
    }
    expanded.push(_input);
    if(--count === 0) {
      merge(expanded);
    }
  }

  function merge(expanded) {
    var mergeNodes = true;
    if('mergeNodes' in options) {
      mergeNodes = options.mergeNodes;
    }

    var namer = options.namer || new UniqueNamer('_:b');
    var graphs = {'@default': {}};

    var defaultGraph;
    try {
      for(var i = 0; i < expanded.length; ++i) {
        // uniquely relabel blank nodes
        var doc = expanded[i];
        doc = jsonld.relabelBlankNodes(doc, {
          namer: new UniqueNamer('_:b' + i + '-')
        });

        // add nodes to the shared node map graphs if merging nodes, to a
        // separate graph set if not
        var _graphs = (mergeNodes || i === 0) ? graphs : {'@default': {}};
        _createNodeMap(doc, _graphs, '@default', namer);

        if(_graphs !== graphs) {
          // merge document graphs but don't merge existing nodes
          for(var graphName in _graphs) {
            var _nodeMap = _graphs[graphName];
            if(!(graphName in graphs)) {
              graphs[graphName] = _nodeMap;
              continue;
            }
            var nodeMap = graphs[graphName];
            for(var key in _nodeMap) {
              if(!(key in nodeMap)) {
                nodeMap[key] = _nodeMap[key];
              }
            }
          }
        }
      }

      // add all non-default graphs to default graph
      defaultGraph = _mergeNodeMaps(graphs);
    } catch(ex) {
      return callback(ex);
    }

    // produce flattened output
    var flattened = [];
    var keys = Object.keys(defaultGraph).sort();
    for(var ki = 0; ki < keys.length; ++ki) {
      var node = defaultGraph[keys[ki]];
      // only add full subjects to top-level
      if(!_isSubjectReference(node)) {
        flattened.push(node);
      }
    }

    if(ctx === null) {
      return callback(null, flattened);
    }

    // compact result (force @graph option to true, skip expansion)
    options.graph = true;
    options.skipExpansion = true;
    jsonld.compact(flattened, ctx, options, function(err, compacted) {
      if(err) {
        return callback(new JsonLdError(
          'Could not compact merged output.',
          'jsonld.MergeError', {cause: err}));
      }
      callback(null, compacted);
    });
  }
};

/**
 * Relabels all blank nodes in the given JSON-LD input.
 *
 * @param input the JSON-LD input.
 * @param [options] the options to use:
 *          [namer] a jsonld.UniqueNamer to use.
 */
jsonld.relabelBlankNodes = function(input, options) {
  options = options || {};
  var namer = options.namer || new UniqueNamer('_:b');
  return _labelBlankNodes(namer, input);
};

/**
 * The default document loader for external documents. If the environment
 * is node.js, a callback-continuation-style document loader is used; otherwise,
 * a promises-style document loader is used.
 *
 * @param url the URL to load.
 * @param callback(err, remoteDoc) called once the operation completes,
 *          if using a non-promises API.
 *
 * @return a promise, if using a promises API.
 */
jsonld.documentLoader = function(url, callback) {
  var err = new JsonLdError(
    'Could not retrieve a JSON-LD document from the URL. URL ' +
    'dereferencing not implemented.', 'jsonld.LoadDocumentError',
    {code: 'loading document failed'});
  if(_nodejs) {
    return callback(err, {contextUrl: null, documentUrl: url, document: null});
  }
  return jsonld.promisify(function(callback) {
    callback(err);
  });
};

/**
 * Deprecated default document loader. Use or override jsonld.documentLoader
 * instead.
 */
jsonld.loadDocument = function(url, callback) {
  var promise = jsonld.documentLoader(url, callback);
  if(promise && 'then' in promise) {
    promise.then(callback.bind(null, null), callback);
  }
};

/* Promises API */

/**
 * Creates a new promises API object.
 *
 * @param [options] the options to use:
 *          [api] an object to attach the API to.
 *          [version] 'json-ld-1.0' to output a standard JSON-LD 1.0 promises
 *            API, 'jsonld.js' to output the same with augmented proprietary
 *            methods (default: 'jsonld.js')
 *
 * @return the promises API object.
 */
jsonld.promises = function(options) {
  options = options || {};
  var slice = Array.prototype.slice;
  var promisify = jsonld.promisify;

  // handle 'api' option as version, set defaults
  var api = options.api || {};
  var version = options.version || 'jsonld.js';
  if(typeof options.api === 'string') {
    if(!options.version) {
      version = options.api;
    }
    api = {};
  }

  api.expand = function(input) {
    if(arguments.length < 1) {
      throw new TypeError('Could not expand, too few arguments.');
    }
    return promisify.apply(null, [jsonld.expand].concat(slice.call(arguments)));
  };
  api.compact = function(input, ctx) {
    if(arguments.length < 2) {
      throw new TypeError('Could not compact, too few arguments.');
    }
    var compact = function(input, ctx, options, callback) {
      // ensure only one value is returned in callback
      jsonld.compact(input, ctx, options, function(err, compacted) {
        callback(err, compacted);
      });
    };
    return promisify.apply(null, [compact].concat(slice.call(arguments)));
  };
  api.flatten = function(input) {
    if(arguments.length < 1) {
      throw new TypeError('Could not flatten, too few arguments.');
    }
    return promisify.apply(
      null, [jsonld.flatten].concat(slice.call(arguments)));
  };
  api.frame = function(input, frame) {
    if(arguments.length < 2) {
      throw new TypeError('Could not frame, too few arguments.');
    }
    return promisify.apply(null, [jsonld.frame].concat(slice.call(arguments)));
  };
  api.fromRDF = function(dataset) {
    if(arguments.length < 1) {
      throw new TypeError('Could not convert from RDF, too few arguments.');
    }
    return promisify.apply(
      null, [jsonld.fromRDF].concat(slice.call(arguments)));
  };
  api.toRDF = function(input) {
    if(arguments.length < 1) {
      throw new TypeError('Could not convert to RDF, too few arguments.');
    }
    return promisify.apply(null, [jsonld.toRDF].concat(slice.call(arguments)));
  };
  api.normalize = function(input) {
    if(arguments.length < 1) {
      throw new TypeError('Could not normalize, too few arguments.');
    }
    return promisify.apply(
      null, [jsonld.normalize].concat(slice.call(arguments)));
  };

  if(version === 'jsonld.js') {
    api.link = function(input, ctx) {
      if(arguments.length < 2) {
        throw new TypeError('Could not link, too few arguments.');
      }
      return promisify.apply(
        null, [jsonld.link].concat(slice.call(arguments)));
    };
    api.objectify = function(input) {
      return promisify.apply(
        null, [jsonld.objectify].concat(slice.call(arguments)));
    };
    api.createNodeMap = function(input) {
      return promisify.apply(
        null, [jsonld.createNodeMap].concat(slice.call(arguments)));
    };
    api.merge = function(input) {
      return promisify.apply(
        null, [jsonld.merge].concat(slice.call(arguments)));
    };
  }

  try {
    jsonld.Promise = global.Promise || _dereq_('es6-promise').Promise;
  } catch(e) {
    var f = function() {
      throw new Error('Unable to find a Promise implementation.');
    };
    for(var method in api) {
      api[method] = f;
    }
  }

  return api;
};

/**
 * Converts a node.js async op into a promise w/boxed resolved value(s).
 *
 * @param op the operation to convert.
 *
 * @return the promise.
 */
jsonld.promisify = function(op) {
  if(!jsonld.Promise) {
    try {
      jsonld.Promise = global.Promise || _dereq_('es6-promise').Promise;
    } catch(e) {
      throw new Error('Unable to find a Promise implementation.');
    }
  }
  var args = Array.prototype.slice.call(arguments, 1);
  return new jsonld.Promise(function(resolve, reject) {
    op.apply(null, args.concat(function(err, value) {
      if(!err) {
        resolve(value);
      } else {
        reject(err);
      }
    }));
  });
};

// extend jsonld.promises w/jsonld.js methods
jsonld.promises({api: jsonld.promises});

/* WebIDL API */

function JsonLdProcessor() {}
JsonLdProcessor.prototype = jsonld.promises({version: 'json-ld-1.0'});
JsonLdProcessor.prototype.toString = function() {
  if(this instanceof JsonLdProcessor) {
    return '[object JsonLdProcessor]';
  }
  return '[object JsonLdProcessorPrototype]';
};
jsonld.JsonLdProcessor = JsonLdProcessor;

// IE8 has Object.defineProperty but it only
// works on DOM nodes -- so feature detection
// requires try/catch :-(
var canDefineProperty = !!Object.defineProperty;
if(canDefineProperty) {
  try {
    Object.defineProperty({}, 'x', {});
  } catch(e) {
    canDefineProperty = false;
  }
}

if(canDefineProperty) {
  Object.defineProperty(JsonLdProcessor, 'prototype', {
    writable: false,
    enumerable: false
  });
  Object.defineProperty(JsonLdProcessor.prototype, 'constructor', {
    writable: true,
    enumerable: false,
    configurable: true,
    value: JsonLdProcessor
  });
}

// setup browser global JsonLdProcessor
if(_browser && typeof global.JsonLdProcessor === 'undefined') {
  if(canDefineProperty) {
    Object.defineProperty(global, 'JsonLdProcessor', {
      writable: true,
      enumerable: false,
      configurable: true,
      value: JsonLdProcessor
    });
  } else {
    global.JsonLdProcessor = JsonLdProcessor;
  }
}

/* Utility API */

// define setImmediate and nextTick
//// nextTick implementation with browser-compatible fallback ////
// from https://github.com/caolan/async/blob/master/lib/async.js

// capture the global reference to guard against fakeTimer mocks
var _setImmediate = typeof setImmediate === 'function' && setImmediate;

var _delay = _setImmediate ? function(fn) {
  // not a direct alias (for IE10 compatibility)
  _setImmediate(fn);
} : function(fn) {
  setTimeout(fn, 0);
};

if(typeof process === 'object' && typeof process.nextTick === 'function') {
  jsonld.nextTick = process.nextTick;
} else {
  jsonld.nextTick = _delay;
}
jsonld.setImmediate = _setImmediate ? _delay : jsonld.nextTick;

/**
 * Parses a link header. The results will be key'd by the value of "rel".
 *
 * Link: <http://json-ld.org/contexts/person.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
 *
 * Parses as: {
 *   'http://www.w3.org/ns/json-ld#context': {
 *     target: http://json-ld.org/contexts/person.jsonld,
 *     type: 'application/ld+json'
 *   }
 * }
 *
 * If there is more than one "rel" with the same IRI, then entries in the
 * resulting map for that "rel" will be arrays.
 *
 * @param header the link header to parse.
 */
jsonld.parseLinkHeader = function(header) {
  var rval = {};
  // split on unbracketed/unquoted commas
  var entries = header.match(/(?:<[^>]*?>|"[^"]*?"|[^,])+/g);
  var rLinkHeader = /\s*<([^>]*?)>\s*(?:;\s*(.*))?/;
  for(var i = 0; i < entries.length; ++i) {
    var match = entries[i].match(rLinkHeader);
    if(!match) {
      continue;
    }
    var result = {target: match[1]};
    var params = match[2];
    var rParams = /(.*?)=(?:(?:"([^"]*?)")|([^"]*?))\s*(?:(?:;\s*)|$)/g;
    while(match = rParams.exec(params)) {
      result[match[1]] = (match[2] === undefined) ? match[3] : match[2];
    }
    var rel = result['rel'] || '';
    if(_isArray(rval[rel])) {
      rval[rel].push(result);
    } else if(rel in rval) {
      rval[rel] = [rval[rel], result];
    } else {
      rval[rel] = result;
    }
  }
  return rval;
};

/**
 * Creates a simple document cache that retains documents for a short
 * period of time.
 *
 * FIXME: Implement simple HTTP caching instead.
 *
 * @param size the maximum size of the cache.
 */
jsonld.DocumentCache = function(size) {
  this.order = [];
  this.cache = {};
  this.size = size || 50;
  this.expires = 30 * 1000;
};
jsonld.DocumentCache.prototype.get = function(url) {
  if(url in this.cache) {
    var entry = this.cache[url];
    if(entry.expires >= +new Date()) {
      return entry.ctx;
    }
    delete this.cache[url];
    this.order.splice(this.order.indexOf(url), 1);
  }
  return null;
};
jsonld.DocumentCache.prototype.set = function(url, ctx) {
  if(this.order.length === this.size) {
    delete this.cache[this.order.shift()];
  }
  this.order.push(url);
  this.cache[url] = {ctx: ctx, expires: (+new Date() + this.expires)};
};

/**
 * Creates an active context cache.
 *
 * @param size the maximum size of the cache.
 */
jsonld.ActiveContextCache = function(size) {
  this.order = [];
  this.cache = {};
  this.size = size || 100;
};
jsonld.ActiveContextCache.prototype.get = function(activeCtx, localCtx) {
  var key1 = JSON.stringify(activeCtx);
  var key2 = JSON.stringify(localCtx);
  var level1 = this.cache[key1];
  if(level1 && key2 in level1) {
    return level1[key2];
  }
  return null;
};
jsonld.ActiveContextCache.prototype.set = function(
  activeCtx, localCtx, result) {
  if(this.order.length === this.size) {
    var entry = this.order.shift();
    delete this.cache[entry.activeCtx][entry.localCtx];
  }
  var key1 = JSON.stringify(activeCtx);
  var key2 = JSON.stringify(localCtx);
  this.order.push({activeCtx: key1, localCtx: key2});
  if(!(key1 in this.cache)) {
    this.cache[key1] = {};
  }
  this.cache[key1][key2] = _clone(result);
};

/**
 * Default JSON-LD cache.
 */
jsonld.cache = {
  activeCtx: new jsonld.ActiveContextCache()
};

/**
 * Document loaders.
 */
jsonld.documentLoaders = {};

/**
 * Creates a built-in jquery document loader.
 *
 * @param $ the jquery instance to use.
 * @param options the options to use:
 *          secure: require all URLs to use HTTPS.
 *          usePromise: true to use a promises API, false for a
 *            callback-continuation-style API; defaults to true if Promise
 *            is globally defined, false if not.
 *
 * @return the jquery document loader.
 */
jsonld.documentLoaders.jquery = function($, options) {
  options = options || {};
  var loader = function(url, callback) {
    if(url.indexOf('http:') !== 0 && url.indexOf('https:') !== 0) {
      return callback(new JsonLdError(
        'URL could not be dereferenced; only "http" and "https" URLs are ' +
        'supported.',
        'jsonld.InvalidUrl', {code: 'loading document failed', url: url}),
        {contextUrl: null, documentUrl: url, document: null});
    }
    if(options.secure && url.indexOf('https') !== 0) {
      return callback(new JsonLdError(
        'URL could not be dereferenced; secure mode is enabled and ' +
        'the URL\'s scheme is not "https".',
        'jsonld.InvalidUrl', {code: 'loading document failed', url: url}),
        {contextUrl: null, documentUrl: url, document: null});
    }
    $.ajax({
      url: url,
      accepts: {
        json: 'application/ld+json, application/json'
      },
      // ensure Accept header is very specific for JSON-LD/JSON
      headers: {
        'Accept': 'application/ld+json, application/json'
      },
      dataType: 'json',
      crossDomain: true,
      success: function(data, textStatus, jqXHR) {
        var doc = {contextUrl: null, documentUrl: url, document: data};

        // handle Link Header
        var contentType = jqXHR.getResponseHeader('Content-Type');
        var linkHeader = jqXHR.getResponseHeader('Link');
        if(linkHeader && contentType !== 'application/ld+json') {
          // only 1 related link header permitted
          linkHeader = jsonld.parseLinkHeader(linkHeader)[LINK_HEADER_REL];
          if(_isArray(linkHeader)) {
            return callback(new JsonLdError(
              'URL could not be dereferenced, it has more than one ' +
              'associated HTTP Link Header.',
              'jsonld.InvalidUrl',
              {code: 'multiple context link headers', url: url}), doc);
          }
          if(linkHeader) {
            doc.contextUrl = linkHeader.target;
          }
        }

        callback(null, doc);
      },
      error: function(jqXHR, textStatus, err) {
        callback(new JsonLdError(
          'URL could not be dereferenced, an error occurred.',
          'jsonld.LoadDocumentError',
          {code: 'loading document failed', url: url, cause: err}),
          {contextUrl: null, documentUrl: url, document: null});
      }
    });
  };

  var usePromise = (typeof Promise !== 'undefined');
  if('usePromise' in options) {
    usePromise = options.usePromise;
  }
  if(usePromise) {
    return function(url) {
      return jsonld.promisify(loader, url);
    };
  }
  return loader;
};

/**
 * Creates a built-in node document loader.
 *
 * @param options the options to use:
 *          secure: require all URLs to use HTTPS.
 *          strictSSL: true to require SSL certificates to be valid,
 *            false not to (default: true).
 *          maxRedirects: the maximum number of redirects to permit, none by
 *            default.
 *          usePromise: true to use a promises API, false for a
 *            callback-continuation-style API; false by default.
 *
 * @return the node document loader.
 */
jsonld.documentLoaders.node = function(options) {
  options = options || {};
  var strictSSL = ('strictSSL' in options) ? options.strictSSL : true;
  var maxRedirects = ('maxRedirects' in options) ? options.maxRedirects : -1;
  var request = _dereq_('request');
  var http = _dereq_('http');
  var cache = new jsonld.DocumentCache();
  function loadDocument(url, redirects, callback) {
    if(url.indexOf('http:') !== 0 && url.indexOf('https:') !== 0) {
      return callback(new JsonLdError(
        'URL could not be dereferenced; only "http" and "https" URLs are ' +
        'supported.',
        'jsonld.InvalidUrl', {code: 'loading document failed', url: url}),
        {contextUrl: null, documentUrl: url, document: null});
    }
    if(options.secure && url.indexOf('https') !== 0) {
      return callback(new JsonLdError(
        'URL could not be dereferenced; secure mode is enabled and ' +
        'the URL\'s scheme is not "https".',
        'jsonld.InvalidUrl', {code: 'loading document failed', url: url}),
        {contextUrl: null, documentUrl: url, document: null});
    }
    var doc = cache.get(url);
    if(doc !== null) {
      return callback(null, doc);
    }
    request({
      url: url,
      headers: {
        'Accept': 'application/ld+json, application/json'
      },
      strictSSL: strictSSL,
      followRedirect: false
    }, handleResponse);

    function handleResponse(err, res, body) {
      doc = {contextUrl: null, documentUrl: url, document: body || null};

      // handle error
      if(err) {
        return callback(new JsonLdError(
          'URL could not be dereferenced, an error occurred.',
          'jsonld.LoadDocumentError',
          {code: 'loading document failed', url: url, cause: err}), doc);
      }
      var statusText = http.STATUS_CODES[res.statusCode];
      if(res.statusCode >= 400) {
        return callback(new JsonLdError(
          'URL could not be dereferenced: ' + statusText,
          'jsonld.InvalidUrl', {
            code: 'loading document failed',
            url: url,
            httpStatusCode: res.statusCode
          }), doc);
      }

      // handle Link Header
      if(res.headers.link &&
        res.headers['content-type'] !== 'application/ld+json') {
        // only 1 related link header permitted
        var linkHeader = jsonld.parseLinkHeader(
          res.headers.link)[LINK_HEADER_REL];
        if(_isArray(linkHeader)) {
          return callback(new JsonLdError(
            'URL could not be dereferenced, it has more than one associated ' +
            'HTTP Link Header.',
            'jsonld.InvalidUrl',
            {code: 'multiple context link headers', url: url}), doc);
        }
        if(linkHeader) {
          doc.contextUrl = linkHeader.target;
        }
      }

      // handle redirect
      if(res.statusCode >= 300 && res.statusCode < 400 &&
        res.headers.location) {
        if(redirects.length === maxRedirects) {
          return callback(new JsonLdError(
            'URL could not be dereferenced; there were too many redirects.',
            'jsonld.TooManyRedirects', {
              code: 'loading document failed',
              url: url,
              httpStatusCode: res.statusCode,
              redirects: redirects
            }), doc);
        }
        if(redirects.indexOf(url) !== -1) {
          return callback(new JsonLdError(
            'URL could not be dereferenced; infinite redirection was detected.',
            'jsonld.InfiniteRedirectDetected', {
              code: 'recursive context inclusion',
              url: url,
              httpStatusCode: res.statusCode,
              redirects: redirects
            }), doc);
        }
        redirects.push(url);
        return loadDocument(res.headers.location, redirects, callback);
      }
      // cache for each redirected URL
      redirects.push(url);
      for(var i = 0; i < redirects.length; ++i) {
        cache.set(
          redirects[i],
          {contextUrl: null, documentUrl: redirects[i], document: body});
      }
      callback(err, doc);
    }
  }

  var loader = function(url, callback) {
    loadDocument(url, [], callback);
  };
  if(options.usePromise) {
    return function(url) {
      return jsonld.promisify(loader, url);
    };
  }
  return loader;
};

/**
 * Creates a built-in XMLHttpRequest document loader.
 *
 * @param options the options to use:
 *          secure: require all URLs to use HTTPS.
 *          usePromise: true to use a promises API, false for a
 *            callback-continuation-style API; defaults to true if Promise
 *            is globally defined, false if not.
 *          [xhr]: the XMLHttpRequest API to use.
 *
 * @return the XMLHttpRequest document loader.
 */
jsonld.documentLoaders.xhr = function(options) {
  var rlink = /(^|(\r\n))link:/i;
  options = options || {};
  var loader = function(url, callback) {
    if(url.indexOf('http:') !== 0 && url.indexOf('https:') !== 0) {
      return callback(new JsonLdError(
        'URL could not be dereferenced; only "http" and "https" URLs are ' +
        'supported.',
        'jsonld.InvalidUrl', {code: 'loading document failed', url: url}),
        {contextUrl: null, documentUrl: url, document: null});
    }
    if(options.secure && url.indexOf('https') !== 0) {
      return callback(new JsonLdError(
        'URL could not be dereferenced; secure mode is enabled and ' +
        'the URL\'s scheme is not "https".',
        'jsonld.InvalidUrl', {code: 'loading document failed', url: url}),
        {contextUrl: null, documentUrl: url, document: null});
    }
    var xhr = options.xhr || XMLHttpRequest;
    var req = new xhr();
    req.onload = function(e) {
      if(req.status >= 400) {
        return callback(new JsonLdError(
          'URL could not be dereferenced: ' + req.statusText,
          'jsonld.LoadDocumentError', {
            code: 'loading document failed',
            url: url,
            httpStatusCode: req.status
          }), {contextUrl: null, documentUrl: url, document: null});
      }

      var doc = {contextUrl: null, documentUrl: url, document: req.response};

      // handle Link Header (avoid unsafe header warning by existence testing)
      var contentType = req.getResponseHeader('Content-Type');
      var linkHeader;
      if(rlink.test(req.getAllResponseHeaders())) {
        linkHeader = req.getResponseHeader('Link');
      }
      if(linkHeader && contentType !== 'application/ld+json') {
        // only 1 related link header permitted
        linkHeader = jsonld.parseLinkHeader(linkHeader)[LINK_HEADER_REL];
        if(_isArray(linkHeader)) {
          return callback(new JsonLdError(
            'URL could not be dereferenced, it has more than one ' +
            'associated HTTP Link Header.',
            'jsonld.InvalidUrl',
            {code: 'multiple context link headers', url: url}), doc);
        }
        if(linkHeader) {
          doc.contextUrl = linkHeader.target;
        }
      }

      callback(null, doc);
    };
    req.onerror = function() {
      callback(new JsonLdError(
        'URL could not be dereferenced, an error occurred.',
        'jsonld.LoadDocumentError',
        {code: 'loading document failed', url: url}),
        {contextUrl: null, documentUrl: url, document: null});
    };
    req.open('GET', url, true);
    req.setRequestHeader('Accept', 'application/ld+json, application/json');
    req.send();
  };

  var usePromise = (typeof Promise !== 'undefined');
  if('usePromise' in options) {
    usePromise = options.usePromise;
  }
  if(usePromise) {
    return function(url) {
      return jsonld.promisify(loader, url);
    };
  }
  return loader;
};

/**
 * Assigns the default document loader for external document URLs to a built-in
 * default. Supported types currently include: 'jquery' and 'node'.
 *
 * To use the jquery document loader, the first parameter must be a reference
 * to the main jquery object.
 *
 * @param type the type to set.
 * @param [params] the parameters required to use the document loader.
 */
jsonld.useDocumentLoader = function(type) {
  if(!(type in jsonld.documentLoaders)) {
    throw new JsonLdError(
      'Unknown document loader type: "' + type + '"',
      'jsonld.UnknownDocumentLoader',
      {type: type});
  }

  // set document loader
  jsonld.documentLoader = jsonld.documentLoaders[type].apply(
    jsonld, Array.prototype.slice.call(arguments, 1));
};

/**
 * Processes a local context, resolving any URLs as necessary, and returns a
 * new active context in its callback.
 *
 * @param activeCtx the current active context.
 * @param localCtx the local context to process.
 * @param [options] the options to use:
 *          [documentLoader(url, callback(err, remoteDoc))] the document loader.
 * @param callback(err, ctx) called once the operation completes.
 */
jsonld.processContext = function(activeCtx, localCtx) {
  // get arguments
  var options = {};
  var callbackArg = 2;
  if(arguments.length > 3) {
    options = arguments[2] || {};
    callbackArg += 1;
  }
  var callback = arguments[callbackArg];

  // set default options
  if(!('base' in options)) {
    options.base = '';
  }
  if(!('documentLoader' in options)) {
    options.documentLoader = jsonld.loadDocument;
  }

  // return initial context early for null context
  if(localCtx === null) {
    return callback(null, _getInitialContext(options));
  }

  // retrieve URLs in localCtx
  localCtx = _clone(localCtx);
  if(!(_isObject(localCtx) && '@context' in localCtx)) {
    localCtx = {'@context': localCtx};
  }
  _retrieveContextUrls(localCtx, options, function(err, ctx) {
    if(err) {
      return callback(err);
    }
    try {
      // process context
      ctx = new Processor().processContext(activeCtx, ctx, options);
    } catch(ex) {
      return callback(ex);
    }
    callback(null, ctx);
  });
};

/**
 * Returns true if the given subject has the given property.
 *
 * @param subject the subject to check.
 * @param property the property to look for.
 *
 * @return true if the subject has the given property, false if not.
 */
jsonld.hasProperty = function(subject, property) {
  var rval = false;
  if(property in subject) {
    var value = subject[property];
    rval = (!_isArray(value) || value.length > 0);
  }
  return rval;
};

/**
 * Determines if the given value is a property of the given subject.
 *
 * @param subject the subject to check.
 * @param property the property to check.
 * @param value the value to check.
 *
 * @return true if the value exists, false if not.
 */
jsonld.hasValue = function(subject, property, value) {
  var rval = false;
  if(jsonld.hasProperty(subject, property)) {
    var val = subject[property];
    var isList = _isList(val);
    if(_isArray(val) || isList) {
      if(isList) {
        val = val['@list'];
      }
      for(var i = 0; i < val.length; ++i) {
        if(jsonld.compareValues(value, val[i])) {
          rval = true;
          break;
        }
      }
    } else if(!_isArray(value)) {
      // avoid matching the set of values with an array value parameter
      rval = jsonld.compareValues(value, val);
    }
  }
  return rval;
};

/**
 * Adds a value to a subject. If the value is an array, all values in the
 * array will be added.
 *
 * @param subject the subject to add the value to.
 * @param property the property that relates the value to the subject.
 * @param value the value to add.
 * @param [options] the options to use:
 *        [propertyIsArray] true if the property is always an array, false
 *          if not (default: false).
 *        [allowDuplicate] true to allow duplicates, false not to (uses a
 *          simple shallow comparison of subject ID or value) (default: true).
 */
jsonld.addValue = function(subject, property, value, options) {
  options = options || {};
  if(!('propertyIsArray' in options)) {
    options.propertyIsArray = false;
  }
  if(!('allowDuplicate' in options)) {
    options.allowDuplicate = true;
  }

  if(_isArray(value)) {
    if(value.length === 0 && options.propertyIsArray &&
      !(property in subject)) {
      subject[property] = [];
    }
    for(var i = 0; i < value.length; ++i) {
      jsonld.addValue(subject, property, value[i], options);
    }
  } else if(property in subject) {
    // check if subject already has value if duplicates not allowed
    var hasValue = (!options.allowDuplicate &&
      jsonld.hasValue(subject, property, value));

    // make property an array if value not present or always an array
    if(!_isArray(subject[property]) &&
      (!hasValue || options.propertyIsArray)) {
      subject[property] = [subject[property]];
    }

    // add new value
    if(!hasValue) {
      subject[property].push(value);
    }
  } else {
    // add new value as set or single value
    subject[property] = options.propertyIsArray ? [value] : value;
  }
};

/**
 * Gets all of the values for a subject's property as an array.
 *
 * @param subject the subject.
 * @param property the property.
 *
 * @return all of the values for a subject's property as an array.
 */
jsonld.getValues = function(subject, property) {
  var rval = subject[property] || [];
  if(!_isArray(rval)) {
    rval = [rval];
  }
  return rval;
};

/**
 * Removes a property from a subject.
 *
 * @param subject the subject.
 * @param property the property.
 */
jsonld.removeProperty = function(subject, property) {
  delete subject[property];
};

/**
 * Removes a value from a subject.
 *
 * @param subject the subject.
 * @param property the property that relates the value to the subject.
 * @param value the value to remove.
 * @param [options] the options to use:
 *          [propertyIsArray] true if the property is always an array, false
 *            if not (default: false).
 */
jsonld.removeValue = function(subject, property, value, options) {
  options = options || {};
  if(!('propertyIsArray' in options)) {
    options.propertyIsArray = false;
  }

  // filter out value
  var values = jsonld.getValues(subject, property).filter(function(e) {
    return !jsonld.compareValues(e, value);
  });

  if(values.length === 0) {
    jsonld.removeProperty(subject, property);
  } else if(values.length === 1 && !options.propertyIsArray) {
    subject[property] = values[0];
  } else {
    subject[property] = values;
  }
};

/**
 * Compares two JSON-LD values for equality. Two JSON-LD values will be
 * considered equal if:
 *
 * 1. They are both primitives of the same type and value.
 * 2. They are both @values with the same @value, @type, @language,
 *   and @index, OR
 * 3. They both have @ids they are the same.
 *
 * @param v1 the first value.
 * @param v2 the second value.
 *
 * @return true if v1 and v2 are considered equal, false if not.
 */
jsonld.compareValues = function(v1, v2) {
  // 1. equal primitives
  if(v1 === v2) {
    return true;
  }

  // 2. equal @values
  if(_isValue(v1) && _isValue(v2) &&
    v1['@value'] === v2['@value'] &&
    v1['@type'] === v2['@type'] &&
    v1['@language'] === v2['@language'] &&
    v1['@index'] === v2['@index']) {
    return true;
  }

  // 3. equal @ids
  if(_isObject(v1) && ('@id' in v1) && _isObject(v2) && ('@id' in v2)) {
    return v1['@id'] === v2['@id'];
  }

  return false;
};

/**
 * Gets the value for the given active context key and type, null if none is
 * set.
 *
 * @param ctx the active context.
 * @param key the context key.
 * @param [type] the type of value to get (eg: '@id', '@type'), if not
 *          specified gets the entire entry for a key, null if not found.
 *
 * @return the value.
 */
jsonld.getContextValue = function(ctx, key, type) {
  var rval = null;

  // return null for invalid key
  if(key === null) {
    return rval;
  }

  // get default language
  if(type === '@language' && (type in ctx)) {
    rval = ctx[type];
  }

  // get specific entry information
  if(ctx.mappings[key]) {
    var entry = ctx.mappings[key];

    if(_isUndefined(type)) {
      // return whole entry
      rval = entry;
    } else if(type in entry) {
      // return entry value for type
      rval = entry[type];
    }
  }

  return rval;
};

/** Registered RDF dataset parsers hashed by content-type. */
var _rdfParsers = {};

/**
 * Registers an RDF dataset parser by content-type, for use with
 * jsonld.fromRDF. An RDF dataset parser will always be given two parameters,
 * a string of input and a callback. An RDF dataset parser can be synchronous
 * or asynchronous.
 *
 * If the parser function returns undefined or null then it will be assumed to
 * be asynchronous w/a continuation-passing style and the callback parameter
 * given to the parser MUST be invoked.
 *
 * If it returns a Promise, then it will be assumed to be asynchronous, but the
 * callback parameter MUST NOT be invoked. It should instead be ignored.
 *
 * If it returns an RDF dataset, it will be assumed to be synchronous and the
 * callback parameter MUST NOT be invoked. It should instead be ignored.
 *
 * @param contentType the content-type for the parser.
 * @param parser(input, callback(err, dataset)) the parser function (takes a
 *          string as a parameter and either returns null/undefined and uses
 *          the given callback, returns a Promise, or returns an RDF dataset).
 */
jsonld.registerRDFParser = function(contentType, parser) {
  _rdfParsers[contentType] = parser;
};

/**
 * Unregisters an RDF dataset parser by content-type.
 *
 * @param contentType the content-type for the parser.
 */
jsonld.unregisterRDFParser = function(contentType) {
  delete _rdfParsers[contentType];
};

if(_nodejs) {
  // needed for serialization of XML literals
  if(typeof XMLSerializer === 'undefined') {
    var XMLSerializer = null;
  }
  if(typeof Node === 'undefined') {
    var Node = {
      ELEMENT_NODE: 1,
      ATTRIBUTE_NODE: 2,
      TEXT_NODE: 3,
      CDATA_SECTION_NODE: 4,
      ENTITY_REFERENCE_NODE: 5,
      ENTITY_NODE: 6,
      PROCESSING_INSTRUCTION_NODE: 7,
      COMMENT_NODE: 8,
      DOCUMENT_NODE: 9,
      DOCUMENT_TYPE_NODE: 10,
      DOCUMENT_FRAGMENT_NODE: 11,
      NOTATION_NODE:12
    };
  }
}

// constants
var XSD_BOOLEAN = 'http://www.w3.org/2001/XMLSchema#boolean';
var XSD_DOUBLE = 'http://www.w3.org/2001/XMLSchema#double';
var XSD_INTEGER = 'http://www.w3.org/2001/XMLSchema#integer';
var XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';

var RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
var RDF_LIST = RDF + 'List';
var RDF_FIRST = RDF + 'first';
var RDF_REST = RDF + 'rest';
var RDF_NIL = RDF + 'nil';
var RDF_TYPE = RDF + 'type';
var RDF_PLAIN_LITERAL = RDF + 'PlainLiteral';
var RDF_XML_LITERAL = RDF + 'XMLLiteral';
var RDF_OBJECT = RDF + 'object';
var RDF_LANGSTRING = RDF + 'langString';

var LINK_HEADER_REL = 'http://www.w3.org/ns/json-ld#context';
var MAX_CONTEXT_URLS = 10;

/**
 * A JSON-LD Error.
 *
 * @param msg the error message.
 * @param type the error type.
 * @param details the error details.
 */
var JsonLdError = function(msg, type, details) {
  if(_nodejs) {
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);
  } else if(typeof Error !== 'undefined') {
    this.stack = (new Error()).stack;
  }
  this.name = type || 'jsonld.Error';
  this.message = msg || 'An unspecified JSON-LD error occurred.';
  this.details = details || {};
};
if(_nodejs) {
  _dereq_('util').inherits(JsonLdError, Error);
} else if(typeof Error !== 'undefined') {
  JsonLdError.prototype = new Error();
}

/**
 * Constructs a new JSON-LD Processor.
 */
var Processor = function() {};

/**
 * Recursively compacts an element using the given active context. All values
 * must be in expanded form before this method is called.
 *
 * @param activeCtx the active context to use.
 * @param activeProperty the compacted property associated with the element
 *          to compact, null for none.
 * @param element the element to compact.
 * @param options the compaction options.
 *
 * @return the compacted value.
 */
Processor.prototype.compact = function(
  activeCtx, activeProperty, element, options) {
  // recursively compact array
  if(_isArray(element)) {
    var rval = [];
    for(var i = 0; i < element.length; ++i) {
      // compact, dropping any null values
      var compacted = this.compact(
        activeCtx, activeProperty, element[i], options);
      if(compacted !== null) {
        rval.push(compacted);
      }
    }
    if(options.compactArrays && rval.length === 1) {
      // use single element if no container is specified
      var container = jsonld.getContextValue(
        activeCtx, activeProperty, '@container');
      if(container === null) {
        rval = rval[0];
      }
    }
    return rval;
  }

  // recursively compact object
  if(_isObject(element)) {
    if(options.link && '@id' in element && element['@id'] in options.link) {
      // check for a linked element to reuse
      var linked = options.link[element['@id']];
      for(var i = 0; i < linked.length; ++i) {
        if(linked[i].expanded === element) {
          return linked[i].compacted;
        }
      }
    }

    // do value compaction on @values and subject references
    if(_isValue(element) || _isSubjectReference(element)) {
      var rval = _compactValue(activeCtx, activeProperty, element);
      if(options.link && _isSubjectReference(element)) {
        // store linked element
        if(!(element['@id'] in options.link)) {
          options.link[element['@id']] = [];
        }
        options.link[element['@id']].push({expanded: element, compacted: rval});
      }
      return rval;
    }

    // FIXME: avoid misuse of active property as an expanded property?
    var insideReverse = (activeProperty === '@reverse');

    var rval = {};

    if(options.link && '@id' in element) {
      // store linked element
      if(!(element['@id'] in options.link)) {
        options.link[element['@id']] = [];
      }
      options.link[element['@id']].push({expanded: element, compacted: rval});
    }

    // process element keys in order
    var keys = Object.keys(element).sort();
    for(var ki = 0; ki < keys.length; ++ki) {
      var expandedProperty = keys[ki];
      var expandedValue = element[expandedProperty];

      // compact @id and @type(s)
      if(expandedProperty === '@id' || expandedProperty === '@type') {
        var compactedValue;

        // compact single @id
        if(_isString(expandedValue)) {
          compactedValue = _compactIri(
            activeCtx, expandedValue, null,
            {vocab: (expandedProperty === '@type')});
        } else {
          // expanded value must be a @type array
          compactedValue = [];
          for(var vi = 0; vi < expandedValue.length; ++vi) {
            compactedValue.push(_compactIri(
              activeCtx, expandedValue[vi], null, {vocab: true}));
          }
        }

        // use keyword alias and add value
        var alias = _compactIri(activeCtx, expandedProperty);
        var isArray = (_isArray(compactedValue) && expandedValue.length === 0);
        jsonld.addValue(
          rval, alias, compactedValue, {propertyIsArray: isArray});
        continue;
      }

      // handle @reverse
      if(expandedProperty === '@reverse') {
        // recursively compact expanded value
        var compactedValue = this.compact(
          activeCtx, '@reverse', expandedValue, options);

        // handle double-reversed properties
        for(var compactedProperty in compactedValue) {
          if(activeCtx.mappings[compactedProperty] &&
            activeCtx.mappings[compactedProperty].reverse) {
            var value = compactedValue[compactedProperty];
            var container = jsonld.getContextValue(
              activeCtx, compactedProperty, '@container');
            var useArray = (container === '@set' || !options.compactArrays);
            jsonld.addValue(
              rval, compactedProperty, value, {propertyIsArray: useArray});
            delete compactedValue[compactedProperty];
          }
        }

        if(Object.keys(compactedValue).length > 0) {
          // use keyword alias and add value
          var alias = _compactIri(activeCtx, expandedProperty);
          jsonld.addValue(rval, alias, compactedValue);
        }

        continue;
      }

      // handle @index property
      if(expandedProperty === '@index') {
        // drop @index if inside an @index container
        var container = jsonld.getContextValue(
          activeCtx, activeProperty, '@container');
        if(container === '@index') {
          continue;
        }

        // use keyword alias and add value
        var alias = _compactIri(activeCtx, expandedProperty);
        jsonld.addValue(rval, alias, expandedValue);
        continue;
      }

      // skip array processing for keywords that aren't @graph or @list
      if(expandedProperty !== '@graph' && expandedProperty !== '@list' &&
        _isKeyword(expandedProperty)) {
        // use keyword alias and add value as is
        var alias = _compactIri(activeCtx, expandedProperty);
        jsonld.addValue(rval, alias, expandedValue);
        continue;
      }

      // Note: expanded value must be an array due to expansion algorithm.

      // preserve empty arrays
      if(expandedValue.length === 0) {
        var itemActiveProperty = _compactIri(
          activeCtx, expandedProperty, expandedValue, {vocab: true},
          insideReverse);
        jsonld.addValue(
          rval, itemActiveProperty, expandedValue, {propertyIsArray: true});
      }

      // recusively process array values
      for(var vi = 0; vi < expandedValue.length; ++vi) {
        var expandedItem = expandedValue[vi];

        // compact property and get container type
        var itemActiveProperty = _compactIri(
          activeCtx, expandedProperty, expandedItem, {vocab: true},
          insideReverse);
        var container = jsonld.getContextValue(
          activeCtx, itemActiveProperty, '@container');

        // get @list value if appropriate
        var isList = _isList(expandedItem);
        var list = null;
        if(isList) {
          list = expandedItem['@list'];
        }

        // recursively compact expanded item
        var compactedItem = this.compact(
          activeCtx, itemActiveProperty, isList ? list : expandedItem, options);

        // handle @list
        if(isList) {
          // ensure @list value is an array
          if(!_isArray(compactedItem)) {
            compactedItem = [compactedItem];
          }

          if(container !== '@list') {
            // wrap using @list alias
            var wrapper = {};
            wrapper[_compactIri(activeCtx, '@list')] = compactedItem;
            compactedItem = wrapper;

            // include @index from expanded @list, if any
            if('@index' in expandedItem) {
              compactedItem[_compactIri(activeCtx, '@index')] =
                expandedItem['@index'];
            }
          } else if(itemActiveProperty in rval) {
            // can't use @list container for more than 1 list
            throw new JsonLdError(
              'JSON-LD compact error; property has a "@list" @container ' +
              'rule but there is more than a single @list that matches ' +
              'the compacted term in the document. Compaction might mix ' +
              'unwanted items into the list.',
              'jsonld.SyntaxError', {code: 'compaction to list of lists'});
          }
        }

        // handle language and index maps
        if(container === '@language' || container === '@index') {
          // get or create the map object
          var mapObject;
          if(itemActiveProperty in rval) {
            mapObject = rval[itemActiveProperty];
          } else {
            rval[itemActiveProperty] = mapObject = {};
          }

          // if container is a language map, simplify compacted value to
          // a simple string
          if(container === '@language' && _isValue(compactedItem)) {
            compactedItem = compactedItem['@value'];
          }

          // add compact value to map object using key from expanded value
          // based on the container type
          jsonld.addValue(mapObject, expandedItem[container], compactedItem);
        } else {
          // use an array if: compactArrays flag is false,
          // @container is @set or @list , value is an empty
          // array, or key is @graph
          var isArray = (!options.compactArrays || container === '@set' ||
            container === '@list' ||
            (_isArray(compactedItem) && compactedItem.length === 0) ||
            expandedProperty === '@list' || expandedProperty === '@graph');

          // add compact value
          jsonld.addValue(
            rval, itemActiveProperty, compactedItem,
            {propertyIsArray: isArray});
        }
      }
    }

    return rval;
  }

  // only primitives remain which are already compact
  return element;
};

/**
 * Recursively expands an element using the given context. Any context in
 * the element will be removed. All context URLs must have been retrieved
 * before calling this method.
 *
 * @param activeCtx the context to use.
 * @param activeProperty the property for the element, null for none.
 * @param element the element to expand.
 * @param options the expansion options.
 * @param insideList true if the element is a list, false if not.
 *
 * @return the expanded value.
 */
Processor.prototype.expand = function(
  activeCtx, activeProperty, element, options, insideList) {
  var self = this;

  // nothing to expand
  if(element === null || element === undefined) {
    return null;
  }

  if(!_isArray(element) && !_isObject(element)) {
    // drop free-floating scalars that are not in lists
    if(!insideList && (activeProperty === null ||
      _expandIri(activeCtx, activeProperty, {vocab: true}) === '@graph')) {
      return null;
    }

    // expand element according to value expansion rules
    return _expandValue(activeCtx, activeProperty, element);
  }

  // recursively expand array
  if(_isArray(element)) {
    var rval = [];
    var container = jsonld.getContextValue(
      activeCtx, activeProperty, '@container');
    insideList = insideList || container === '@list';
    for(var i = 0; i < element.length; ++i) {
      // expand element
      var e = self.expand(activeCtx, activeProperty, element[i], options);
      if(insideList && (_isArray(e) || _isList(e))) {
        // lists of lists are illegal
        throw new JsonLdError(
          'Invalid JSON-LD syntax; lists of lists are not permitted.',
          'jsonld.SyntaxError', {code: 'list of lists'});
      }
      // drop null values
      if(e !== null) {
        if(_isArray(e)) {
          rval = rval.concat(e);
        } else {
          rval.push(e);
        }
      }
    }
    return rval;
  }

  // recursively expand object:

  // if element has a context, process it
  if('@context' in element) {
    activeCtx = self.processContext(activeCtx, element['@context'], options);
  }

  // expand the active property
  var expandedActiveProperty = _expandIri(
    activeCtx, activeProperty, {vocab: true});

  var rval = {};
  var keys = Object.keys(element).sort();
  for(var ki = 0; ki < keys.length; ++ki) {
    var key = keys[ki];
    var value = element[key];
    var expandedValue;

    // skip @context
    if(key === '@context') {
      continue;
    }

    // expand property
    var expandedProperty = _expandIri(activeCtx, key, {vocab: true});

    // drop non-absolute IRI keys that aren't keywords
    if(expandedProperty === null ||
      !(_isAbsoluteIri(expandedProperty) || _isKeyword(expandedProperty))) {
      continue;
    }

    if(_isKeyword(expandedProperty)) {
      if(expandedActiveProperty === '@reverse') {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; a keyword cannot be used as a @reverse ' +
          'property.', 'jsonld.SyntaxError',
          {code: 'invalid reverse property map', value: value});
      }
      if(expandedProperty in rval) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; colliding keywords detected.',
          'jsonld.SyntaxError',
          {code: 'colliding keywords', keyword: expandedProperty});
      }
    }

    // syntax error if @id is not a string
    if(expandedProperty === '@id' && !_isString(value)) {
      if(!options.isFrame) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; "@id" value must a string.',
          'jsonld.SyntaxError', {code: 'invalid @id value', value: value});
      }
      if(!_isObject(value)) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; "@id" value must be a string or an ' +
          'object.', 'jsonld.SyntaxError',
          {code: 'invalid @id value', value: value});
      }
    }

    if(expandedProperty === '@type') {
      _validateTypeValue(value);
    }

    // @graph must be an array or an object
    if(expandedProperty === '@graph' &&
      !(_isObject(value) || _isArray(value))) {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; "@graph" value must not be an ' +
        'object or an array.',
        'jsonld.SyntaxError', {code: 'invalid @graph value', value: value});
    }

    // @value must not be an object or an array
    if(expandedProperty === '@value' &&
      (_isObject(value) || _isArray(value))) {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; "@value" value must not be an ' +
        'object or an array.',
        'jsonld.SyntaxError',
        {code: 'invalid value object value', value: value});
    }

    // @language must be a string
    if(expandedProperty === '@language') {
      if(value === null) {
        // drop null @language values, they expand as if they didn't exist
        continue;
      }
      if(!_isString(value)) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; "@language" value must be a string.',
          'jsonld.SyntaxError',
          {code: 'invalid language-tagged string', value: value});
      }
      // ensure language value is lowercase
      value = value.toLowerCase();
    }

    // @index must be a string
    if(expandedProperty === '@index') {
      if(!_isString(value)) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; "@index" value must be a string.',
          'jsonld.SyntaxError',
          {code: 'invalid @index value', value: value});
      }
    }

    // @reverse must be an object
    if(expandedProperty === '@reverse') {
      if(!_isObject(value)) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; "@reverse" value must be an object.',
          'jsonld.SyntaxError', {code: 'invalid @reverse value', value: value});
      }

      expandedValue = self.expand(activeCtx, '@reverse', value, options);

      // properties double-reversed
      if('@reverse' in expandedValue) {
        for(var property in expandedValue['@reverse']) {
          jsonld.addValue(
            rval, property, expandedValue['@reverse'][property],
            {propertyIsArray: true});
        }
      }

      // FIXME: can this be merged with code below to simplify?
      // merge in all reversed properties
      var reverseMap = rval['@reverse'] || null;
      for(var property in expandedValue) {
        if(property === '@reverse') {
          continue;
        }
        if(reverseMap === null) {
          reverseMap = rval['@reverse'] = {};
        }
        jsonld.addValue(reverseMap, property, [], {propertyIsArray: true});
        var items = expandedValue[property];
        for(var ii = 0; ii < items.length; ++ii) {
          var item = items[ii];
          if(_isValue(item) || _isList(item)) {
            throw new JsonLdError(
              'Invalid JSON-LD syntax; "@reverse" value must not be a ' +
              '@value or an @list.', 'jsonld.SyntaxError',
              {code: 'invalid reverse property value', value: expandedValue});
          }
          jsonld.addValue(
            reverseMap, property, item, {propertyIsArray: true});
        }
      }

      continue;
    }

    var container = jsonld.getContextValue(activeCtx, key, '@container');

    if(container === '@language' && _isObject(value)) {
      // handle language map container (skip if value is not an object)
      expandedValue = _expandLanguageMap(value);
    } else if(container === '@index' && _isObject(value)) {
      // handle index container (skip if value is not an object)
      expandedValue = (function _expandIndexMap(activeProperty) {
        var rval = [];
        var keys = Object.keys(value).sort();
        for(var ki = 0; ki < keys.length; ++ki) {
          var key = keys[ki];
          var val = value[key];
          if(!_isArray(val)) {
            val = [val];
          }
          val = self.expand(activeCtx, activeProperty, val, options, false);
          for(var vi = 0; vi < val.length; ++vi) {
            var item = val[vi];
            if(!('@index' in item)) {
              item['@index'] = key;
            }
            rval.push(item);
          }
        }
        return rval;
      })(key);
    } else {
      // recurse into @list or @set
      var isList = (expandedProperty === '@list');
      if(isList || expandedProperty === '@set') {
        var nextActiveProperty = activeProperty;
        if(isList && expandedActiveProperty === '@graph') {
          nextActiveProperty = null;
        }
        expandedValue = self.expand(
          activeCtx, nextActiveProperty, value, options, isList);
        if(isList && _isList(expandedValue)) {
          throw new JsonLdError(
            'Invalid JSON-LD syntax; lists of lists are not permitted.',
            'jsonld.SyntaxError', {code: 'list of lists'});
        }
      } else {
        // recursively expand value with key as new active property
        expandedValue = self.expand(activeCtx, key, value, options, false);
      }
    }

    // drop null values if property is not @value
    if(expandedValue === null && expandedProperty !== '@value') {
      continue;
    }

    // convert expanded value to @list if container specifies it
    if(expandedProperty !== '@list' && !_isList(expandedValue) &&
      container === '@list') {
      // ensure expanded value is an array
      expandedValue = (_isArray(expandedValue) ?
        expandedValue : [expandedValue]);
      expandedValue = {'@list': expandedValue};
    }

    // FIXME: can this be merged with code above to simplify?
    // merge in reverse properties
    if(activeCtx.mappings[key] && activeCtx.mappings[key].reverse) {
      var reverseMap = rval['@reverse'] = rval['@reverse'] || {};
      if(!_isArray(expandedValue)) {
        expandedValue = [expandedValue];
      }
      for(var ii = 0; ii < expandedValue.length; ++ii) {
        var item = expandedValue[ii];
        if(_isValue(item) || _isList(item)) {
          throw new JsonLdError(
            'Invalid JSON-LD syntax; "@reverse" value must not be a ' +
            '@value or an @list.', 'jsonld.SyntaxError',
            {code: 'invalid reverse property value', value: expandedValue});
        }
        jsonld.addValue(
          reverseMap, expandedProperty, item, {propertyIsArray: true});
      }
      continue;
    }

    // add value for property
    // use an array except for certain keywords
    var useArray =
      ['@index', '@id', '@type', '@value', '@language'].indexOf(
        expandedProperty) === -1;
    jsonld.addValue(
      rval, expandedProperty, expandedValue, {propertyIsArray: useArray});
  }

  // get property count on expanded output
  keys = Object.keys(rval);
  var count = keys.length;

  if('@value' in rval) {
    // @value must only have @language or @type
    if('@type' in rval && '@language' in rval) {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; an element containing "@value" may not ' +
        'contain both "@type" and "@language".',
        'jsonld.SyntaxError', {code: 'invalid value object', element: rval});
    }
    var validCount = count - 1;
    if('@type' in rval) {
      validCount -= 1;
    }
    if('@index' in rval) {
      validCount -= 1;
    }
    if('@language' in rval) {
      validCount -= 1;
    }
    if(validCount !== 0) {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; an element containing "@value" may only ' +
        'have an "@index" property and at most one other property ' +
        'which can be "@type" or "@language".',
        'jsonld.SyntaxError', {code: 'invalid value object', element: rval});
    }
    // drop null @values
    if(rval['@value'] === null) {
      rval = null;
    } else if('@language' in rval && !_isString(rval['@value'])) {
      // if @language is present, @value must be a string
      throw new JsonLdError(
        'Invalid JSON-LD syntax; only strings may be language-tagged.',
        'jsonld.SyntaxError',
        {code: 'invalid language-tagged value', element: rval});
    } else if('@type' in rval && (!_isAbsoluteIri(rval['@type']) ||
      rval['@type'].indexOf('_:') === 0)) {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; an element containing "@value" and "@type" ' +
        'must have an absolute IRI for the value of "@type".',
        'jsonld.SyntaxError', {code: 'invalid typed value', element: rval});
    }
  } else if('@type' in rval && !_isArray(rval['@type'])) {
    // convert @type to an array
    rval['@type'] = [rval['@type']];
  } else if('@set' in rval || '@list' in rval) {
    // handle @set and @list
    if(count > 1 && !(count === 2 && '@index' in rval)) {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; if an element has the property "@set" ' +
        'or "@list", then it can have at most one other property that is ' +
        '"@index".', 'jsonld.SyntaxError',
        {code: 'invalid set or list object', element: rval});
    }
    // optimize away @set
    if('@set' in rval) {
      rval = rval['@set'];
      keys = Object.keys(rval);
      count = keys.length;
    }
  } else if(count === 1 && '@language' in rval) {
    // drop objects with only @language
    rval = null;
  }

  // drop certain top-level objects that do not occur in lists
  if(_isObject(rval) &&
    !options.keepFreeFloatingNodes && !insideList &&
    (activeProperty === null || expandedActiveProperty === '@graph')) {
    // drop empty object, top-level @value/@list, or object with only @id
    if(count === 0 || '@value' in rval || '@list' in rval ||
      (count === 1 && '@id' in rval)) {
      rval = null;
    }
  }

  return rval;
};

/**
 * Creates a JSON-LD node map (node ID => node).
 *
 * @param input the expanded JSON-LD to create a node map of.
 * @param [options] the options to use:
 *          [namer] the UniqueNamer to use.
 *
 * @return the node map.
 */
Processor.prototype.createNodeMap = function(input, options) {
  options = options || {};

  // produce a map of all subjects and name each bnode
  var namer = options.namer || new UniqueNamer('_:b');
  var graphs = {'@default': {}};
  _createNodeMap(input, graphs, '@default', namer);

  // add all non-default graphs to default graph
  return _mergeNodeMaps(graphs);
};

/**
 * Performs JSON-LD flattening.
 *
 * @param input the expanded JSON-LD to flatten.
 *
 * @return the flattened output.
 */
Processor.prototype.flatten = function(input) {
  var defaultGraph = this.createNodeMap(input);

  // produce flattened output
  var flattened = [];
  var keys = Object.keys(defaultGraph).sort();
  for(var ki = 0; ki < keys.length; ++ki) {
    var node = defaultGraph[keys[ki]];
    // only add full subjects to top-level
    if(!_isSubjectReference(node)) {
      flattened.push(node);
    }
  }
  return flattened;
};

/**
 * Performs JSON-LD framing.
 *
 * @param input the expanded JSON-LD to frame.
 * @param frame the expanded JSON-LD frame to use.
 * @param options the framing options.
 *
 * @return the framed output.
 */
Processor.prototype.frame = function(input, frame, options) {
  // create framing state
  var state = {
    options: options,
    graphs: {'@default': {}, '@merged': {}},
    subjectStack: [],
    link: {}
  };

  // produce a map of all graphs and name each bnode
  // FIXME: currently uses subjects from @merged graph only
  var namer = new UniqueNamer('_:b');
  _createNodeMap(input, state.graphs, '@merged', namer);
  state.subjects = state.graphs['@merged'];

  // frame the subjects
  var framed = [];
  _frame(state, Object.keys(state.subjects).sort(), frame, framed, null);
  return framed;
};

/**
 * Performs normalization on the given RDF dataset.
 *
 * @param dataset the RDF dataset to normalize.
 * @param options the normalization options.
 * @param callback(err, normalized) called once the operation completes.
 */
Processor.prototype.normalize = function(dataset, options, callback) {
  // create quads and map bnodes to their associated quads
  var quads = [];
  var bnodes = {};
  for(var graphName in dataset) {
    var triples = dataset[graphName];
    if(graphName === '@default') {
      graphName = null;
    }
    for(var ti = 0; ti < triples.length; ++ti) {
      var quad = triples[ti];
      if(graphName !== null) {
        if(graphName.indexOf('_:') === 0) {
          quad.name = {type: 'blank node', value: graphName};
        } else {
          quad.name = {type: 'IRI', value: graphName};
        }
      }
      quads.push(quad);

      var attrs = ['subject', 'object', 'name'];
      for(var ai = 0; ai < attrs.length; ++ai) {
        var attr = attrs[ai];
        if(quad[attr] && quad[attr].type === 'blank node') {
          var id = quad[attr].value;
          if(id in bnodes) {
            bnodes[id].quads.push(quad);
          } else {
            bnodes[id] = {quads: [quad]};
          }
        }
      }
    }
  }

  // mapping complete, start canonical naming
  var namer = new UniqueNamer('_:c14n');
  return hashBlankNodes(Object.keys(bnodes));

  // generates unique and duplicate hashes for bnodes
  function hashBlankNodes(unnamed) {
    var nextUnnamed = [];
    var duplicates = {};
    var unique = {};

    // hash quads for each unnamed bnode
    jsonld.setImmediate(function() {hashUnnamed(0);});
    function hashUnnamed(i) {
      if(i === unnamed.length) {
        // done, name blank nodes
        return nameBlankNodes(unique, duplicates, nextUnnamed);
      }

      // hash unnamed bnode
      var bnode = unnamed[i];
      var hash = _hashQuads(bnode, bnodes);

      // store hash as unique or a duplicate
      if(hash in duplicates) {
        duplicates[hash].push(bnode);
        nextUnnamed.push(bnode);
      } else if(hash in unique) {
        duplicates[hash] = [unique[hash], bnode];
        nextUnnamed.push(unique[hash]);
        nextUnnamed.push(bnode);
        delete unique[hash];
      } else {
        unique[hash] = bnode;
      }

      // hash next unnamed bnode
      jsonld.setImmediate(function() {hashUnnamed(i + 1);});
    }
  }

  // names unique hash bnodes
  function nameBlankNodes(unique, duplicates, unnamed) {
    // name unique bnodes in sorted hash order
    var named = false;
    var hashes = Object.keys(unique).sort();
    for(var i = 0; i < hashes.length; ++i) {
      var bnode = unique[hashes[i]];
      namer.getName(bnode);
      named = true;
    }

    if(named) {
      // continue to hash bnodes if a bnode was assigned a name
      hashBlankNodes(unnamed);
    } else {
      // name the duplicate hash bnodes
      nameDuplicates(duplicates);
    }
  }

  // names duplicate hash bnodes
  function nameDuplicates(duplicates) {
    // enumerate duplicate hash groups in sorted order
    var hashes = Object.keys(duplicates).sort();

    // process each group
    processGroup(0);
    function processGroup(i) {
      if(i === hashes.length) {
        // done, create JSON-LD array
        return createArray();
      }

      // name each group member
      var group = duplicates[hashes[i]];
      var results = [];
      nameGroupMember(group, 0);
      function nameGroupMember(group, n) {
        if(n === group.length) {
          // name bnodes in hash order
          results.sort(function(a, b) {
            a = a.hash;
            b = b.hash;
            return (a < b) ? -1 : ((a > b) ? 1 : 0);
          });
          for(var r = 0; r < results.length; ++r) {
            // name all bnodes in path namer in key-entry order
            // Note: key-order is preserved in javascript
            for(var key in results[r].pathNamer.existing) {
              namer.getName(key);
            }
          }
          return processGroup(i + 1);
        }

        // skip already-named bnodes
        var bnode = group[n];
        if(namer.isNamed(bnode)) {
          return nameGroupMember(group, n + 1);
        }

        // hash bnode paths
        var pathNamer = new UniqueNamer('_:b');
        pathNamer.getName(bnode);
        _hashPaths(bnode, bnodes, namer, pathNamer,
          function(err, result) {
            if(err) {
              return callback(err);
            }
            results.push(result);
            nameGroupMember(group, n + 1);
          });
      }
    }
  }

  // creates the sorted array of RDF quads
  function createArray() {
    var normalized = [];

    /* Note: At this point all bnodes in the set of RDF quads have been
     assigned canonical names, which have been stored in the 'namer' object.
     Here each quad is updated by assigning each of its bnodes its new name
     via the 'namer' object. */

    // update bnode names in each quad and serialize
    for(var i = 0; i < quads.length; ++i) {
      var quad = quads[i];
      var attrs = ['subject', 'object', 'name'];
      for(var ai = 0; ai < attrs.length; ++ai) {
        var attr = attrs[ai];
        if(quad[attr] && quad[attr].type === 'blank node' &&
          quad[attr].value.indexOf('_:c14n') !== 0) {
          quad[attr].value = namer.getName(quad[attr].value);
        }
      }
      normalized.push(_toNQuad(quad, quad.name ? quad.name.value : null));
    }

    // sort normalized output
    normalized.sort();

    // handle output format
    if(options.format) {
      if(options.format === 'application/nquads') {
        return callback(null, normalized.join(''));
      }
      return callback(new JsonLdError(
        'Unknown output format.',
        'jsonld.UnknownFormat', {format: options.format}));
    }

    // output RDF dataset
    callback(null, _parseNQuads(normalized.join('')));
  }
};

/**
 * Converts an RDF dataset to JSON-LD.
 *
 * @param dataset the RDF dataset.
 * @param options the RDF serialization options.
 * @param callback(err, output) called once the operation completes.
 */
Processor.prototype.fromRDF = function(dataset, options, callback) {
  var defaultGraph = {};
  var graphMap = {'@default': defaultGraph};
  var referencedOnce = {};

  for(var name in dataset) {
    var graph = dataset[name];
    if(!(name in graphMap)) {
      graphMap[name] = {};
    }
    if(name !== '@default' && !(name in defaultGraph)) {
      defaultGraph[name] = {'@id': name};
    }
    var nodeMap = graphMap[name];
    for(var ti = 0; ti < graph.length; ++ti) {
      var triple = graph[ti];

      // get subject, predicate, object
      var s = triple.subject.value;
      var p = triple.predicate.value;
      var o = triple.object;

      if(!(s in nodeMap)) {
        nodeMap[s] = {'@id': s};
      }
      var node = nodeMap[s];

      var objectIsId = (o.type === 'IRI' || o.type === 'blank node');
      if(objectIsId && !(o.value in nodeMap)) {
        nodeMap[o.value] = {'@id': o.value};
      }

      if(p === RDF_TYPE && !options.useRdfType && objectIsId) {
        jsonld.addValue(node, '@type', o.value, {propertyIsArray: true});
        continue;
      }

      var value = _RDFToObject(o, options.useNativeTypes);
      jsonld.addValue(node, p, value, {propertyIsArray: true});

      // object may be an RDF list/partial list node but we can't know easily
      // until all triples are read
      if(objectIsId) {
        if(o.value === RDF_NIL) {
          // track rdf:nil uniquely per graph
          var object = nodeMap[o.value];
          if(!('usages' in object)) {
            object.usages = [];
          }
          object.usages.push({
            node: node,
            property: p,
            value: value
          });
        } else if(o.value in referencedOnce) {
          // object referenced more than once
          referencedOnce[o.value] = false;
        } else {
          // keep track of single reference
          referencedOnce[o.value] = {
            node: node,
            property: p,
            value: value
          };
        }
      }
    }
  }

  // convert linked lists to @list arrays
  for(var name in graphMap) {
    var graphObject = graphMap[name];

    // no @lists to be converted, continue
    if(!(RDF_NIL in graphObject)) {
      continue;
    }

    // iterate backwards through each RDF list
    var nil = graphObject[RDF_NIL];
    for(var i = 0; i < nil.usages.length; ++i) {
      var usage = nil.usages[i];
      var node = usage.node;
      var property = usage.property;
      var head = usage.value;
      var list = [];
      var listNodes = [];

      // ensure node is a well-formed list node; it must:
      // 1. Be referenced only once.
      // 2. Have an array for rdf:first that has 1 item.
      // 3. Have an array for rdf:rest that has 1 item.
      // 4. Have no keys other than: @id, rdf:first, rdf:rest, and,
      //   optionally, @type where the value is rdf:List.
      var nodeKeyCount = Object.keys(node).length;
      while(property === RDF_REST &&
        _isObject(referencedOnce[node['@id']]) &&
        _isArray(node[RDF_FIRST]) && node[RDF_FIRST].length === 1 &&
        _isArray(node[RDF_REST]) && node[RDF_REST].length === 1 &&
        (nodeKeyCount === 3 || (nodeKeyCount === 4 && _isArray(node['@type']) &&
          node['@type'].length === 1 && node['@type'][0] === RDF_LIST))) {
        list.push(node[RDF_FIRST][0]);
        listNodes.push(node['@id']);

        // get next node, moving backwards through list
        usage = referencedOnce[node['@id']];
        node = usage.node;
        property = usage.property;
        head = usage.value;
        nodeKeyCount = Object.keys(node).length;

        // if node is not a blank node, then list head found
        if(node['@id'].indexOf('_:') !== 0) {
          break;
        }
      }

      // the list is nested in another list
      if(property === RDF_FIRST) {
        // empty list
        if(node['@id'] === RDF_NIL) {
          // can't convert rdf:nil to a @list object because it would
          // result in a list of lists which isn't supported
          continue;
        }

        // preserve list head
        head = graphObject[head['@id']][RDF_REST][0];
        list.pop();
        listNodes.pop();
      }

      // transform list into @list object
      delete head['@id'];
      head['@list'] = list.reverse();
      for(var j = 0; j < listNodes.length; ++j) {
        delete graphObject[listNodes[j]];
      }
    }

    delete nil.usages;
  }

  var result = [];
  var subjects = Object.keys(defaultGraph).sort();
  for(var i = 0; i < subjects.length; ++i) {
    var subject = subjects[i];
    var node = defaultGraph[subject];
    if(subject in graphMap) {
      var graph = node['@graph'] = [];
      var graphObject = graphMap[subject];
      var subjects_ = Object.keys(graphObject).sort();
      for(var si = 0; si < subjects_.length; ++si) {
        var node_ = graphObject[subjects_[si]];
        // only add full subjects to top-level
        if(!_isSubjectReference(node_)) {
          graph.push(node_);
        }
      }
    }
    // only add full subjects to top-level
    if(!_isSubjectReference(node)) {
      result.push(node);
    }
  }

  callback(null, result);
};

/**
 * Outputs an RDF dataset for the expanded JSON-LD input.
 *
 * @param input the expanded JSON-LD input.
 * @param options the RDF serialization options.
 *
 * @return the RDF dataset.
 */
Processor.prototype.toRDF = function(input, options) {
  // create node map for default graph (and any named graphs)
  var namer = new UniqueNamer('_:b');
  var nodeMap = {'@default': {}};
  _createNodeMap(input, nodeMap, '@default', namer);

  var dataset = {};
  var graphNames = Object.keys(nodeMap).sort();
  for(var i = 0; i < graphNames.length; ++i) {
    var graphName = graphNames[i];
    // skip relative IRIs
    if(graphName === '@default' || _isAbsoluteIri(graphName)) {
      dataset[graphName] = _graphToRDF(nodeMap[graphName], namer, options);
    }
  }
  return dataset;
};

/**
 * Processes a local context and returns a new active context.
 *
 * @param activeCtx the current active context.
 * @param localCtx the local context to process.
 * @param options the context processing options.
 *
 * @return the new active context.
 */
Processor.prototype.processContext = function(activeCtx, localCtx, options) {
  // normalize local context to an array of @context objects
  if(_isObject(localCtx) && '@context' in localCtx &&
    _isArray(localCtx['@context'])) {
    localCtx = localCtx['@context'];
  }
  var ctxs = _isArray(localCtx) ? localCtx : [localCtx];

  // no contexts in array, clone existing context
  if(ctxs.length === 0) {
    return activeCtx.clone();
  }

  // process each context in order, update active context
  // on each iteration to ensure proper caching
  var rval = activeCtx;
  for(var i = 0; i < ctxs.length; ++i) {
    var ctx = ctxs[i];

    // reset to initial context
    if(ctx === null) {
      rval = activeCtx = _getInitialContext(options);
      continue;
    }

    // dereference @context key if present
    if(_isObject(ctx) && '@context' in ctx) {
      ctx = ctx['@context'];
    }

    // context must be an object by now, all URLs retrieved before this call
    if(!_isObject(ctx)) {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; @context must be an object.',
        'jsonld.SyntaxError', {code: 'invalid local context', context: ctx});
    }

    // get context from cache if available
    if(jsonld.cache.activeCtx) {
      var cached = jsonld.cache.activeCtx.get(activeCtx, ctx);
      if(cached) {
        rval = activeCtx = cached;
        continue;
      }
    }

    // update active context and clone new one before updating
    activeCtx = rval;
    rval = rval.clone();

    // define context mappings for keys in local context
    var defined = {};

    // handle @base
    if('@base' in ctx) {
      var base = ctx['@base'];

      // clear base
      if(base === null) {
        base = null;
      } else if(!_isString(base)) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; the value of "@base" in a ' +
          '@context must be a string or null.',
          'jsonld.SyntaxError', {code: 'invalid base IRI', context: ctx});
      } else if(base !== '' && !_isAbsoluteIri(base)) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; the value of "@base" in a ' +
          '@context must be an absolute IRI or the empty string.',
          'jsonld.SyntaxError', {code: 'invalid base IRI', context: ctx});
      }

      if(base !== null) {
        base = jsonld.url.parse(base || '');
      }
      rval['@base'] = base;
      defined['@base'] = true;
    }

    // handle @vocab
    if('@vocab' in ctx) {
      var value = ctx['@vocab'];
      if(value === null) {
        delete rval['@vocab'];
      } else if(!_isString(value)) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; the value of "@vocab" in a ' +
          '@context must be a string or null.',
          'jsonld.SyntaxError', {code: 'invalid vocab mapping', context: ctx});
      } else if(!_isAbsoluteIri(value)) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; the value of "@vocab" in a ' +
          '@context must be an absolute IRI.',
          'jsonld.SyntaxError', {code: 'invalid vocab mapping', context: ctx});
      } else {
        rval['@vocab'] = value;
      }
      defined['@vocab'] = true;
    }

    // handle @language
    if('@language' in ctx) {
      var value = ctx['@language'];
      if(value === null) {
        delete rval['@language'];
      } else if(!_isString(value)) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; the value of "@language" in a ' +
          '@context must be a string or null.',
          'jsonld.SyntaxError',
          {code: 'invalid default language', context: ctx});
      } else {
        rval['@language'] = value.toLowerCase();
      }
      defined['@language'] = true;
    }

    // process all other keys
    for(var key in ctx) {
      _createTermDefinition(rval, ctx, key, defined);
    }

    // cache result
    if(jsonld.cache.activeCtx) {
      jsonld.cache.activeCtx.set(activeCtx, ctx, rval);
    }
  }

  return rval;
};

/**
 * Expands a language map.
 *
 * @param languageMap the language map to expand.
 *
 * @return the expanded language map.
 */
function _expandLanguageMap(languageMap) {
  var rval = [];
  var keys = Object.keys(languageMap).sort();
  for(var ki = 0; ki < keys.length; ++ki) {
    var key = keys[ki];
    var val = languageMap[key];
    if(!_isArray(val)) {
      val = [val];
    }
    for(var vi = 0; vi < val.length; ++vi) {
      var item = val[vi];
      if(!_isString(item)) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; language map values must be strings.',
          'jsonld.SyntaxError',
          {code: 'invalid language map value', languageMap: languageMap});
      }
      rval.push({
        '@value': item,
        '@language': key.toLowerCase()
      });
    }
  }
  return rval;
}

/**
 * Labels the blank nodes in the given value using the given UniqueNamer.
 *
 * @param namer the UniqueNamer to use.
 * @param element the element with blank nodes to rename.
 *
 * @return the element.
 */
function _labelBlankNodes(namer, element) {
  if(_isArray(element)) {
    for(var i = 0; i < element.length; ++i) {
      element[i] = _labelBlankNodes(namer, element[i]);
    }
  } else if(_isList(element)) {
    element['@list'] = _labelBlankNodes(namer, element['@list']);
  } else if(_isObject(element)) {
    // rename blank node
    if(_isBlankNode(element)) {
      element['@id'] = namer.getName(element['@id']);
    }

    // recursively apply to all keys
    var keys = Object.keys(element).sort();
    for(var ki = 0; ki < keys.length; ++ki) {
      var key = keys[ki];
      if(key !== '@id') {
        element[key] = _labelBlankNodes(namer, element[key]);
      }
    }
  }

  return element;
}

/**
 * Expands the given value by using the coercion and keyword rules in the
 * given context.
 *
 * @param activeCtx the active context to use.
 * @param activeProperty the active property the value is associated with.
 * @param value the value to expand.
 *
 * @return the expanded value.
 */
function _expandValue(activeCtx, activeProperty, value) {
  // nothing to expand
  if(value === null || value === undefined) {
    return null;
  }

  // special-case expand @id and @type (skips '@id' expansion)
  var expandedProperty = _expandIri(activeCtx, activeProperty, {vocab: true});
  if(expandedProperty === '@id') {
    return _expandIri(activeCtx, value, {base: true});
  } else if(expandedProperty === '@type') {
    return _expandIri(activeCtx, value, {vocab: true, base: true});
  }

  // get type definition from context
  var type = jsonld.getContextValue(activeCtx, activeProperty, '@type');

  // do @id expansion (automatic for @graph)
  if(type === '@id' || (expandedProperty === '@graph' && _isString(value))) {
    return {'@id': _expandIri(activeCtx, value, {base: true})};
  }
  // do @id expansion w/vocab
  if(type === '@vocab') {
    return {'@id': _expandIri(activeCtx, value, {vocab: true, base: true})};
  }

  // do not expand keyword values
  if(_isKeyword(expandedProperty)) {
    return value;
  }

  var rval = {};

  if(type !== null) {
    // other type
    rval['@type'] = type;
  } else if(_isString(value)) {
    // check for language tagging for strings
    var language = jsonld.getContextValue(
      activeCtx, activeProperty, '@language');
    if(language !== null) {
      rval['@language'] = language;
    }
  }
  // do conversion of values that aren't basic JSON types to strings
  if(['boolean', 'number', 'string'].indexOf(typeof value) === -1) {
    value = value.toString();
  }
  rval['@value'] = value;

  return rval;
}

/**
 * Creates an array of RDF triples for the given graph.
 *
 * @param graph the graph to create RDF triples for.
 * @param namer a UniqueNamer for assigning blank node names.
 * @param options the RDF serialization options.
 *
 * @return the array of RDF triples for the given graph.
 */
function _graphToRDF(graph, namer, options) {
  var rval = [];

  var ids = Object.keys(graph).sort();
  for(var i = 0; i < ids.length; ++i) {
    var id = ids[i];
    var node = graph[id];
    var properties = Object.keys(node).sort();
    for(var pi = 0; pi < properties.length; ++pi) {
      var property = properties[pi];
      var items = node[property];
      if(property === '@type') {
        property = RDF_TYPE;
      } else if(_isKeyword(property)) {
        continue;
      }

      for(var ii = 0; ii < items.length; ++ii) {
        var item = items[ii];

        // RDF subject
        var subject = {};
        subject.type = (id.indexOf('_:') === 0) ? 'blank node' : 'IRI';
        subject.value = id;

        // skip relative IRI subjects
        if(!_isAbsoluteIri(id)) {
          continue;
        }

        // RDF predicate
        var predicate = {};
        predicate.type = (property.indexOf('_:') === 0) ? 'blank node' : 'IRI';
        predicate.value = property;

        // skip relative IRI predicates
        if(!_isAbsoluteIri(property)) {
          continue;
        }

        // skip blank node predicates unless producing generalized RDF
        if(predicate.type === 'blank node' && !options.produceGeneralizedRdf) {
          continue;
        }

        // convert @list to triples
        if(_isList(item)) {
          _listToRDF(item['@list'], namer, subject, predicate, rval);
        } else {
          // convert value or node object to triple
          var object = _objectToRDF(item);
          // skip null objects (they are relative IRIs)
          if(object) {
            rval.push({subject: subject, predicate: predicate, object: object});
          }
        }
      }
    }
  }

  return rval;
}

/**
 * Converts a @list value into linked list of blank node RDF triples
 * (an RDF collection).
 *
 * @param list the @list value.
 * @param namer a UniqueNamer for assigning blank node names.
 * @param subject the subject for the head of the list.
 * @param predicate the predicate for the head of the list.
 * @param triples the array of triples to append to.
 */
function _listToRDF(list, namer, subject, predicate, triples) {
  var first = {type: 'IRI', value: RDF_FIRST};
  var rest = {type: 'IRI', value: RDF_REST};
  var nil = {type: 'IRI', value: RDF_NIL};

  for(var i = 0; i < list.length; ++i) {
    var item = list[i];

    var blankNode = {type: 'blank node', value: namer.getName()};
    triples.push({subject: subject, predicate: predicate, object: blankNode});

    subject = blankNode;
    predicate = first;
    var object = _objectToRDF(item);

    // skip null objects (they are relative IRIs)
    if(object) {
      triples.push({subject: subject, predicate: predicate, object: object});
    }

    predicate = rest;
  }

  triples.push({subject: subject, predicate: predicate, object: nil});
}

/**
 * Converts a JSON-LD value object to an RDF literal or a JSON-LD string or
 * node object to an RDF resource.
 *
 * @param item the JSON-LD value or node object.
 *
 * @return the RDF literal or RDF resource.
 */
function _objectToRDF(item) {
  var object = {};

  // convert value object to RDF
  if(_isValue(item)) {
    object.type = 'literal';
    var value = item['@value'];
    var datatype = item['@type'] || null;

    // convert to XSD datatypes as appropriate
    if(_isBoolean(value)) {
      object.value = value.toString();
      object.datatype = datatype || XSD_BOOLEAN;
    } else if(_isDouble(value) || datatype === XSD_DOUBLE) {
      if(!_isDouble(value)) {
        value = parseFloat(value);
      }
      // canonical double representation
      object.value = value.toExponential(15).replace(/(\d)0*e\+?/, '$1E');
      object.datatype = datatype || XSD_DOUBLE;
    } else if(_isNumber(value)) {
      object.value = value.toFixed(0);
      object.datatype = datatype || XSD_INTEGER;
    } else if('@language' in item) {
      object.value = value;
      object.datatype = datatype || RDF_LANGSTRING;
      object.language = item['@language'];
    } else {
      object.value = value;
      object.datatype = datatype || XSD_STRING;
    }
  } else {
    // convert string/node object to RDF
    var id = _isObject(item) ? item['@id'] : item;
    object.type = (id.indexOf('_:') === 0) ? 'blank node' : 'IRI';
    object.value = id;
  }

  // skip relative IRIs
  if(object.type === 'IRI' && !_isAbsoluteIri(object.value)) {
    return null;
  }

  return object;
}

/**
 * Converts an RDF triple object to a JSON-LD object.
 *
 * @param o the RDF triple object to convert.
 * @param useNativeTypes true to output native types, false not to.
 *
 * @return the JSON-LD object.
 */
function _RDFToObject(o, useNativeTypes) {
  // convert IRI/blank node object to JSON-LD
  if(o.type === 'IRI' || o.type === 'blank node') {
    return {'@id': o.value};
  }

  // convert literal to JSON-LD
  var rval = {'@value': o.value};

  // add language
  if(o.language) {
    rval['@language'] = o.language;
  } else {
    var type = o.datatype;
    if(!type) {
      type = XSD_STRING;
    }
    // use native types for certain xsd types
    if(useNativeTypes) {
      if(type === XSD_BOOLEAN) {
        if(rval['@value'] === 'true') {
          rval['@value'] = true;
        } else if(rval['@value'] === 'false') {
          rval['@value'] = false;
        }
      } else if(_isNumeric(rval['@value'])) {
        if(type === XSD_INTEGER) {
          var i = parseInt(rval['@value'], 10);
          if(i.toFixed(0) === rval['@value']) {
            rval['@value'] = i;
          }
        } else if(type === XSD_DOUBLE) {
          rval['@value'] = parseFloat(rval['@value']);
        }
      }
      // do not add native type
      if([XSD_BOOLEAN, XSD_INTEGER, XSD_DOUBLE, XSD_STRING]
        .indexOf(type) === -1) {
        rval['@type'] = type;
      }
    } else if(type !== XSD_STRING) {
      rval['@type'] = type;
    }
  }

  return rval;
}

/**
 * Compares two RDF triples for equality.
 *
 * @param t1 the first triple.
 * @param t2 the second triple.
 *
 * @return true if the triples are the same, false if not.
 */
function _compareRDFTriples(t1, t2) {
  var attrs = ['subject', 'predicate', 'object'];
  for(var i = 0; i < attrs.length; ++i) {
    var attr = attrs[i];
    if(t1[attr].type !== t2[attr].type || t1[attr].value !== t2[attr].value) {
      return false;
    }
  }
  if(t1.object.language !== t2.object.language) {
    return false;
  }
  if(t1.object.datatype !== t2.object.datatype) {
    return false;
  }
  return true;
}

/**
 * Hashes all of the quads about a blank node.
 *
 * @param id the ID of the bnode to hash quads for.
 * @param bnodes the mapping of bnodes to quads.
 *
 * @return the new hash.
 */
function _hashQuads(id, bnodes) {
  // return cached hash
  if('hash' in bnodes[id]) {
    return bnodes[id].hash;
  }

  // serialize all of bnode's quads
  var quads = bnodes[id].quads;
  var nquads = [];
  for(var i = 0; i < quads.length; ++i) {
    nquads.push(_toNQuad(
      quads[i], quads[i].name ? quads[i].name.value : null, id));
  }
  // sort serialized quads
  nquads.sort();
  // return hashed quads
  var hash = bnodes[id].hash = sha1.hash(nquads);
  return hash;
}

/**
 * Produces a hash for the paths of adjacent bnodes for a bnode,
 * incorporating all information about its subgraph of bnodes. This
 * method will recursively pick adjacent bnode permutations that produce the
 * lexicographically-least 'path' serializations.
 *
 * @param id the ID of the bnode to hash paths for.
 * @param bnodes the map of bnode quads.
 * @param namer the canonical bnode namer.
 * @param pathNamer the namer used to assign names to adjacent bnodes.
 * @param callback(err, result) called once the operation completes.
 */
function _hashPaths(id, bnodes, namer, pathNamer, callback) {
  // create SHA-1 digest
  var md = sha1.create();

  // group adjacent bnodes by hash, keep properties and references separate
  var groups = {};
  var groupHashes;
  var quads = bnodes[id].quads;
  jsonld.setImmediate(function() {groupNodes(0);});
  function groupNodes(i) {
    if(i === quads.length) {
      // done, hash groups
      groupHashes = Object.keys(groups).sort();
      return hashGroup(0);
    }

    // get adjacent bnode
    var quad = quads[i];
    var bnode = _getAdjacentBlankNodeName(quad.subject, id);
    var direction = null;
    if(bnode !== null) {
      // normal property
      direction = 'p';
    } else {
      bnode = _getAdjacentBlankNodeName(quad.object, id);
      if(bnode !== null) {
        // reverse property
        direction = 'r';
      }
    }

    if(bnode !== null) {
      // get bnode name (try canonical, path, then hash)
      var name;
      if(namer.isNamed(bnode)) {
        name = namer.getName(bnode);
      } else if(pathNamer.isNamed(bnode)) {
        name = pathNamer.getName(bnode);
      } else {
        name = _hashQuads(bnode, bnodes);
      }

      // hash direction, property, and bnode name/hash
      var md = sha1.create();
      md.update(direction);
      md.update(quad.predicate.value);
      md.update(name);
      var groupHash = md.digest();

      // add bnode to hash group
      if(groupHash in groups) {
        groups[groupHash].push(bnode);
      } else {
        groups[groupHash] = [bnode];
      }
    }

    jsonld.setImmediate(function() {groupNodes(i + 1);});
  }

  // hashes a group of adjacent bnodes
  function hashGroup(i) {
    if(i === groupHashes.length) {
      // done, return SHA-1 digest and path namer
      return callback(null, {hash: md.digest(), pathNamer: pathNamer});
    }

    // digest group hash
    var groupHash = groupHashes[i];
    md.update(groupHash);

    // choose a path and namer from the permutations
    var chosenPath = null;
    var chosenNamer = null;
    var permutator = new Permutator(groups[groupHash]);
    jsonld.setImmediate(function() {permutate();});
    function permutate() {
      var permutation = permutator.next();
      var pathNamerCopy = pathNamer.clone();

      // build adjacent path
      var path = '';
      var recurse = [];
      for(var n in permutation) {
        var bnode = permutation[n];

        // use canonical name if available
        if(namer.isNamed(bnode)) {
          path += namer.getName(bnode);
        } else {
          // recurse if bnode isn't named in the path yet
          if(!pathNamerCopy.isNamed(bnode)) {
            recurse.push(bnode);
          }
          path += pathNamerCopy.getName(bnode);
        }

        // skip permutation if path is already >= chosen path
        if(chosenPath !== null && path.length >= chosenPath.length &&
          path > chosenPath) {
          return nextPermutation(true);
        }
      }

      // does the next recursion
      nextRecursion(0);
      function nextRecursion(n) {
        if(n === recurse.length) {
          // done, do next permutation
          return nextPermutation(false);
        }

        // do recursion
        var bnode = recurse[n];
        _hashPaths(bnode, bnodes, namer, pathNamerCopy,
          function(err, result) {
            if(err) {
              return callback(err);
            }
            path += pathNamerCopy.getName(bnode) + '<' + result.hash + '>';
            pathNamerCopy = result.pathNamer;

            // skip permutation if path is already >= chosen path
            if(chosenPath !== null && path.length >= chosenPath.length &&
              path > chosenPath) {
              return nextPermutation(true);
            }

            // do next recursion
            nextRecursion(n + 1);
          });
      }

      // stores the results of this permutation and runs the next
      function nextPermutation(skipped) {
        if(!skipped && (chosenPath === null || path < chosenPath)) {
          chosenPath = path;
          chosenNamer = pathNamerCopy;
        }

        // do next permutation
        if(permutator.hasNext()) {
          jsonld.setImmediate(function() {permutate();});
        } else {
          // digest chosen path and update namer
          md.update(chosenPath);
          pathNamer = chosenNamer;

          // hash the next group
          hashGroup(i + 1);
        }
      }
    }
  }
}

/**
 * A helper function that gets the blank node name from an RDF quad node
 * (subject or object). If the node is a blank node and its value
 * does not match the given blank node ID, it will be returned.
 *
 * @param node the RDF quad node.
 * @param id the ID of the blank node to look next to.
 *
 * @return the adjacent blank node name or null if none was found.
 */
function _getAdjacentBlankNodeName(node, id) {
  return (node.type === 'blank node' && node.value !== id ? node.value : null);
}

/**
 * Recursively flattens the subjects in the given JSON-LD expanded input
 * into a node map.
 *
 * @param input the JSON-LD expanded input.
 * @param graphs a map of graph name to subject map.
 * @param graph the name of the current graph.
 * @param namer the blank node namer.
 * @param name the name assigned to the current input if it is a bnode.
 * @param list the list to append to, null for none.
 */
function _createNodeMap(input, graphs, graph, namer, name, list) {
  // recurse through array
  if(_isArray(input)) {
    for(var i = 0; i < input.length; ++i) {
      _createNodeMap(input[i], graphs, graph, namer, undefined, list);
    }
    return;
  }

  // add non-object to list
  if(!_isObject(input)) {
    if(list) {
      list.push(input);
    }
    return;
  }

  // add values to list
  if(_isValue(input)) {
    if('@type' in input) {
      var type = input['@type'];
      // rename @type blank node
      if(type.indexOf('_:') === 0) {
        input['@type'] = type = namer.getName(type);
      }
    }
    if(list) {
      list.push(input);
    }
    return;
  }

  // Note: At this point, input must be a subject.

  // spec requires @type to be named first, so assign names early
  if('@type' in input) {
    var types = input['@type'];
    for(var i = 0; i < types.length; ++i) {
      var type = types[i];
      if(type.indexOf('_:') === 0) {
        namer.getName(type);
      }
    }
  }

  // get name for subject
  if(_isUndefined(name)) {
    name = _isBlankNode(input) ? namer.getName(input['@id']) : input['@id'];
  }

  // add subject reference to list
  if(list) {
    list.push({'@id': name});
  }

  // create new subject or merge into existing one
  var subjects = graphs[graph];
  var subject = subjects[name] = subjects[name] || {};
  subject['@id'] = name;
  var properties = Object.keys(input).sort();
  for(var pi = 0; pi < properties.length; ++pi) {
    var property = properties[pi];

    // skip @id
    if(property === '@id') {
      continue;
    }

    // handle reverse properties
    if(property === '@reverse') {
      var referencedNode = {'@id': name};
      var reverseMap = input['@reverse'];
      for(var reverseProperty in reverseMap) {
        var items = reverseMap[reverseProperty];
        for(var ii = 0; ii < items.length; ++ii) {
          var item = items[ii];
          var itemName = item['@id'];
          if(_isBlankNode(item)) {
            itemName = namer.getName(itemName);
          }
          _createNodeMap(item, graphs, graph, namer, itemName);
          jsonld.addValue(
            subjects[itemName], reverseProperty, referencedNode,
            {propertyIsArray: true, allowDuplicate: false});
        }
      }
      continue;
    }

    // recurse into graph
    if(property === '@graph') {
      // add graph subjects map entry
      if(!(name in graphs)) {
        graphs[name] = {};
      }
      var g = (graph === '@merged') ? graph : name;
      _createNodeMap(input[property], graphs, g, namer);
      continue;
    }

    // copy non-@type keywords
    if(property !== '@type' && _isKeyword(property)) {
      if(property === '@index' && property in subject &&
        (input[property] !== subject[property] ||
        input[property]['@id'] !== subject[property]['@id'])) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; conflicting @index property detected.',
          'jsonld.SyntaxError',
          {code: 'conflicting indexes', subject: subject});
      }
      subject[property] = input[property];
      continue;
    }

    // iterate over objects
    var objects = input[property];

    // if property is a bnode, assign it a new id
    if(property.indexOf('_:') === 0) {
      property = namer.getName(property);
    }

    // ensure property is added for empty arrays
    if(objects.length === 0) {
      jsonld.addValue(subject, property, [], {propertyIsArray: true});
      continue;
    }
    for(var oi = 0; oi < objects.length; ++oi) {
      var o = objects[oi];

      if(property === '@type') {
        // rename @type blank nodes
        o = (o.indexOf('_:') === 0) ? namer.getName(o) : o;
      }

      // handle embedded subject or subject reference
      if(_isSubject(o) || _isSubjectReference(o)) {
        // rename blank node @id
        var id = _isBlankNode(o) ? namer.getName(o['@id']) : o['@id'];

        // add reference and recurse
        jsonld.addValue(
          subject, property, {'@id': id},
          {propertyIsArray: true, allowDuplicate: false});
        _createNodeMap(o, graphs, graph, namer, id);
      } else if(_isList(o)) {
        // handle @list
        var _list = [];
        _createNodeMap(o['@list'], graphs, graph, namer, name, _list);
        o = {'@list': _list};
        jsonld.addValue(
          subject, property, o,
          {propertyIsArray: true, allowDuplicate: false});
      } else {
        // handle @value
        _createNodeMap(o, graphs, graph, namer, name);
        jsonld.addValue(
          subject, property, o, {propertyIsArray: true, allowDuplicate: false});
      }
    }
  }
}

function _mergeNodeMaps(graphs) {
  // add all non-default graphs to default graph
  var defaultGraph = graphs['@default'];
  var graphNames = Object.keys(graphs).sort();
  for(var i = 0; i < graphNames.length; ++i) {
    var graphName = graphNames[i];
    if(graphName === '@default') {
      continue;
    }
    var nodeMap = graphs[graphName];
    var subject = defaultGraph[graphName];
    if(!subject) {
      defaultGraph[graphName] = subject = {
        '@id': graphName,
        '@graph': []
      };
    } else if(!('@graph' in subject)) {
      subject['@graph'] = [];
    }
    var graph = subject['@graph'];
    var ids = Object.keys(nodeMap).sort();
    for(var ii = 0; ii < ids.length; ++ii) {
      var node = nodeMap[ids[ii]];
      // only add full subjects
      if(!_isSubjectReference(node)) {
        graph.push(node);
      }
    }
  }
  return defaultGraph;
}

/**
 * Frames subjects according to the given frame.
 *
 * @param state the current framing state.
 * @param subjects the subjects to filter.
 * @param frame the frame.
 * @param parent the parent subject or top-level array.
 * @param property the parent property, initialized to null.
 */
function _frame(state, subjects, frame, parent, property) {
  // validate the frame
  _validateFrame(frame);
  frame = frame[0];

  // get flags for current frame
  var options = state.options;
  var flags = {
    embed: _getFrameFlag(frame, options, 'embed'),
    explicit: _getFrameFlag(frame, options, 'explicit'),
    requireAll: _getFrameFlag(frame, options, 'requireAll')
  };

  // filter out subjects that match the frame
  var matches = _filterSubjects(state, subjects, frame, flags);

  // add matches to output
  var ids = Object.keys(matches).sort();
  for(var idx = 0; idx < ids.length; ++idx) {
    var id = ids[idx];
    var subject = matches[id];

    if(flags.embed === '@link' && id in state.link) {
      // TODO: may want to also match an existing linked subject against
      // the current frame ... so different frames could produce different
      // subjects that are only shared in-memory when the frames are the same

      // add existing linked subject
      _addFrameOutput(parent, property, state.link[id]);
      continue;
    }

    /* Note: In order to treat each top-level match as a compartmentalized
    result, clear the unique embedded subjects map when the property is null,
    which only occurs at the top-level. */
    if(property === null) {
      state.uniqueEmbeds = {};
    }

    // start output for subject
    var output = {};
    output['@id'] = id;
    state.link[id] = output;

    // if embed is @never or if a circular reference would be created by an
    // embed, the subject cannot be embedded, just add the reference;
    // note that a circular reference won't occur when the embed flag is
    // `@link` as the above check will short-circuit before reaching this point
    if(flags.embed === '@never' ||
      _createsCircularReference(subject, state.subjectStack)) {
      _addFrameOutput(parent, property, output);
      continue;
    }

    // if only the last match should be embedded
    if(flags.embed === '@last') {
      // remove any existing embed
      if(id in state.uniqueEmbeds) {
        _removeEmbed(state, id);
      }
      state.uniqueEmbeds[id] = {parent: parent, property: property};
    }

    // push matching subject onto stack to enable circular embed checks
    state.subjectStack.push(subject);

    // iterate over subject properties
    var props = Object.keys(subject).sort();
    for(var i = 0; i < props.length; i++) {
      var prop = props[i];

      // copy keywords to output
      if(_isKeyword(prop)) {
        output[prop] = _clone(subject[prop]);
        continue;
      }

      // explicit is on and property isn't in the frame, skip processing
      if(flags.explicit && !(prop in frame)) {
        continue;
      }

      // add objects
      var objects = subject[prop];
      for(var oi = 0; oi < objects.length; ++oi) {
        var o = objects[oi];

        // recurse into list
        if(_isList(o)) {
          // add empty list
          var list = {'@list': []};
          _addFrameOutput(output, prop, list);

          // add list objects
          var src = o['@list'];
          for(var n in src) {
            o = src[n];
            if(_isSubjectReference(o)) {
              var subframe = (prop in frame ?
                frame[prop][0]['@list'] : _createImplicitFrame(flags));
              // recurse into subject reference
              _frame(state, [o['@id']], subframe, list, '@list');
            } else {
              // include other values automatically
              _addFrameOutput(list, '@list', _clone(o));
            }
          }
          continue;
        }

        if(_isSubjectReference(o)) {
          // recurse into subject reference
          var subframe = (prop in frame ?
            frame[prop] : _createImplicitFrame(flags));
          _frame(state, [o['@id']], subframe, output, prop);
        } else {
          // include other values automatically
          _addFrameOutput(output, prop, _clone(o));
        }
      }
    }

    // handle defaults
    var props = Object.keys(frame).sort();
    for(var i = 0; i < props.length; ++i) {
      var prop = props[i];

      // skip keywords
      if(_isKeyword(prop)) {
        continue;
      }

      // if omit default is off, then include default values for properties
      // that appear in the next frame but are not in the matching subject
      var next = frame[prop][0];
      var omitDefaultOn = _getFrameFlag(next, options, 'omitDefault');
      if(!omitDefaultOn && !(prop in output)) {
        var preserve = '@null';
        if('@default' in next) {
          preserve = _clone(next['@default']);
        }
        if(!_isArray(preserve)) {
          preserve = [preserve];
        }
        output[prop] = [{'@preserve': preserve}];
      }
    }

    // add output to parent
    _addFrameOutput(parent, property, output);

    // pop matching subject from circular ref-checking stack
    state.subjectStack.pop();
  }
}

/**
 * Creates an implicit frame when recursing through subject matches. If
 * a frame doesn't have an explicit frame for a particular property, then
 * a wildcard child frame will be created that uses the same flags that the
 * parent frame used.
 *
 * @param flags the current framing flags.
 *
 * @return the implicit frame.
 */
function _createImplicitFrame(flags) {
  var frame = {};
  for(var key in flags) {
    if(flags[key] !== undefined) {
      frame['@' + key] = [flags[key]];
    }
  }
  return [frame];
}

/**
 * Checks the current subject stack to see if embedding the given subject
 * would cause a circular reference.
 *
 * @param subjectToEmbed the subject to embed.
 * @param subjectStack the current stack of subjects.
 *
 * @return true if a circular reference would be created, false if not.
 */
function _createsCircularReference(subjectToEmbed, subjectStack) {
  for(var i = subjectStack.length - 1; i >= 0; --i) {
    if(subjectStack[i]['@id'] === subjectToEmbed['@id']) {
      return true;
    }
  }
  return false;
}

/**
 * Gets the frame flag value for the given flag name.
 *
 * @param frame the frame.
 * @param options the framing options.
 * @param name the flag name.
 *
 * @return the flag value.
 */
function _getFrameFlag(frame, options, name) {
  var flag = '@' + name;
  var rval = (flag in frame ? frame[flag][0] : options[name]);
  if(name === 'embed') {
    // default is "@last"
    // backwards-compatibility support for "embed" maps:
    // true => "@last"
    // false => "@never"
    if(rval === true) {
      rval = '@last';
    } else if(rval === false) {
      rval = '@never';
    } else if(rval !== '@always' && rval !== '@never' && rval !== '@link') {
      rval = '@last';
    }
  }
  return rval;
}

/**
 * Validates a JSON-LD frame, throwing an exception if the frame is invalid.
 *
 * @param frame the frame to validate.
 */
function _validateFrame(frame) {
  if(!_isArray(frame) || frame.length !== 1 || !_isObject(frame[0])) {
    throw new JsonLdError(
      'Invalid JSON-LD syntax; a JSON-LD frame must be a single object.',
      'jsonld.SyntaxError', {frame: frame});
  }
}

/**
 * Returns a map of all of the subjects that match a parsed frame.
 *
 * @param state the current framing state.
 * @param subjects the set of subjects to filter.
 * @param frame the parsed frame.
 * @param flags the frame flags.
 *
 * @return all of the matched subjects.
 */
function _filterSubjects(state, subjects, frame, flags) {
  // filter subjects in @id order
  var rval = {};
  for(var i = 0; i < subjects.length; ++i) {
    var id = subjects[i];
    var subject = state.subjects[id];
    if(_filterSubject(subject, frame, flags)) {
      rval[id] = subject;
    }
  }
  return rval;
}

/**
 * Returns true if the given subject matches the given frame.
 *
 * @param subject the subject to check.
 * @param frame the frame to check.
 * @param flags the frame flags.
 *
 * @return true if the subject matches, false if not.
 */
function _filterSubject(subject, frame, flags) {
  // check @type (object value means 'any' type, fall through to ducktyping)
  if('@type' in frame &&
    !(frame['@type'].length === 1 && _isObject(frame['@type'][0]))) {
    var types = frame['@type'];
    for(var i = 0; i < types.length; ++i) {
      // any matching @type is a match
      if(jsonld.hasValue(subject, '@type', types[i])) {
        return true;
      }
    }
    return false;
  }

  // check ducktype
  var wildcard = true;
  var matchesSome = false;
  for(var key in frame) {
    if(_isKeyword(key)) {
      // skip non-@id and non-@type
      if(key !== '@id' && key !== '@type') {
        continue;
      }
      wildcard = false;

      // check @id for a specific @id value
      if(key === '@id' && _isString(frame[key])) {
        if(subject[key] !== frame[key]) {
          return false;
        }
        matchesSome = true;
        continue;
      }
    }

    wildcard = false;

    if(key in subject) {
      // frame[key] === [] means do not match if property is present
      if(_isArray(frame[key]) && frame[key].length === 0 &&
        subject[key] !== undefined) {
        return false;
      }
      matchesSome = true;
      continue;
    }

    // all properties must match to be a duck unless a @default is specified
    var hasDefault = (_isArray(frame[key]) && _isObject(frame[key][0]) &&
      '@default' in frame[key][0]);
    if(flags.requireAll && !hasDefault) {
      return false;
    }
  }

  // return true if wildcard or subject matches some properties
  return wildcard || matchesSome;
}

/**
 * Removes an existing embed.
 *
 * @param state the current framing state.
 * @param id the @id of the embed to remove.
 */
function _removeEmbed(state, id) {
  // get existing embed
  var embeds = state.uniqueEmbeds;
  var embed = embeds[id];
  var parent = embed.parent;
  var property = embed.property;

  // create reference to replace embed
  var subject = {'@id': id};

  // remove existing embed
  if(_isArray(parent)) {
    // replace subject with reference
    for(var i = 0; i < parent.length; ++i) {
      if(jsonld.compareValues(parent[i], subject)) {
        parent[i] = subject;
        break;
      }
    }
  } else {
    // replace subject with reference
    var useArray = _isArray(parent[property]);
    jsonld.removeValue(parent, property, subject, {propertyIsArray: useArray});
    jsonld.addValue(parent, property, subject, {propertyIsArray: useArray});
  }

  // recursively remove dependent dangling embeds
  var removeDependents = function(id) {
    // get embed keys as a separate array to enable deleting keys in map
    var ids = Object.keys(embeds);
    for(var i = 0; i < ids.length; ++i) {
      var next = ids[i];
      if(next in embeds && _isObject(embeds[next].parent) &&
        embeds[next].parent['@id'] === id) {
        delete embeds[next];
        removeDependents(next);
      }
    }
  };
  removeDependents(id);
}

/**
 * Adds framing output to the given parent.
 *
 * @param parent the parent to add to.
 * @param property the parent property.
 * @param output the output to add.
 */
function _addFrameOutput(parent, property, output) {
  if(_isObject(parent)) {
    jsonld.addValue(parent, property, output, {propertyIsArray: true});
  } else {
    parent.push(output);
  }
}

/**
 * Removes the @preserve keywords as the last step of the framing algorithm.
 *
 * @param ctx the active context used to compact the input.
 * @param input the framed, compacted output.
 * @param options the compaction options used.
 *
 * @return the resulting output.
 */
function _removePreserve(ctx, input, options) {
  // recurse through arrays
  if(_isArray(input)) {
    var output = [];
    for(var i = 0; i < input.length; ++i) {
      var result = _removePreserve(ctx, input[i], options);
      // drop nulls from arrays
      if(result !== null) {
        output.push(result);
      }
    }
    input = output;
  } else if(_isObject(input)) {
    // remove @preserve
    if('@preserve' in input) {
      if(input['@preserve'] === '@null') {
        return null;
      }
      return input['@preserve'];
    }

    // skip @values
    if(_isValue(input)) {
      return input;
    }

    // recurse through @lists
    if(_isList(input)) {
      input['@list'] = _removePreserve(ctx, input['@list'], options);
      return input;
    }

    // handle in-memory linked nodes
    var idAlias = _compactIri(ctx, '@id');
    if(idAlias in input) {
      var id = input[idAlias];
      if(id in options.link) {
        var idx = options.link[id].indexOf(input);
        if(idx === -1) {
          // prevent circular visitation
          options.link[id].push(input);
        } else {
          // already visited
          return options.link[id][idx];
        }
      } else {
        // prevent circular visitation
        options.link[id] = [input];
      }
    }

    // recurse through properties
    for(var prop in input) {
      var result = _removePreserve(ctx, input[prop], options);
      var container = jsonld.getContextValue(ctx, prop, '@container');
      if(options.compactArrays && _isArray(result) && result.length === 1 &&
        container === null) {
        result = result[0];
      }
      input[prop] = result;
    }
  }
  return input;
}

/**
 * Compares two strings first based on length and then lexicographically.
 *
 * @param a the first string.
 * @param b the second string.
 *
 * @return -1 if a < b, 1 if a > b, 0 if a == b.
 */
function _compareShortestLeast(a, b) {
  if(a.length < b.length) {
    return -1;
  }
  if(b.length < a.length) {
    return 1;
  }
  if(a === b) {
    return 0;
  }
  return (a < b) ? -1 : 1;
}

/**
 * Picks the preferred compaction term from the given inverse context entry.
 *
 * @param activeCtx the active context.
 * @param iri the IRI to pick the term for.
 * @param value the value to pick the term for.
 * @param containers the preferred containers.
 * @param typeOrLanguage either '@type' or '@language'.
 * @param typeOrLanguageValue the preferred value for '@type' or '@language'.
 *
 * @return the preferred term.
 */
function _selectTerm(
  activeCtx, iri, value, containers, typeOrLanguage, typeOrLanguageValue) {
  if(typeOrLanguageValue === null) {
    typeOrLanguageValue = '@null';
  }

  // preferences for the value of @type or @language
  var prefs = [];

  // determine prefs for @id based on whether or not value compacts to a term
  if((typeOrLanguageValue === '@id' || typeOrLanguageValue === '@reverse') &&
    _isSubjectReference(value)) {
    // prefer @reverse first
    if(typeOrLanguageValue === '@reverse') {
      prefs.push('@reverse');
    }
    // try to compact value to a term
    var term = _compactIri(activeCtx, value['@id'], null, {vocab: true});
    if(term in activeCtx.mappings &&
      activeCtx.mappings[term] &&
      activeCtx.mappings[term]['@id'] === value['@id']) {
      // prefer @vocab
      prefs.push.apply(prefs, ['@vocab', '@id']);
    } else {
      // prefer @id
      prefs.push.apply(prefs, ['@id', '@vocab']);
    }
  } else {
    prefs.push(typeOrLanguageValue);
  }
  prefs.push('@none');

  var containerMap = activeCtx.inverse[iri];
  for(var ci = 0; ci < containers.length; ++ci) {
    // if container not available in the map, continue
    var container = containers[ci];
    if(!(container in containerMap)) {
      continue;
    }

    var typeOrLanguageValueMap = containerMap[container][typeOrLanguage];
    for(var pi = 0; pi < prefs.length; ++pi) {
      // if type/language option not available in the map, continue
      var pref = prefs[pi];
      if(!(pref in typeOrLanguageValueMap)) {
        continue;
      }

      // select term
      return typeOrLanguageValueMap[pref];
    }
  }

  return null;
}

/**
 * Compacts an IRI or keyword into a term or prefix if it can be. If the
 * IRI has an associated value it may be passed.
 *
 * @param activeCtx the active context to use.
 * @param iri the IRI to compact.
 * @param value the value to check or null.
 * @param relativeTo options for how to compact IRIs:
 *          vocab: true to split after @vocab, false not to.
 * @param reverse true if a reverse property is being compacted, false if not.
 *
 * @return the compacted term, prefix, keyword alias, or the original IRI.
 */
function _compactIri(activeCtx, iri, value, relativeTo, reverse) {
  // can't compact null
  if(iri === null) {
    return iri;
  }

  // default value and parent to null
  if(_isUndefined(value)) {
    value = null;
  }
  // default reverse to false
  if(_isUndefined(reverse)) {
    reverse = false;
  }
  relativeTo = relativeTo || {};

  // if term is a keyword, default vocab to true
  if(_isKeyword(iri)) {
    relativeTo.vocab = true;
  }

  // use inverse context to pick a term if iri is relative to vocab
  if(relativeTo.vocab && iri in activeCtx.getInverse()) {
    var defaultLanguage = activeCtx['@language'] || '@none';

    // prefer @index if available in value
    var containers = [];
    if(_isObject(value) && '@index' in value) {
      containers.push('@index');
    }

    // defaults for term selection based on type/language
    var typeOrLanguage = '@language';
    var typeOrLanguageValue = '@null';

    if(reverse) {
      typeOrLanguage = '@type';
      typeOrLanguageValue = '@reverse';
      containers.push('@set');
    } else if(_isList(value)) {
      // choose the most specific term that works for all elements in @list
      // only select @list containers if @index is NOT in value
      if(!('@index' in value)) {
        containers.push('@list');
      }
      var list = value['@list'];
      var commonLanguage = (list.length === 0) ? defaultLanguage : null;
      var commonType = null;
      for(var i = 0; i < list.length; ++i) {
        var item = list[i];
        var itemLanguage = '@none';
        var itemType = '@none';
        if(_isValue(item)) {
          if('@language' in item) {
            itemLanguage = item['@language'];
          } else if('@type' in item) {
            itemType = item['@type'];
          } else {
            // plain literal
            itemLanguage = '@null';
          }
        } else {
          itemType = '@id';
        }
        if(commonLanguage === null) {
          commonLanguage = itemLanguage;
        } else if(itemLanguage !== commonLanguage && _isValue(item)) {
          commonLanguage = '@none';
        }
        if(commonType === null) {
          commonType = itemType;
        } else if(itemType !== commonType) {
          commonType = '@none';
        }
        // there are different languages and types in the list, so choose
        // the most generic term, no need to keep iterating the list
        if(commonLanguage === '@none' && commonType === '@none') {
          break;
        }
      }
      commonLanguage = commonLanguage || '@none';
      commonType = commonType || '@none';
      if(commonType !== '@none') {
        typeOrLanguage = '@type';
        typeOrLanguageValue = commonType;
      } else {
        typeOrLanguageValue = commonLanguage;
      }
    } else {
      if(_isValue(value)) {
        if('@language' in value && !('@index' in value)) {
          containers.push('@language');
          typeOrLanguageValue = value['@language'];
        } else if('@type' in value) {
          typeOrLanguage = '@type';
          typeOrLanguageValue = value['@type'];
        }
      } else {
        typeOrLanguage = '@type';
        typeOrLanguageValue = '@id';
      }
      containers.push('@set');
    }

    // do term selection
    containers.push('@none');
    var term = _selectTerm(
      activeCtx, iri, value, containers, typeOrLanguage, typeOrLanguageValue);
    if(term !== null) {
      return term;
    }
  }

  // no term match, use @vocab if available
  if(relativeTo.vocab) {
    if('@vocab' in activeCtx) {
      // determine if vocab is a prefix of the iri
      var vocab = activeCtx['@vocab'];
      if(iri.indexOf(vocab) === 0 && iri !== vocab) {
        // use suffix as relative iri if it is not a term in the active context
        var suffix = iri.substr(vocab.length);
        if(!(suffix in activeCtx.mappings)) {
          return suffix;
        }
      }
    }
  }

  // no term or @vocab match, check for possible CURIEs
  var choice = null;
  for(var term in activeCtx.mappings) {
    // skip terms with colons, they can't be prefixes
    if(term.indexOf(':') !== -1) {
      continue;
    }
    // skip entries with @ids that are not partial matches
    var definition = activeCtx.mappings[term];
    if(!definition ||
      definition['@id'] === iri || iri.indexOf(definition['@id']) !== 0) {
      continue;
    }

    // a CURIE is usable if:
    // 1. it has no mapping, OR
    // 2. value is null, which means we're not compacting an @value, AND
    //   the mapping matches the IRI)
    var curie = term + ':' + iri.substr(definition['@id'].length);
    var isUsableCurie = (!(curie in activeCtx.mappings) ||
      (value === null && activeCtx.mappings[curie] &&
      activeCtx.mappings[curie]['@id'] === iri));

    // select curie if it is shorter or the same length but lexicographically
    // less than the current choice
    if(isUsableCurie && (choice === null ||
      _compareShortestLeast(curie, choice) < 0)) {
      choice = curie;
    }
  }

  // return chosen curie
  if(choice !== null) {
    return choice;
  }

  // compact IRI relative to base
  if(!relativeTo.vocab) {
    return _removeBase(activeCtx['@base'], iri);
  }

  // return IRI as is
  return iri;
}

/**
 * Performs value compaction on an object with '@value' or '@id' as the only
 * property.
 *
 * @param activeCtx the active context.
 * @param activeProperty the active property that points to the value.
 * @param value the value to compact.
 *
 * @return the compaction result.
 */
function _compactValue(activeCtx, activeProperty, value) {
  // value is a @value
  if(_isValue(value)) {
    // get context rules
    var type = jsonld.getContextValue(activeCtx, activeProperty, '@type');
    var language = jsonld.getContextValue(
      activeCtx, activeProperty, '@language');
    var container = jsonld.getContextValue(
      activeCtx, activeProperty, '@container');

    // whether or not the value has an @index that must be preserved
    var preserveIndex = (('@index' in value) &&
      container !== '@index');

    // if there's no @index to preserve ...
    if(!preserveIndex) {
      // matching @type or @language specified in context, compact value
      if(value['@type'] === type || value['@language'] === language) {
        return value['@value'];
      }
    }

    // return just the value of @value if all are true:
    // 1. @value is the only key or @index isn't being preserved
    // 2. there is no default language or @value is not a string or
    //   the key has a mapping with a null @language
    var keyCount = Object.keys(value).length;
    var isValueOnlyKey = (keyCount === 1 ||
      (keyCount === 2 && ('@index' in value) && !preserveIndex));
    var hasDefaultLanguage = ('@language' in activeCtx);
    var isValueString = _isString(value['@value']);
    var hasNullMapping = (activeCtx.mappings[activeProperty] &&
      activeCtx.mappings[activeProperty]['@language'] === null);
    if(isValueOnlyKey &&
      (!hasDefaultLanguage || !isValueString || hasNullMapping)) {
      return value['@value'];
    }

    var rval = {};

    // preserve @index
    if(preserveIndex) {
      rval[_compactIri(activeCtx, '@index')] = value['@index'];
    }

    if('@type' in value) {
      // compact @type IRI
      rval[_compactIri(activeCtx, '@type')] = _compactIri(
        activeCtx, value['@type'], null, {vocab: true});
    } else if('@language' in value) {
      // alias @language
      rval[_compactIri(activeCtx, '@language')] = value['@language'];
    }

    // alias @value
    rval[_compactIri(activeCtx, '@value')] = value['@value'];

    return rval;
  }

  // value is a subject reference
  var expandedProperty = _expandIri(activeCtx, activeProperty, {vocab: true});
  var type = jsonld.getContextValue(activeCtx, activeProperty, '@type');
  var compacted = _compactIri(
    activeCtx, value['@id'], null, {vocab: type === '@vocab'});

  // compact to scalar
  if(type === '@id' || type === '@vocab' || expandedProperty === '@graph') {
    return compacted;
  }

  var rval = {};
  rval[_compactIri(activeCtx, '@id')] = compacted;
  return rval;
}

/**
 * Creates a term definition during context processing.
 *
 * @param activeCtx the current active context.
 * @param localCtx the local context being processed.
 * @param term the term in the local context to define the mapping for.
 * @param defined a map of defining/defined keys to detect cycles and prevent
 *          double definitions.
 */
function _createTermDefinition(activeCtx, localCtx, term, defined) {
  if(term in defined) {
    // term already defined
    if(defined[term]) {
      return;
    }
    // cycle detected
    throw new JsonLdError(
      'Cyclical context definition detected.',
      'jsonld.CyclicalContext',
      {code: 'cyclic IRI mapping', context: localCtx, term: term});
  }

  // now defining term
  defined[term] = false;

  if(_isKeyword(term)) {
    throw new JsonLdError(
      'Invalid JSON-LD syntax; keywords cannot be overridden.',
      'jsonld.SyntaxError',
      {code: 'keyword redefinition', context: localCtx, term: term});
  }

  if(term === '') {
    throw new JsonLdError(
      'Invalid JSON-LD syntax; a term cannot be an empty string.',
      'jsonld.SyntaxError',
      {code: 'invalid term definition', context: localCtx});
  }

  // remove old mapping
  if(activeCtx.mappings[term]) {
    delete activeCtx.mappings[term];
  }

  // get context term value
  var value = localCtx[term];

  // clear context entry
  if(value === null || (_isObject(value) && value['@id'] === null)) {
    activeCtx.mappings[term] = null;
    defined[term] = true;
    return;
  }

  // convert short-hand value to object w/@id
  if(_isString(value)) {
    value = {'@id': value};
  }

  if(!_isObject(value)) {
    throw new JsonLdError(
      'Invalid JSON-LD syntax; @context property values must be ' +
      'strings or objects.',
      'jsonld.SyntaxError',
      {code: 'invalid term definition', context: localCtx});
  }

  // create new mapping
  var mapping = activeCtx.mappings[term] = {};
  mapping.reverse = false;

  if('@reverse' in value) {
    if('@id' in value) {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; a @reverse term definition must not ' +
        'contain @id.', 'jsonld.SyntaxError',
        {code: 'invalid reverse property', context: localCtx});
    }
    var reverse = value['@reverse'];
    if(!_isString(reverse)) {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; a @context @reverse value must be a string.',
        'jsonld.SyntaxError', {code: 'invalid IRI mapping', context: localCtx});
    }

    // expand and add @id mapping
    var id = _expandIri(
      activeCtx, reverse, {vocab: true, base: false}, localCtx, defined);
    if(!_isAbsoluteIri(id)) {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; a @context @reverse value must be an ' +
        'absolute IRI or a blank node identifier.',
        'jsonld.SyntaxError', {code: 'invalid IRI mapping', context: localCtx});
    }
    mapping['@id'] = id;
    mapping.reverse = true;
  } else if('@id' in value) {
    var id = value['@id'];
    if(!_isString(id)) {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; a @context @id value must be an array ' +
        'of strings or a string.',
        'jsonld.SyntaxError', {code: 'invalid IRI mapping', context: localCtx});
    }
    if(id !== term) {
      // expand and add @id mapping
      id = _expandIri(
        activeCtx, id, {vocab: true, base: false}, localCtx, defined);
      if(!_isAbsoluteIri(id) && !_isKeyword(id)) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; a @context @id value must be an ' +
          'absolute IRI, a blank node identifier, or a keyword.',
          'jsonld.SyntaxError',
          {code: 'invalid IRI mapping', context: localCtx});
      }
      mapping['@id'] = id;
    }
  }

  if(!('@id' in mapping)) {
    // see if the term has a prefix
    var colon = term.indexOf(':');
    if(colon !== -1) {
      var prefix = term.substr(0, colon);
      if(prefix in localCtx) {
        // define parent prefix
        _createTermDefinition(activeCtx, localCtx, prefix, defined);
      }

      if(activeCtx.mappings[prefix]) {
        // set @id based on prefix parent
        var suffix = term.substr(colon + 1);
        mapping['@id'] = activeCtx.mappings[prefix]['@id'] + suffix;
      } else {
        // term is an absolute IRI
        mapping['@id'] = term;
      }
    } else {
      // non-IRIs *must* define @ids if @vocab is not available
      if(!('@vocab' in activeCtx)) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; @context terms must define an @id.',
          'jsonld.SyntaxError',
          {code: 'invalid IRI mapping', context: localCtx, term: term});
      }
      // prepend vocab to term
      mapping['@id'] = activeCtx['@vocab'] + term;
    }
  }

  // IRI mapping now defined
  defined[term] = true;

  if('@type' in value) {
    var type = value['@type'];
    if(!_isString(type)) {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; an @context @type values must be a string.',
        'jsonld.SyntaxError',
        {code: 'invalid type mapping', context: localCtx});
    }

    if(type !== '@id' && type !== '@vocab') {
      // expand @type to full IRI
      type = _expandIri(
        activeCtx, type, {vocab: true, base: false}, localCtx, defined);
      if(!_isAbsoluteIri(type)) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; an @context @type value must be an ' +
          'absolute IRI.',
          'jsonld.SyntaxError',
          {code: 'invalid type mapping', context: localCtx});
      }
      if(type.indexOf('_:') === 0) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; an @context @type values must be an IRI, ' +
          'not a blank node identifier.',
          'jsonld.SyntaxError',
          {code: 'invalid type mapping', context: localCtx});
      }
    }

    // add @type to mapping
    mapping['@type'] = type;
  }

  if('@container' in value) {
    var container = value['@container'];
    if(container !== '@list' && container !== '@set' &&
      container !== '@index' && container !== '@language') {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; @context @container value must be ' +
        'one of the following: @list, @set, @index, or @language.',
        'jsonld.SyntaxError',
        {code: 'invalid container mapping', context: localCtx});
    }
    if(mapping.reverse && container !== '@index' && container !== '@set' &&
      container !== null) {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; @context @container value for a @reverse ' +
        'type definition must be @index or @set.', 'jsonld.SyntaxError',
        {code: 'invalid reverse property', context: localCtx});
    }

    // add @container to mapping
    mapping['@container'] = container;
  }

  if('@language' in value && !('@type' in value)) {
    var language = value['@language'];
    if(language !== null && !_isString(language)) {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; @context @language value must be ' +
        'a string or null.', 'jsonld.SyntaxError',
        {code: 'invalid language mapping', context: localCtx});
    }

    // add @language to mapping
    if(language !== null) {
      language = language.toLowerCase();
    }
    mapping['@language'] = language;
  }

  // disallow aliasing @context and @preserve
  var id = mapping['@id'];
  if(id === '@context' || id === '@preserve') {
    throw new JsonLdError(
      'Invalid JSON-LD syntax; @context and @preserve cannot be aliased.',
      'jsonld.SyntaxError', {code: 'invalid keyword alias', context: localCtx});
  }
}

/**
 * Expands a string to a full IRI. The string may be a term, a prefix, a
 * relative IRI, or an absolute IRI. The associated absolute IRI will be
 * returned.
 *
 * @param activeCtx the current active context.
 * @param value the string to expand.
 * @param relativeTo options for how to resolve relative IRIs:
 *          base: true to resolve against the base IRI, false not to.
 *          vocab: true to concatenate after @vocab, false not to.
 * @param localCtx the local context being processed (only given if called
 *          during context processing).
 * @param defined a map for tracking cycles in context definitions (only given
 *          if called during context processing).
 *
 * @return the expanded value.
 */
function _expandIri(activeCtx, value, relativeTo, localCtx, defined) {
  // already expanded
  if(value === null || _isKeyword(value)) {
    return value;
  }

  // ensure value is interpreted as a string
  value = String(value);

  // define term dependency if not defined
  if(localCtx && value in localCtx && defined[value] !== true) {
    _createTermDefinition(activeCtx, localCtx, value, defined);
  }

  relativeTo = relativeTo || {};
  if(relativeTo.vocab) {
    var mapping = activeCtx.mappings[value];

    // value is explicitly ignored with a null mapping
    if(mapping === null) {
      return null;
    }

    if(mapping) {
      // value is a term
      return mapping['@id'];
    }
  }

  // split value into prefix:suffix
  var colon = value.indexOf(':');
  if(colon !== -1) {
    var prefix = value.substr(0, colon);
    var suffix = value.substr(colon + 1);

    // do not expand blank nodes (prefix of '_') or already-absolute
    // IRIs (suffix of '//')
    if(prefix === '_' || suffix.indexOf('//') === 0) {
      return value;
    }

    // prefix dependency not defined, define it
    if(localCtx && prefix in localCtx) {
      _createTermDefinition(activeCtx, localCtx, prefix, defined);
    }

    // use mapping if prefix is defined
    var mapping = activeCtx.mappings[prefix];
    if(mapping) {
      return mapping['@id'] + suffix;
    }

    // already absolute IRI
    return value;
  }

  // prepend vocab
  if(relativeTo.vocab && '@vocab' in activeCtx) {
    return activeCtx['@vocab'] + value;
  }

  // prepend base
  var rval = value;
  if(relativeTo.base) {
    rval = _prependBase(activeCtx['@base'], rval);
  }

  return rval;
}

/**
 * Prepends a base IRI to the given relative IRI.
 *
 * @param base the base IRI.
 * @param iri the relative IRI.
 *
 * @return the absolute IRI.
 */
function _prependBase(base, iri) {
  // skip IRI processing
  if(base === null) {
    return iri;
  }
  // already an absolute IRI
  if(iri.indexOf(':') !== -1) {
    return iri;
  }

  // parse base if it is a string
  if(_isString(base)) {
    base = jsonld.url.parse(base || '');
  }

  // parse given IRI
  var rel = jsonld.url.parse(iri);

  // per RFC3986 5.2.2
  var transform = {
    protocol: base.protocol || ''
  };

  if(rel.authority !== null) {
    transform.authority = rel.authority;
    transform.path = rel.path;
    transform.query = rel.query;
  } else {
    transform.authority = base.authority;

    if(rel.path === '') {
      transform.path = base.path;
      if(rel.query !== null) {
        transform.query = rel.query;
      } else {
        transform.query = base.query;
      }
    } else {
      if(rel.path.indexOf('/') === 0) {
        // IRI represents an absolute path
        transform.path = rel.path;
      } else {
        // merge paths
        var path = base.path;

        // append relative path to the end of the last directory from base
        if(rel.path !== '') {
          path = path.substr(0, path.lastIndexOf('/') + 1);
          if(path.length > 0 && path.substr(-1) !== '/') {
            path += '/';
          }
          path += rel.path;
        }

        transform.path = path;
      }
      transform.query = rel.query;
    }
  }

  // remove slashes and dots in path
  transform.path = _removeDotSegments(transform.path, !!transform.authority);

  // construct URL
  var rval = transform.protocol;
  if(transform.authority !== null) {
    rval += '//' + transform.authority;
  }
  rval += transform.path;
  if(transform.query !== null) {
    rval += '?' + transform.query;
  }
  if(rel.fragment !== null) {
    rval += '#' + rel.fragment;
  }

  // handle empty base
  if(rval === '') {
    rval = './';
  }

  return rval;
}

/**
 * Removes a base IRI from the given absolute IRI.
 *
 * @param base the base IRI.
 * @param iri the absolute IRI.
 *
 * @return the relative IRI if relative to base, otherwise the absolute IRI.
 */
function _removeBase(base, iri) {
  // skip IRI processing
  if(base === null) {
    return iri;
  }

  if(_isString(base)) {
    base = jsonld.url.parse(base || '');
  }

  // establish base root
  var root = '';
  if(base.href !== '') {
    root += (base.protocol || '') + '//' + (base.authority || '');
  } else if(iri.indexOf('//')) {
    // support network-path reference with empty base
    root += '//';
  }

  // IRI not relative to base
  if(iri.indexOf(root) !== 0) {
    return iri;
  }

  // remove root from IRI and parse remainder
  var rel = jsonld.url.parse(iri.substr(root.length));

  // remove path segments that match (do not remove last segment unless there
  // is a hash or query)
  var baseSegments = base.normalizedPath.split('/');
  var iriSegments = rel.normalizedPath.split('/');
  var last = (rel.fragment || rel.query) ? 0 : 1;
  while(baseSegments.length > 0 && iriSegments.length > last) {
    if(baseSegments[0] !== iriSegments[0]) {
      break;
    }
    baseSegments.shift();
    iriSegments.shift();
  }

  // use '../' for each non-matching base segment
  var rval = '';
  if(baseSegments.length > 0) {
    // don't count the last segment (if it ends with '/' last path doesn't
    // count and if it doesn't end with '/' it isn't a path)
    baseSegments.pop();
    for(var i = 0; i < baseSegments.length; ++i) {
      rval += '../';
    }
  }

  // prepend remaining segments
  rval += iriSegments.join('/');

  // add query and hash
  if(rel.query !== null) {
    rval += '?' + rel.query;
  }
  if(rel.fragment !== null) {
    rval += '#' + rel.fragment;
  }

  // handle empty base
  if(rval === '') {
    rval = './';
  }

  return rval;
}

/**
 * Gets the initial context.
 *
 * @param options the options to use:
 *          [base] the document base IRI.
 *
 * @return the initial context.
 */
function _getInitialContext(options) {
  var base = jsonld.url.parse(options.base || '');
  return {
    '@base': base,
    mappings: {},
    inverse: null,
    getInverse: _createInverseContext,
    clone: _cloneActiveContext
  };

  /**
   * Generates an inverse context for use in the compaction algorithm, if
   * not already generated for the given active context.
   *
   * @return the inverse context.
   */
  function _createInverseContext() {
    var activeCtx = this;

    // lazily create inverse
    if(activeCtx.inverse) {
      return activeCtx.inverse;
    }
    var inverse = activeCtx.inverse = {};

    // handle default language
    var defaultLanguage = activeCtx['@language'] || '@none';

    // create term selections for each mapping in the context, ordered by
    // shortest and then lexicographically least
    var mappings = activeCtx.mappings;
    var terms = Object.keys(mappings).sort(_compareShortestLeast);
    for(var i = 0; i < terms.length; ++i) {
      var term = terms[i];
      var mapping = mappings[term];
      if(mapping === null) {
        continue;
      }

      var container = mapping['@container'] || '@none';

      // iterate over every IRI in the mapping
      var ids = mapping['@id'];
      if(!_isArray(ids)) {
        ids = [ids];
      }
      for(var ii = 0; ii < ids.length; ++ii) {
        var iri = ids[ii];
        var entry = inverse[iri];

        // initialize entry
        if(!entry) {
          inverse[iri] = entry = {};
        }

        // add new entry
        if(!entry[container]) {
          entry[container] = {
            '@language': {},
            '@type': {}
          };
        }
        entry = entry[container];

        if(mapping.reverse) {
          // term is preferred for values using @reverse
          _addPreferredTerm(mapping, term, entry['@type'], '@reverse');
        } else if('@type' in mapping) {
          // term is preferred for values using specific type
          _addPreferredTerm(mapping, term, entry['@type'], mapping['@type']);
        } else if('@language' in mapping) {
          // term is preferred for values using specific language
          var language = mapping['@language'] || '@null';
          _addPreferredTerm(mapping, term, entry['@language'], language);
        } else {
          // term is preferred for values w/default language or no type and
          // no language
          // add an entry for the default language
          _addPreferredTerm(mapping, term, entry['@language'], defaultLanguage);

          // add entries for no type and no language
          _addPreferredTerm(mapping, term, entry['@type'], '@none');
          _addPreferredTerm(mapping, term, entry['@language'], '@none');
        }
      }
    }

    return inverse;
  }

  /**
   * Adds the term for the given entry if not already added.
   *
   * @param mapping the term mapping.
   * @param term the term to add.
   * @param entry the inverse context typeOrLanguage entry to add to.
   * @param typeOrLanguageValue the key in the entry to add to.
   */
  function _addPreferredTerm(mapping, term, entry, typeOrLanguageValue) {
    if(!(typeOrLanguageValue in entry)) {
      entry[typeOrLanguageValue] = term;
    }
  }

  /**
   * Clones an active context, creating a child active context.
   *
   * @return a clone (child) of the active context.
   */
  function _cloneActiveContext() {
    var child = {};
    child['@base'] = this['@base'];
    child.mappings = _clone(this.mappings);
    child.clone = this.clone;
    child.inverse = null;
    child.getInverse = this.getInverse;
    if('@language' in this) {
      child['@language'] = this['@language'];
    }
    if('@vocab' in this) {
      child['@vocab'] = this['@vocab'];
    }
    return child;
  }
}

/**
 * Returns whether or not the given value is a keyword.
 *
 * @param v the value to check.
 *
 * @return true if the value is a keyword, false if not.
 */
function _isKeyword(v) {
  if(!_isString(v)) {
    return false;
  }
  switch(v) {
  case '@base':
  case '@context':
  case '@container':
  case '@default':
  case '@embed':
  case '@explicit':
  case '@graph':
  case '@id':
  case '@index':
  case '@language':
  case '@list':
  case '@omitDefault':
  case '@preserve':
  case '@requireAll':
  case '@reverse':
  case '@set':
  case '@type':
  case '@value':
  case '@vocab':
    return true;
  }
  return false;
}

/**
 * Returns true if the given value is an Object.
 *
 * @param v the value to check.
 *
 * @return true if the value is an Object, false if not.
 */
function _isObject(v) {
  return (Object.prototype.toString.call(v) === '[object Object]');
}

/**
 * Returns true if the given value is an empty Object.
 *
 * @param v the value to check.
 *
 * @return true if the value is an empty Object, false if not.
 */
function _isEmptyObject(v) {
  return _isObject(v) && Object.keys(v).length === 0;
}

/**
 * Returns true if the given value is an Array.
 *
 * @param v the value to check.
 *
 * @return true if the value is an Array, false if not.
 */
function _isArray(v) {
  return Array.isArray(v);
}

/**
 * Throws an exception if the given value is not a valid @type value.
 *
 * @param v the value to check.
 */
function _validateTypeValue(v) {
  // can be a string or an empty object
  if(_isString(v) || _isEmptyObject(v)) {
    return;
  }

  // must be an array
  var isValid = false;
  if(_isArray(v)) {
    // must contain only strings
    isValid = true;
    for(var i = 0; i < v.length; ++i) {
      if(!(_isString(v[i]))) {
        isValid = false;
        break;
      }
    }
  }

  if(!isValid) {
    throw new JsonLdError(
      'Invalid JSON-LD syntax; "@type" value must a string, an array of ' +
      'strings, or an empty object.', 'jsonld.SyntaxError',
      {code: 'invalid type value', value: v});
  }
}

/**
 * Returns true if the given value is a String.
 *
 * @param v the value to check.
 *
 * @return true if the value is a String, false if not.
 */
function _isString(v) {
  return (typeof v === 'string' ||
    Object.prototype.toString.call(v) === '[object String]');
}

/**
 * Returns true if the given value is a Number.
 *
 * @param v the value to check.
 *
 * @return true if the value is a Number, false if not.
 */
function _isNumber(v) {
  return (typeof v === 'number' ||
    Object.prototype.toString.call(v) === '[object Number]');
}

/**
 * Returns true if the given value is a double.
 *
 * @param v the value to check.
 *
 * @return true if the value is a double, false if not.
 */
function _isDouble(v) {
  return _isNumber(v) && String(v).indexOf('.') !== -1;
}

/**
 * Returns true if the given value is numeric.
 *
 * @param v the value to check.
 *
 * @return true if the value is numeric, false if not.
 */
function _isNumeric(v) {
  return !isNaN(parseFloat(v)) && isFinite(v);
}

/**
 * Returns true if the given value is a Boolean.
 *
 * @param v the value to check.
 *
 * @return true if the value is a Boolean, false if not.
 */
function _isBoolean(v) {
  return (typeof v === 'boolean' ||
    Object.prototype.toString.call(v) === '[object Boolean]');
}

/**
 * Returns true if the given value is undefined.
 *
 * @param v the value to check.
 *
 * @return true if the value is undefined, false if not.
 */
function _isUndefined(v) {
  return (typeof v === 'undefined');
}

/**
 * Returns true if the given value is a subject with properties.
 *
 * @param v the value to check.
 *
 * @return true if the value is a subject with properties, false if not.
 */
function _isSubject(v) {
  // Note: A value is a subject if all of these hold true:
  // 1. It is an Object.
  // 2. It is not a @value, @set, or @list.
  // 3. It has more than 1 key OR any existing key is not @id.
  var rval = false;
  if(_isObject(v) &&
    !(('@value' in v) || ('@set' in v) || ('@list' in v))) {
    var keyCount = Object.keys(v).length;
    rval = (keyCount > 1 || !('@id' in v));
  }
  return rval;
}

/**
 * Returns true if the given value is a subject reference.
 *
 * @param v the value to check.
 *
 * @return true if the value is a subject reference, false if not.
 */
function _isSubjectReference(v) {
  // Note: A value is a subject reference if all of these hold true:
  // 1. It is an Object.
  // 2. It has a single key: @id.
  return (_isObject(v) && Object.keys(v).length === 1 && ('@id' in v));
}

/**
 * Returns true if the given value is a @value.
 *
 * @param v the value to check.
 *
 * @return true if the value is a @value, false if not.
 */
function _isValue(v) {
  // Note: A value is a @value if all of these hold true:
  // 1. It is an Object.
  // 2. It has the @value property.
  return _isObject(v) && ('@value' in v);
}

/**
 * Returns true if the given value is a @list.
 *
 * @param v the value to check.
 *
 * @return true if the value is a @list, false if not.
 */
function _isList(v) {
  // Note: A value is a @list if all of these hold true:
  // 1. It is an Object.
  // 2. It has the @list property.
  return _isObject(v) && ('@list' in v);
}

/**
 * Returns true if the given value is a blank node.
 *
 * @param v the value to check.
 *
 * @return true if the value is a blank node, false if not.
 */
function _isBlankNode(v) {
  // Note: A value is a blank node if all of these hold true:
  // 1. It is an Object.
  // 2. If it has an @id key its value begins with '_:'.
  // 3. It has no keys OR is not a @value, @set, or @list.
  var rval = false;
  if(_isObject(v)) {
    if('@id' in v) {
      rval = (v['@id'].indexOf('_:') === 0);
    } else {
      rval = (Object.keys(v).length === 0 ||
        !(('@value' in v) || ('@set' in v) || ('@list' in v)));
    }
  }
  return rval;
}

/**
 * Returns true if the given value is an absolute IRI, false if not.
 *
 * @param v the value to check.
 *
 * @return true if the value is an absolute IRI, false if not.
 */
function _isAbsoluteIri(v) {
  return _isString(v) && v.indexOf(':') !== -1;
}

/**
 * Clones an object, array, or string/number. If a typed JavaScript object
 * is given, such as a Date, it will be converted to a string.
 *
 * @param value the value to clone.
 *
 * @return the cloned value.
 */
function _clone(value) {
  if(value && typeof value === 'object') {
    var rval;
    if(_isArray(value)) {
      rval = [];
      for(var i = 0; i < value.length; ++i) {
        rval[i] = _clone(value[i]);
      }
    } else if(_isObject(value)) {
      rval = {};
      for(var key in value) {
        rval[key] = _clone(value[key]);
      }
    } else {
      rval = value.toString();
    }
    return rval;
  }
  return value;
}

/**
 * Finds all @context URLs in the given JSON-LD input.
 *
 * @param input the JSON-LD input.
 * @param urls a map of URLs (url => false/@contexts).
 * @param replace true to replace the URLs in the given input with the
 *           @contexts from the urls map, false not to.
 * @param base the base IRI to use to resolve relative IRIs.
 *
 * @return true if new URLs to retrieve were found, false if not.
 */
function _findContextUrls(input, urls, replace, base) {
  var count = Object.keys(urls).length;
  if(_isArray(input)) {
    for(var i = 0; i < input.length; ++i) {
      _findContextUrls(input[i], urls, replace, base);
    }
    return (count < Object.keys(urls).length);
  } else if(_isObject(input)) {
    for(var key in input) {
      if(key !== '@context') {
        _findContextUrls(input[key], urls, replace, base);
        continue;
      }

      // get @context
      var ctx = input[key];

      // array @context
      if(_isArray(ctx)) {
        var length = ctx.length;
        for(var i = 0; i < length; ++i) {
          var _ctx = ctx[i];
          if(_isString(_ctx)) {
            _ctx = _prependBase(base, _ctx);
            // replace w/@context if requested
            if(replace) {
              _ctx = urls[_ctx];
              if(_isArray(_ctx)) {
                // add flattened context
                Array.prototype.splice.apply(ctx, [i, 1].concat(_ctx));
                i += _ctx.length - 1;
                length = ctx.length;
              } else {
                ctx[i] = _ctx;
              }
            } else if(!(_ctx in urls)) {
              // @context URL found
              urls[_ctx] = false;
            }
          }
        }
      } else if(_isString(ctx)) {
        // string @context
        ctx = _prependBase(base, ctx);
        // replace w/@context if requested
        if(replace) {
          input[key] = urls[ctx];
        } else if(!(ctx in urls)) {
          // @context URL found
          urls[ctx] = false;
        }
      }
    }
    return (count < Object.keys(urls).length);
  }
  return false;
}

/**
 * Retrieves external @context URLs using the given document loader. Every
 * instance of @context in the input that refers to a URL will be replaced
 * with the JSON @context found at that URL.
 *
 * @param input the JSON-LD input with possible contexts.
 * @param options the options to use:
 *          documentLoader(url, callback(err, remoteDoc)) the document loader.
 * @param callback(err, input) called once the operation completes.
 */
function _retrieveContextUrls(input, options, callback) {
  // if any error occurs during URL resolution, quit
  var error = null;

  // recursive document loader
  var documentLoader = options.documentLoader;
  var retrieve = function(input, cycles, documentLoader, base, callback) {
    if(Object.keys(cycles).length > MAX_CONTEXT_URLS) {
      error = new JsonLdError(
        'Maximum number of @context URLs exceeded.',
        'jsonld.ContextUrlError',
        {code: 'loading remote context failed', max: MAX_CONTEXT_URLS});
      return callback(error);
    }

    // for tracking the URLs to retrieve
    var urls = {};

    // finished will be called once the URL queue is empty
    var finished = function() {
      // replace all URLs in the input
      _findContextUrls(input, urls, true, base);
      callback(null, input);
    };

    // find all URLs in the given input
    if(!_findContextUrls(input, urls, false, base)) {
      // no new URLs in input
      finished();
    }

    // queue all unretrieved URLs
    var queue = [];
    for(var url in urls) {
      if(urls[url] === false) {
        queue.push(url);
      }
    }

    // retrieve URLs in queue
    var count = queue.length;
    for(var i = 0; i < queue.length; ++i) {
      (function(url) {
        // check for context URL cycle
        if(url in cycles) {
          error = new JsonLdError(
            'Cyclical @context URLs detected.',
            'jsonld.ContextUrlError',
            {code: 'recursive context inclusion', url: url});
          return callback(error);
        }
        var _cycles = _clone(cycles);
        _cycles[url] = true;
        var done = function(err, remoteDoc) {
          // short-circuit if there was an error with another URL
          if(error) {
            return;
          }

          var ctx = remoteDoc ? remoteDoc.document : null;

          // parse string context as JSON
          if(!err && _isString(ctx)) {
            try {
              ctx = JSON.parse(ctx);
            } catch(ex) {
              err = ex;
            }
          }

          // ensure ctx is an object
          if(err) {
            err = new JsonLdError(
              'Dereferencing a URL did not result in a valid JSON-LD object. ' +
              'Possible causes are an inaccessible URL perhaps due to ' +
              'a same-origin policy (ensure the server uses CORS if you are ' +
              'using client-side JavaScript), too many redirects, a ' +
              'non-JSON response, or more than one HTTP Link Header was ' +
              'provided for a remote context.',
              'jsonld.InvalidUrl',
              {code: 'loading remote context failed', url: url, cause: err});
          } else if(!_isObject(ctx)) {
            err = new JsonLdError(
              'Dereferencing a URL did not result in a JSON object. The ' +
              'response was valid JSON, but it was not a JSON object.',
              'jsonld.InvalidUrl',
              {code: 'invalid remote context', url: url, cause: err});
          }
          if(err) {
            error = err;
            return callback(error);
          }

          // use empty context if no @context key is present
          if(!('@context' in ctx)) {
            ctx = {'@context': {}};
          } else {
            ctx = {'@context': ctx['@context']};
          }

          // append context URL to context if given
          if(remoteDoc.contextUrl) {
            if(!_isArray(ctx['@context'])) {
              ctx['@context'] = [ctx['@context']];
            }
            ctx['@context'].push(remoteDoc.contextUrl);
          }

          // recurse
          retrieve(ctx, _cycles, documentLoader, url, function(err, ctx) {
            if(err) {
              return callback(err);
            }
            urls[url] = ctx['@context'];
            count -= 1;
            if(count === 0) {
              finished();
            }
          });
        };
        var promise = documentLoader(url, done);
        if(promise && 'then' in promise) {
          promise.then(done.bind(null, null), done);
        }
      }(queue[i]));
    }
  };
  retrieve(input, {}, documentLoader, options.base, callback);
}

// define js 1.8.5 Object.keys method if not present
if(!Object.keys) {
  Object.keys = function(o) {
    if(o !== Object(o)) {
      throw new TypeError('Object.keys called on non-object');
    }
    var rval = [];
    for(var p in o) {
      if(Object.prototype.hasOwnProperty.call(o, p)) {
        rval.push(p);
      }
    }
    return rval;
  };
}

/**
 * Parses RDF in the form of N-Quads.
 *
 * @param input the N-Quads input to parse.
 *
 * @return an RDF dataset.
 */
function _parseNQuads(input) {
  // define partial regexes
  var iri = '(?:<([^:]+:[^>]*)>)';
  var bnode = '(_:(?:[A-Za-z0-9]+))';
  var plain = '"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"';
  var datatype = '(?:\\^\\^' + iri + ')';
  var language = '(?:@([a-z]+(?:-[a-z0-9]+)*))';
  var literal = '(?:' + plain + '(?:' + datatype + '|' + language + ')?)';
  var ws = '[ \\t]+';
  var wso = '[ \\t]*';
  var eoln = /(?:\r\n)|(?:\n)|(?:\r)/g;
  var empty = new RegExp('^' + wso + '$');

  // define quad part regexes
  var subject = '(?:' + iri + '|' + bnode + ')' + ws;
  var property = iri + ws;
  var object = '(?:' + iri + '|' + bnode + '|' + literal + ')' + wso;
  var graphName = '(?:\\.|(?:(?:' + iri + '|' + bnode + ')' + wso + '\\.))';

  // full quad regex
  var quad = new RegExp(
    '^' + wso + subject + property + object + graphName + wso + '$');

  // build RDF dataset
  var dataset = {};

  // split N-Quad input into lines
  var lines = input.split(eoln);
  var lineNumber = 0;
  for(var li = 0; li < lines.length; ++li) {
    var line = lines[li];
    lineNumber++;

    // skip empty lines
    if(empty.test(line)) {
      continue;
    }

    // parse quad
    var match = line.match(quad);
    if(match === null) {
      throw new JsonLdError(
        'Error while parsing N-Quads; invalid quad.',
        'jsonld.ParseError', {line: lineNumber});
    }

    // create RDF triple
    var triple = {};

    // get subject
    if(!_isUndefined(match[1])) {
      triple.subject = {type: 'IRI', value: match[1]};
    } else {
      triple.subject = {type: 'blank node', value: match[2]};
    }

    // get predicate
    triple.predicate = {type: 'IRI', value: match[3]};

    // get object
    if(!_isUndefined(match[4])) {
      triple.object = {type: 'IRI', value: match[4]};
    } else if(!_isUndefined(match[5])) {
      triple.object = {type: 'blank node', value: match[5]};
    } else {
      triple.object = {type: 'literal'};
      if(!_isUndefined(match[7])) {
        triple.object.datatype = match[7];
      } else if(!_isUndefined(match[8])) {
        triple.object.datatype = RDF_LANGSTRING;
        triple.object.language = match[8];
      } else {
        triple.object.datatype = XSD_STRING;
      }
      var unescaped = match[6]
        .replace(/\\"/g, '"')
        .replace(/\\t/g, '\t')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\\\/g, '\\');
      triple.object.value = unescaped;
    }

    // get graph name ('@default' is used for the default graph)
    var name = '@default';
    if(!_isUndefined(match[9])) {
      name = match[9];
    } else if(!_isUndefined(match[10])) {
      name = match[10];
    }

    // initialize graph in dataset
    if(!(name in dataset)) {
      dataset[name] = [triple];
    } else {
      // add triple if unique to its graph
      var unique = true;
      var triples = dataset[name];
      for(var ti = 0; unique && ti < triples.length; ++ti) {
        if(_compareRDFTriples(triples[ti], triple)) {
          unique = false;
        }
      }
      if(unique) {
        triples.push(triple);
      }
    }
  }

  return dataset;
}

// register the N-Quads RDF parser
jsonld.registerRDFParser('application/nquads', _parseNQuads);

/**
 * Converts an RDF dataset to N-Quads.
 *
 * @param dataset the RDF dataset to convert.
 *
 * @return the N-Quads string.
 */
function _toNQuads(dataset) {
  var quads = [];
  for(var graphName in dataset) {
    var triples = dataset[graphName];
    for(var ti = 0; ti < triples.length; ++ti) {
      var triple = triples[ti];
      if(graphName === '@default') {
        graphName = null;
      }
      quads.push(_toNQuad(triple, graphName));
    }
  }
  quads.sort();
  return quads.join('');
}

/**
 * Converts an RDF triple and graph name to an N-Quad string (a single quad).
 *
 * @param triple the RDF triple to convert.
 * @param graphName the name of the graph containing the triple, null for
 *          the default graph.
 * @param bnode the bnode the quad is mapped to (optional, for use
 *          during normalization only).
 *
 * @return the N-Quad string.
 */
function _toNQuad(triple, graphName, bnode) {
  var s = triple.subject;
  var p = triple.predicate;
  var o = triple.object;
  var g = graphName;

  var quad = '';

  // subject is an IRI
  if(s.type === 'IRI') {
    quad += '<' + s.value + '>';
  } else if(bnode) {
    // bnode normalization mode
    quad += (s.value === bnode) ? '_:a' : '_:z';
  } else {
    // bnode normal mode
    quad += s.value;
  }
  quad += ' ';

  // predicate is an IRI
  if(p.type === 'IRI') {
    quad += '<' + p.value + '>';
  } else if(bnode) {
    // FIXME: TBD what to do with bnode predicates during normalization
    // bnode normalization mode
    quad += '_:p';
  } else {
    // bnode normal mode
    quad += p.value;
  }
  quad += ' ';

  // object is IRI, bnode, or literal
  if(o.type === 'IRI') {
    quad += '<' + o.value + '>';
  } else if(o.type === 'blank node') {
    // normalization mode
    if(bnode) {
      quad += (o.value === bnode) ? '_:a' : '_:z';
    } else {
      // normal mode
      quad += o.value;
    }
  } else {
    var escaped = o.value
      .replace(/\\/g, '\\\\')
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\"/g, '\\"');
    quad += '"' + escaped + '"';
    if(o.datatype === RDF_LANGSTRING) {
      if(o.language) {
        quad += '@' + o.language;
      }
    } else if(o.datatype !== XSD_STRING) {
      quad += '^^<' + o.datatype + '>';
    }
  }

  // graph
  if(g !== null) {
    if(g.indexOf('_:') !== 0) {
      quad += ' <' + g + '>';
    } else if(bnode) {
      quad += ' _:g';
    } else {
      quad += ' ' + g;
    }
  }

  quad += ' .\n';
  return quad;
}

/**
 * Parses the RDF dataset found via the data object from the RDFa API.
 *
 * @param data the RDFa API data object.
 *
 * @return the RDF dataset.
 */
function _parseRdfaApiData(data) {
  var dataset = {};
  dataset['@default'] = [];

  var subjects = data.getSubjects();
  for(var si = 0; si < subjects.length; ++si) {
    var subject = subjects[si];
    if(subject === null) {
      continue;
    }

    // get all related triples
    var triples = data.getSubjectTriples(subject);
    if(triples === null) {
      continue;
    }
    var predicates = triples.predicates;
    for(var predicate in predicates) {
      // iterate over objects
      var objects = predicates[predicate].objects;
      for(var oi = 0; oi < objects.length; ++oi) {
        var object = objects[oi];

        // create RDF triple
        var triple = {};

        // add subject
        if(subject.indexOf('_:') === 0) {
          triple.subject = {type: 'blank node', value: subject};
        } else {
          triple.subject = {type: 'IRI', value: subject};
        }

        // add predicate
        if(predicate.indexOf('_:') === 0) {
          triple.predicate = {type: 'blank node', value: predicate};
        } else {
          triple.predicate = {type: 'IRI', value: predicate};
        }

        // serialize XML literal
        var value = object.value;
        if(object.type === RDF_XML_LITERAL) {
          // initialize XMLSerializer
          if(!XMLSerializer) {
            _defineXMLSerializer();
          }
          var serializer = new XMLSerializer();
          value = '';
          for(var x = 0; x < object.value.length; x++) {
            if(object.value[x].nodeType === Node.ELEMENT_NODE) {
              value += serializer.serializeToString(object.value[x]);
            } else if(object.value[x].nodeType === Node.TEXT_NODE) {
              value += object.value[x].nodeValue;
            }
          }
        }

        // add object
        triple.object = {};

        // object is an IRI
        if(object.type === RDF_OBJECT) {
          if(object.value.indexOf('_:') === 0) {
            triple.object.type = 'blank node';
          } else {
            triple.object.type = 'IRI';
          }
        } else {
          // object is a literal
          triple.object.type = 'literal';
          if(object.type === RDF_PLAIN_LITERAL) {
            if(object.language) {
              triple.object.datatype = RDF_LANGSTRING;
              triple.object.language = object.language;
            } else {
              triple.object.datatype = XSD_STRING;
            }
          } else {
            triple.object.datatype = object.type;
          }
        }
        triple.object.value = value;

        // add triple to dataset in default graph
        dataset['@default'].push(triple);
      }
    }
  }

  return dataset;
}

// register the RDFa API RDF parser
jsonld.registerRDFParser('rdfa-api', _parseRdfaApiData);

/**
 * Creates a new UniqueNamer. A UniqueNamer issues unique names, keeping
 * track of any previously issued names.
 *
 * @param prefix the prefix to use ('<prefix><counter>').
 */
function UniqueNamer(prefix) {
  this.prefix = prefix;
  this.counter = 0;
  this.existing = {};
}
jsonld.UniqueNamer = UniqueNamer;

/**
 * Copies this UniqueNamer.
 *
 * @return a copy of this UniqueNamer.
 */
UniqueNamer.prototype.clone = function() {
  var copy = new UniqueNamer(this.prefix);
  copy.counter = this.counter;
  copy.existing = _clone(this.existing);
  return copy;
};

/**
 * Gets the new name for the given old name, where if no old name is given
 * a new name will be generated.
 *
 * @param [oldName] the old name to get the new name for.
 *
 * @return the new name.
 */
UniqueNamer.prototype.getName = function(oldName) {
  // return existing old name
  if(oldName && oldName in this.existing) {
    return this.existing[oldName];
  }

  // get next name
  var name = this.prefix + this.counter;
  this.counter += 1;

  // save mapping
  if(oldName) {
    this.existing[oldName] = name;
  }

  return name;
};

/**
 * Returns true if the given oldName has already been assigned a new name.
 *
 * @param oldName the oldName to check.
 *
 * @return true if the oldName has been assigned a new name, false if not.
 */
UniqueNamer.prototype.isNamed = function(oldName) {
  return (oldName in this.existing);
};

/**
 * A Permutator iterates over all possible permutations of the given array
 * of elements.
 *
 * @param list the array of elements to iterate over.
 */
var Permutator = function(list) {
  // original array
  this.list = list.sort();
  // indicates whether there are more permutations
  this.done = false;
  // directional info for permutation algorithm
  this.left = {};
  for(var i = 0; i < list.length; ++i) {
    this.left[list[i]] = true;
  }
};

/**
 * Returns true if there is another permutation.
 *
 * @return true if there is another permutation, false if not.
 */
Permutator.prototype.hasNext = function() {
  return !this.done;
};

/**
 * Gets the next permutation. Call hasNext() to ensure there is another one
 * first.
 *
 * @return the next permutation.
 */
Permutator.prototype.next = function() {
  // copy current permutation
  var rval = this.list.slice();

  /* Calculate the next permutation using the Steinhaus-Johnson-Trotter
   permutation algorithm. */

  // get largest mobile element k
  // (mobile: element is greater than the one it is looking at)
  var k = null;
  var pos = 0;
  var length = this.list.length;
  for(var i = 0; i < length; ++i) {
    var element = this.list[i];
    var left = this.left[element];
    if((k === null || element > k) &&
      ((left && i > 0 && element > this.list[i - 1]) ||
      (!left && i < (length - 1) && element > this.list[i + 1]))) {
      k = element;
      pos = i;
    }
  }

  // no more permutations
  if(k === null) {
    this.done = true;
  } else {
    // swap k and the element it is looking at
    var swap = this.left[k] ? pos - 1 : pos + 1;
    this.list[pos] = this.list[swap];
    this.list[swap] = k;

    // reverse the direction of all elements larger than k
    for(var i = 0; i < length; ++i) {
      if(this.list[i] > k) {
        this.left[this.list[i]] = !this.left[this.list[i]];
      }
    }
  }

  return rval;
};

// SHA-1 API
var sha1 = jsonld.sha1 = {};

if(_nodejs) {
  var crypto = _dereq_('crypto');
  sha1.create = function() {
    var md = crypto.createHash('sha1');
    return {
      update: function(data) {
        md.update(data, 'utf8');
      },
      digest: function() {
        return md.digest('hex');
      }
    };
  };
} else {
  sha1.create = function() {
    return new sha1.MessageDigest();
  };
}

/**
 * Hashes the given array of quads and returns its hexadecimal SHA-1 message
 * digest.
 *
 * @param nquads the list of serialized quads to hash.
 *
 * @return the hexadecimal SHA-1 message digest.
 */
sha1.hash = function(nquads) {
  var md = sha1.create();
  for(var i = 0; i < nquads.length; ++i) {
    md.update(nquads[i]);
  }
  return md.digest();
};

// only define sha1 MessageDigest for non-nodejs
if(!_nodejs) {

/**
 * Creates a simple byte buffer for message digest operations.
 */
sha1.Buffer = function() {
  this.data = '';
  this.read = 0;
};

/**
 * Puts a 32-bit integer into this buffer in big-endian order.
 *
 * @param i the 32-bit integer.
 */
sha1.Buffer.prototype.putInt32 = function(i) {
  this.data += (
    String.fromCharCode(i >> 24 & 0xFF) +
    String.fromCharCode(i >> 16 & 0xFF) +
    String.fromCharCode(i >> 8 & 0xFF) +
    String.fromCharCode(i & 0xFF));
};

/**
 * Gets a 32-bit integer from this buffer in big-endian order and
 * advances the read pointer by 4.
 *
 * @return the word.
 */
sha1.Buffer.prototype.getInt32 = function() {
  var rval = (
    this.data.charCodeAt(this.read) << 24 ^
    this.data.charCodeAt(this.read + 1) << 16 ^
    this.data.charCodeAt(this.read + 2) << 8 ^
    this.data.charCodeAt(this.read + 3));
  this.read += 4;
  return rval;
};

/**
 * Gets the bytes in this buffer.
 *
 * @return a string full of UTF-8 encoded characters.
 */
sha1.Buffer.prototype.bytes = function() {
  return this.data.slice(this.read);
};

/**
 * Gets the number of bytes in this buffer.
 *
 * @return the number of bytes in this buffer.
 */
sha1.Buffer.prototype.length = function() {
  return this.data.length - this.read;
};

/**
 * Compacts this buffer.
 */
sha1.Buffer.prototype.compact = function() {
  this.data = this.data.slice(this.read);
  this.read = 0;
};

/**
 * Converts this buffer to a hexadecimal string.
 *
 * @return a hexadecimal string.
 */
sha1.Buffer.prototype.toHex = function() {
  var rval = '';
  for(var i = this.read; i < this.data.length; ++i) {
    var b = this.data.charCodeAt(i);
    if(b < 16) {
      rval += '0';
    }
    rval += b.toString(16);
  }
  return rval;
};

/**
 * Creates a SHA-1 message digest object.
 *
 * @return a message digest object.
 */
sha1.MessageDigest = function() {
  // do initialization as necessary
  if(!_sha1.initialized) {
    _sha1.init();
  }

  this.blockLength = 64;
  this.digestLength = 20;
  // length of message so far (does not including padding)
  this.messageLength = 0;

  // input buffer
  this.input = new sha1.Buffer();

  // for storing words in the SHA-1 algorithm
  this.words = new Array(80);

  // SHA-1 state contains five 32-bit integers
  this.state = {
    h0: 0x67452301,
    h1: 0xEFCDAB89,
    h2: 0x98BADCFE,
    h3: 0x10325476,
    h4: 0xC3D2E1F0
  };
};

/**
 * Updates the digest with the given string input.
 *
 * @param msg the message input to update with.
 */
sha1.MessageDigest.prototype.update = function(msg) {
  // UTF-8 encode message
  msg = unescape(encodeURIComponent(msg));

  // update message length and input buffer
  this.messageLength += msg.length;
  this.input.data += msg;

  // process input
  _sha1.update(this.state, this.words, this.input);

  // compact input buffer every 2K or if empty
  if(this.input.read > 2048 || this.input.length() === 0) {
    this.input.compact();
  }
};

/**
 * Produces the digest.
 *
 * @return the digest as a hexadecimal string.
 */
sha1.MessageDigest.prototype.digest = function() {
  /* Determine the number of bytes that must be added to the message
  to ensure its length is congruent to 448 mod 512. In other words,
  a 64-bit integer that gives the length of the message will be
  appended to the message and whatever the length of the message is
  plus 64 bits must be a multiple of 512. So the length of the
  message must be congruent to 448 mod 512 because 512 - 64 = 448.

  In order to fill up the message length it must be filled with
  padding that begins with 1 bit followed by all 0 bits. Padding
  must *always* be present, so if the message length is already
  congruent to 448 mod 512, then 512 padding bits must be added. */

  // 512 bits == 64 bytes, 448 bits == 56 bytes, 64 bits = 8 bytes
  // _padding starts with 1 byte with first bit is set in it which
  // is byte value 128, then there may be up to 63 other pad bytes
  var len = this.messageLength;
  var padBytes = new sha1.Buffer();
  padBytes.data += this.input.bytes();
  padBytes.data += _sha1.padding.substr(0, 64 - ((len + 8) % 64));

  /* Now append length of the message. The length is appended in bits
  as a 64-bit number in big-endian order. Since we store the length
  in bytes, we must multiply it by 8 (or left shift by 3). So here
  store the high 3 bits in the low end of the first 32-bits of the
  64-bit number and the lower 5 bits in the high end of the second
  32-bits. */
  padBytes.putInt32((len >>> 29) & 0xFF);
  padBytes.putInt32((len << 3) & 0xFFFFFFFF);
  _sha1.update(this.state, this.words, padBytes);
  var rval = new sha1.Buffer();
  rval.putInt32(this.state.h0);
  rval.putInt32(this.state.h1);
  rval.putInt32(this.state.h2);
  rval.putInt32(this.state.h3);
  rval.putInt32(this.state.h4);
  return rval.toHex();
};

// private SHA-1 data
var _sha1 = {
  padding: null,
  initialized: false
};

/**
 * Initializes the constant tables.
 */
_sha1.init = function() {
  // create padding
  _sha1.padding = String.fromCharCode(128);
  var c = String.fromCharCode(0x00);
  var n = 64;
  while(n > 0) {
    if(n & 1) {
      _sha1.padding += c;
    }
    n >>>= 1;
    if(n > 0) {
      c += c;
    }
  }

  // now initialized
  _sha1.initialized = true;
};

/**
 * Updates a SHA-1 state with the given byte buffer.
 *
 * @param s the SHA-1 state to update.
 * @param w the array to use to store words.
 * @param input the input byte buffer.
 */
_sha1.update = function(s, w, input) {
  // consume 512 bit (64 byte) chunks
  var t, a, b, c, d, e, f, i;
  var len = input.length();
  while(len >= 64) {
    // the w array will be populated with sixteen 32-bit big-endian words
    // and then extended into 80 32-bit words according to SHA-1 algorithm
    // and for 32-79 using Max Locktyukhin's optimization

    // initialize hash value for this chunk
    a = s.h0;
    b = s.h1;
    c = s.h2;
    d = s.h3;
    e = s.h4;

    // round 1
    for(i = 0; i < 16; ++i) {
      t = input.getInt32();
      w[i] = t;
      f = d ^ (b & (c ^ d));
      t = ((a << 5) | (a >>> 27)) + f + e + 0x5A827999 + t;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = t;
    }
    for(; i < 20; ++i) {
      t = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]);
      t = (t << 1) | (t >>> 31);
      w[i] = t;
      f = d ^ (b & (c ^ d));
      t = ((a << 5) | (a >>> 27)) + f + e + 0x5A827999 + t;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = t;
    }
    // round 2
    for(; i < 32; ++i) {
      t = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]);
      t = (t << 1) | (t >>> 31);
      w[i] = t;
      f = b ^ c ^ d;
      t = ((a << 5) | (a >>> 27)) + f + e + 0x6ED9EBA1 + t;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = t;
    }
    for(; i < 40; ++i) {
      t = (w[i - 6] ^ w[i - 16] ^ w[i - 28] ^ w[i - 32]);
      t = (t << 2) | (t >>> 30);
      w[i] = t;
      f = b ^ c ^ d;
      t = ((a << 5) | (a >>> 27)) + f + e + 0x6ED9EBA1 + t;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = t;
    }
    // round 3
    for(; i < 60; ++i) {
      t = (w[i - 6] ^ w[i - 16] ^ w[i - 28] ^ w[i - 32]);
      t = (t << 2) | (t >>> 30);
      w[i] = t;
      f = (b & c) | (d & (b ^ c));
      t = ((a << 5) | (a >>> 27)) + f + e + 0x8F1BBCDC + t;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = t;
    }
    // round 4
    for(; i < 80; ++i) {
      t = (w[i - 6] ^ w[i - 16] ^ w[i - 28] ^ w[i - 32]);
      t = (t << 2) | (t >>> 30);
      w[i] = t;
      f = b ^ c ^ d;
      t = ((a << 5) | (a >>> 27)) + f + e + 0xCA62C1D6 + t;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = t;
    }

    // update hash state
    s.h0 += a;
    s.h1 += b;
    s.h2 += c;
    s.h3 += d;
    s.h4 += e;

    len -= 64;
  }
};

} // end non-nodejs

if(!XMLSerializer) {

var _defineXMLSerializer = function() {
  XMLSerializer = _dereq_('xmldom').XMLSerializer;
};

} // end _defineXMLSerializer

// define URL parser
// parseUri 1.2.2
// (c) Steven Levithan <stevenlevithan.com>
// MIT License
// with local jsonld.js modifications
jsonld.url = {};
jsonld.url.parsers = {
  simple: {
    // RFC 3986 basic parts
    keys: ['href','scheme','authority','path','query','fragment'],
    regex: /^(?:([^:\/?#]+):)?(?:\/\/([^\/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?/
  },
  full: {
    keys: ['href','protocol','scheme','authority','auth','user','password','hostname','port','path','directory','file','query','fragment'],
    regex: /^(([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?(?:(((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/
  }
};
jsonld.url.parse = function(str, parser) {
  var parsed = {};
  var o = jsonld.url.parsers[parser || 'full'];
  var m = o.regex.exec(str);
  var i = o.keys.length;
  while(i--) {
    parsed[o.keys[i]] = (m[i] === undefined) ? null : m[i];
  }
  parsed.normalizedPath = _removeDotSegments(parsed.path, !!parsed.authority);
  return parsed;
};

/**
 * Removes dot segments from a URL path.
 *
 * @param path the path to remove dot segments from.
 * @param hasAuthority true if the URL has an authority, false if not.
 */
function _removeDotSegments(path, hasAuthority) {
  var rval = '';

  if(path.indexOf('/') === 0) {
    rval = '/';
  }

  // RFC 3986 5.2.4 (reworked)
  var input = path.split('/');
  var output = [];
  while(input.length > 0) {
    if(input[0] === '.' || (input[0] === '' && input.length > 1)) {
      input.shift();
      continue;
    }
    if(input[0] === '..') {
      input.shift();
      if(hasAuthority ||
        (output.length > 0 && output[output.length - 1] !== '..')) {
        output.pop();
      } else {
        // leading relative URL '..'
        output.push('..');
      }
      continue;
    }
    output.push(input.shift());
  }

  return rval + output.join('/');
}

if(_nodejs) {
  // use node document loader by default
  jsonld.useDocumentLoader('node');
} else if(typeof XMLHttpRequest !== 'undefined') {
  // use xhr document loader by default
  jsonld.useDocumentLoader('xhr');
}

if(_nodejs) {
  jsonld.use = function(extension) {
    switch(extension) {
      case 'request':
        // use node JSON-LD request extension
        jsonld.request = _dereq_('./request');
        break;
      default:
        throw new JsonLdError(
          'Unknown extension.',
          'jsonld.UnknownExtension', {extension: extension});
    }
  };

  // expose version
  var _module = {exports: {}, filename: __dirname};
  _dereq_('pkginfo')(_module, 'version');
  jsonld.version = _module.exports.version;
}

// end of jsonld API factory
return jsonld;
};

// external APIs:

// used to generate a new jsonld API instance
var factory = function() {
  return wrapper(function() {
    return factory();
  });
};

if(!_nodejs && (typeof define === 'function' && define.amd)) {
  // export AMD API
  define([], function() {
    // now that module is defined, wrap main jsonld API instance
    wrapper(factory);
    return factory;
  });
} else {
  // wrap the main jsonld API instance
  wrapper(factory);

  if(typeof _dereq_ === 'function' &&
    typeof module !== 'undefined' && module.exports) {
    // export CommonJS/nodejs API
    module.exports = factory;
  }

  if(_browser) {
    // export simple browser API
    if(typeof jsonld === 'undefined') {
      jsonld = jsonldjs = factory;
    } else {
      jsonldjs = factory;
    }
  }
}

return factory;

})();

}).call(this,_dereq_("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},"/..\\node_modules\\jsonld\\js")
},{"./request":31,"VCmEsw":13,"crypto":31,"es6-promise":33,"http":31,"pkginfo":34,"request":31,"util":31,"xmldom":31}],33:[function(_dereq_,module,exports){
(function (process,global){
/*!
 * @overview es6-promise - a tiny implementation of Promises/A+.
 * @copyright Copyright (c) 2014 Yehuda Katz, Tom Dale, Stefan Penner and contributors (Conversion to ES6 API by Jake Archibald)
 * @license   Licensed under MIT license
 *            See https://raw.githubusercontent.com/jakearchibald/es6-promise/master/LICENSE
 * @version   2.0.1
 */

(function() {
    "use strict";

    function $$utils$$objectOrFunction(x) {
      return typeof x === 'function' || (typeof x === 'object' && x !== null);
    }

    function $$utils$$isFunction(x) {
      return typeof x === 'function';
    }

    function $$utils$$isMaybeThenable(x) {
      return typeof x === 'object' && x !== null;
    }

    var $$utils$$_isArray;

    if (!Array.isArray) {
      $$utils$$_isArray = function (x) {
        return Object.prototype.toString.call(x) === '[object Array]';
      };
    } else {
      $$utils$$_isArray = Array.isArray;
    }

    var $$utils$$isArray = $$utils$$_isArray;
    var $$utils$$now = Date.now || function() { return new Date().getTime(); };
    function $$utils$$F() { }

    var $$utils$$o_create = (Object.create || function (o) {
      if (arguments.length > 1) {
        throw new Error('Second argument not supported');
      }
      if (typeof o !== 'object') {
        throw new TypeError('Argument must be an object');
      }
      $$utils$$F.prototype = o;
      return new $$utils$$F();
    });

    var $$asap$$len = 0;

    var $$asap$$default = function asap(callback, arg) {
      $$asap$$queue[$$asap$$len] = callback;
      $$asap$$queue[$$asap$$len + 1] = arg;
      $$asap$$len += 2;
      if ($$asap$$len === 2) {
        // If len is 1, that means that we need to schedule an async flush.
        // If additional callbacks are queued before the queue is flushed, they
        // will be processed by this flush that we are scheduling.
        $$asap$$scheduleFlush();
      }
    };

    var $$asap$$browserGlobal = (typeof window !== 'undefined') ? window : {};
    var $$asap$$BrowserMutationObserver = $$asap$$browserGlobal.MutationObserver || $$asap$$browserGlobal.WebKitMutationObserver;

    // test for web worker but not in IE10
    var $$asap$$isWorker = typeof Uint8ClampedArray !== 'undefined' &&
      typeof importScripts !== 'undefined' &&
      typeof MessageChannel !== 'undefined';

    // node
    function $$asap$$useNextTick() {
      return function() {
        process.nextTick($$asap$$flush);
      };
    }

    function $$asap$$useMutationObserver() {
      var iterations = 0;
      var observer = new $$asap$$BrowserMutationObserver($$asap$$flush);
      var node = document.createTextNode('');
      observer.observe(node, { characterData: true });

      return function() {
        node.data = (iterations = ++iterations % 2);
      };
    }

    // web worker
    function $$asap$$useMessageChannel() {
      var channel = new MessageChannel();
      channel.port1.onmessage = $$asap$$flush;
      return function () {
        channel.port2.postMessage(0);
      };
    }

    function $$asap$$useSetTimeout() {
      return function() {
        setTimeout($$asap$$flush, 1);
      };
    }

    var $$asap$$queue = new Array(1000);

    function $$asap$$flush() {
      for (var i = 0; i < $$asap$$len; i+=2) {
        var callback = $$asap$$queue[i];
        var arg = $$asap$$queue[i+1];

        callback(arg);

        $$asap$$queue[i] = undefined;
        $$asap$$queue[i+1] = undefined;
      }

      $$asap$$len = 0;
    }

    var $$asap$$scheduleFlush;

    // Decide what async method to use to triggering processing of queued callbacks:
    if (typeof process !== 'undefined' && {}.toString.call(process) === '[object process]') {
      $$asap$$scheduleFlush = $$asap$$useNextTick();
    } else if ($$asap$$BrowserMutationObserver) {
      $$asap$$scheduleFlush = $$asap$$useMutationObserver();
    } else if ($$asap$$isWorker) {
      $$asap$$scheduleFlush = $$asap$$useMessageChannel();
    } else {
      $$asap$$scheduleFlush = $$asap$$useSetTimeout();
    }

    function $$$internal$$noop() {}
    var $$$internal$$PENDING   = void 0;
    var $$$internal$$FULFILLED = 1;
    var $$$internal$$REJECTED  = 2;
    var $$$internal$$GET_THEN_ERROR = new $$$internal$$ErrorObject();

    function $$$internal$$selfFullfillment() {
      return new TypeError("You cannot resolve a promise with itself");
    }

    function $$$internal$$cannotReturnOwn() {
      return new TypeError('A promises callback cannot return that same promise.')
    }

    function $$$internal$$getThen(promise) {
      try {
        return promise.then;
      } catch(error) {
        $$$internal$$GET_THEN_ERROR.error = error;
        return $$$internal$$GET_THEN_ERROR;
      }
    }

    function $$$internal$$tryThen(then, value, fulfillmentHandler, rejectionHandler) {
      try {
        then.call(value, fulfillmentHandler, rejectionHandler);
      } catch(e) {
        return e;
      }
    }

    function $$$internal$$handleForeignThenable(promise, thenable, then) {
       $$asap$$default(function(promise) {
        var sealed = false;
        var error = $$$internal$$tryThen(then, thenable, function(value) {
          if (sealed) { return; }
          sealed = true;
          if (thenable !== value) {
            $$$internal$$resolve(promise, value);
          } else {
            $$$internal$$fulfill(promise, value);
          }
        }, function(reason) {
          if (sealed) { return; }
          sealed = true;

          $$$internal$$reject(promise, reason);
        }, 'Settle: ' + (promise._label || ' unknown promise'));

        if (!sealed && error) {
          sealed = true;
          $$$internal$$reject(promise, error);
        }
      }, promise);
    }

    function $$$internal$$handleOwnThenable(promise, thenable) {
      if (thenable._state === $$$internal$$FULFILLED) {
        $$$internal$$fulfill(promise, thenable._result);
      } else if (promise._state === $$$internal$$REJECTED) {
        $$$internal$$reject(promise, thenable._result);
      } else {
        $$$internal$$subscribe(thenable, undefined, function(value) {
          $$$internal$$resolve(promise, value);
        }, function(reason) {
          $$$internal$$reject(promise, reason);
        });
      }
    }

    function $$$internal$$handleMaybeThenable(promise, maybeThenable) {
      if (maybeThenable.constructor === promise.constructor) {
        $$$internal$$handleOwnThenable(promise, maybeThenable);
      } else {
        var then = $$$internal$$getThen(maybeThenable);

        if (then === $$$internal$$GET_THEN_ERROR) {
          $$$internal$$reject(promise, $$$internal$$GET_THEN_ERROR.error);
        } else if (then === undefined) {
          $$$internal$$fulfill(promise, maybeThenable);
        } else if ($$utils$$isFunction(then)) {
          $$$internal$$handleForeignThenable(promise, maybeThenable, then);
        } else {
          $$$internal$$fulfill(promise, maybeThenable);
        }
      }
    }

    function $$$internal$$resolve(promise, value) {
      if (promise === value) {
        $$$internal$$reject(promise, $$$internal$$selfFullfillment());
      } else if ($$utils$$objectOrFunction(value)) {
        $$$internal$$handleMaybeThenable(promise, value);
      } else {
        $$$internal$$fulfill(promise, value);
      }
    }

    function $$$internal$$publishRejection(promise) {
      if (promise._onerror) {
        promise._onerror(promise._result);
      }

      $$$internal$$publish(promise);
    }

    function $$$internal$$fulfill(promise, value) {
      if (promise._state !== $$$internal$$PENDING) { return; }

      promise._result = value;
      promise._state = $$$internal$$FULFILLED;

      if (promise._subscribers.length === 0) {
      } else {
        $$asap$$default($$$internal$$publish, promise);
      }
    }

    function $$$internal$$reject(promise, reason) {
      if (promise._state !== $$$internal$$PENDING) { return; }
      promise._state = $$$internal$$REJECTED;
      promise._result = reason;

      $$asap$$default($$$internal$$publishRejection, promise);
    }

    function $$$internal$$subscribe(parent, child, onFulfillment, onRejection) {
      var subscribers = parent._subscribers;
      var length = subscribers.length;

      parent._onerror = null;

      subscribers[length] = child;
      subscribers[length + $$$internal$$FULFILLED] = onFulfillment;
      subscribers[length + $$$internal$$REJECTED]  = onRejection;

      if (length === 0 && parent._state) {
        $$asap$$default($$$internal$$publish, parent);
      }
    }

    function $$$internal$$publish(promise) {
      var subscribers = promise._subscribers;
      var settled = promise._state;

      if (subscribers.length === 0) { return; }

      var child, callback, detail = promise._result;

      for (var i = 0; i < subscribers.length; i += 3) {
        child = subscribers[i];
        callback = subscribers[i + settled];

        if (child) {
          $$$internal$$invokeCallback(settled, child, callback, detail);
        } else {
          callback(detail);
        }
      }

      promise._subscribers.length = 0;
    }

    function $$$internal$$ErrorObject() {
      this.error = null;
    }

    var $$$internal$$TRY_CATCH_ERROR = new $$$internal$$ErrorObject();

    function $$$internal$$tryCatch(callback, detail) {
      try {
        return callback(detail);
      } catch(e) {
        $$$internal$$TRY_CATCH_ERROR.error = e;
        return $$$internal$$TRY_CATCH_ERROR;
      }
    }

    function $$$internal$$invokeCallback(settled, promise, callback, detail) {
      var hasCallback = $$utils$$isFunction(callback),
          value, error, succeeded, failed;

      if (hasCallback) {
        value = $$$internal$$tryCatch(callback, detail);

        if (value === $$$internal$$TRY_CATCH_ERROR) {
          failed = true;
          error = value.error;
          value = null;
        } else {
          succeeded = true;
        }

        if (promise === value) {
          $$$internal$$reject(promise, $$$internal$$cannotReturnOwn());
          return;
        }

      } else {
        value = detail;
        succeeded = true;
      }

      if (promise._state !== $$$internal$$PENDING) {
        // noop
      } else if (hasCallback && succeeded) {
        $$$internal$$resolve(promise, value);
      } else if (failed) {
        $$$internal$$reject(promise, error);
      } else if (settled === $$$internal$$FULFILLED) {
        $$$internal$$fulfill(promise, value);
      } else if (settled === $$$internal$$REJECTED) {
        $$$internal$$reject(promise, value);
      }
    }

    function $$$internal$$initializePromise(promise, resolver) {
      try {
        resolver(function resolvePromise(value){
          $$$internal$$resolve(promise, value);
        }, function rejectPromise(reason) {
          $$$internal$$reject(promise, reason);
        });
      } catch(e) {
        $$$internal$$reject(promise, e);
      }
    }

    function $$$enumerator$$makeSettledResult(state, position, value) {
      if (state === $$$internal$$FULFILLED) {
        return {
          state: 'fulfilled',
          value: value
        };
      } else {
        return {
          state: 'rejected',
          reason: value
        };
      }
    }

    function $$$enumerator$$Enumerator(Constructor, input, abortOnReject, label) {
      this._instanceConstructor = Constructor;
      this.promise = new Constructor($$$internal$$noop, label);
      this._abortOnReject = abortOnReject;

      if (this._validateInput(input)) {
        this._input     = input;
        this.length     = input.length;
        this._remaining = input.length;

        this._init();

        if (this.length === 0) {
          $$$internal$$fulfill(this.promise, this._result);
        } else {
          this.length = this.length || 0;
          this._enumerate();
          if (this._remaining === 0) {
            $$$internal$$fulfill(this.promise, this._result);
          }
        }
      } else {
        $$$internal$$reject(this.promise, this._validationError());
      }
    }

    $$$enumerator$$Enumerator.prototype._validateInput = function(input) {
      return $$utils$$isArray(input);
    };

    $$$enumerator$$Enumerator.prototype._validationError = function() {
      return new Error('Array Methods must be provided an Array');
    };

    $$$enumerator$$Enumerator.prototype._init = function() {
      this._result = new Array(this.length);
    };

    var $$$enumerator$$default = $$$enumerator$$Enumerator;

    $$$enumerator$$Enumerator.prototype._enumerate = function() {
      var length  = this.length;
      var promise = this.promise;
      var input   = this._input;

      for (var i = 0; promise._state === $$$internal$$PENDING && i < length; i++) {
        this._eachEntry(input[i], i);
      }
    };

    $$$enumerator$$Enumerator.prototype._eachEntry = function(entry, i) {
      var c = this._instanceConstructor;
      if ($$utils$$isMaybeThenable(entry)) {
        if (entry.constructor === c && entry._state !== $$$internal$$PENDING) {
          entry._onerror = null;
          this._settledAt(entry._state, i, entry._result);
        } else {
          this._willSettleAt(c.resolve(entry), i);
        }
      } else {
        this._remaining--;
        this._result[i] = this._makeResult($$$internal$$FULFILLED, i, entry);
      }
    };

    $$$enumerator$$Enumerator.prototype._settledAt = function(state, i, value) {
      var promise = this.promise;

      if (promise._state === $$$internal$$PENDING) {
        this._remaining--;

        if (this._abortOnReject && state === $$$internal$$REJECTED) {
          $$$internal$$reject(promise, value);
        } else {
          this._result[i] = this._makeResult(state, i, value);
        }
      }

      if (this._remaining === 0) {
        $$$internal$$fulfill(promise, this._result);
      }
    };

    $$$enumerator$$Enumerator.prototype._makeResult = function(state, i, value) {
      return value;
    };

    $$$enumerator$$Enumerator.prototype._willSettleAt = function(promise, i) {
      var enumerator = this;

      $$$internal$$subscribe(promise, undefined, function(value) {
        enumerator._settledAt($$$internal$$FULFILLED, i, value);
      }, function(reason) {
        enumerator._settledAt($$$internal$$REJECTED, i, reason);
      });
    };

    var $$promise$all$$default = function all(entries, label) {
      return new $$$enumerator$$default(this, entries, true /* abort on reject */, label).promise;
    };

    var $$promise$race$$default = function race(entries, label) {
      /*jshint validthis:true */
      var Constructor = this;

      var promise = new Constructor($$$internal$$noop, label);

      if (!$$utils$$isArray(entries)) {
        $$$internal$$reject(promise, new TypeError('You must pass an array to race.'));
        return promise;
      }

      var length = entries.length;

      function onFulfillment(value) {
        $$$internal$$resolve(promise, value);
      }

      function onRejection(reason) {
        $$$internal$$reject(promise, reason);
      }

      for (var i = 0; promise._state === $$$internal$$PENDING && i < length; i++) {
        $$$internal$$subscribe(Constructor.resolve(entries[i]), undefined, onFulfillment, onRejection);
      }

      return promise;
    };

    var $$promise$resolve$$default = function resolve(object, label) {
      /*jshint validthis:true */
      var Constructor = this;

      if (object && typeof object === 'object' && object.constructor === Constructor) {
        return object;
      }

      var promise = new Constructor($$$internal$$noop, label);
      $$$internal$$resolve(promise, object);
      return promise;
    };

    var $$promise$reject$$default = function reject(reason, label) {
      /*jshint validthis:true */
      var Constructor = this;
      var promise = new Constructor($$$internal$$noop, label);
      $$$internal$$reject(promise, reason);
      return promise;
    };

    var $$es6$promise$promise$$counter = 0;

    function $$es6$promise$promise$$needsResolver() {
      throw new TypeError('You must pass a resolver function as the first argument to the promise constructor');
    }

    function $$es6$promise$promise$$needsNew() {
      throw new TypeError("Failed to construct 'Promise': Please use the 'new' operator, this object constructor cannot be called as a function.");
    }

    var $$es6$promise$promise$$default = $$es6$promise$promise$$Promise;

    /**
      Promise objects represent the eventual result of an asynchronous operation. The
      primary way of interacting with a promise is through its `then` method, which
      registers callbacks to receive either a promise’s eventual value or the reason
      why the promise cannot be fulfilled.

      Terminology
      -----------

      - `promise` is an object or function with a `then` method whose behavior conforms to this specification.
      - `thenable` is an object or function that defines a `then` method.
      - `value` is any legal JavaScript value (including undefined, a thenable, or a promise).
      - `exception` is a value that is thrown using the throw statement.
      - `reason` is a value that indicates why a promise was rejected.
      - `settled` the final resting state of a promise, fulfilled or rejected.

      A promise can be in one of three states: pending, fulfilled, or rejected.

      Promises that are fulfilled have a fulfillment value and are in the fulfilled
      state.  Promises that are rejected have a rejection reason and are in the
      rejected state.  A fulfillment value is never a thenable.

      Promises can also be said to *resolve* a value.  If this value is also a
      promise, then the original promise's settled state will match the value's
      settled state.  So a promise that *resolves* a promise that rejects will
      itself reject, and a promise that *resolves* a promise that fulfills will
      itself fulfill.


      Basic Usage:
      ------------

      ```js
      var promise = new Promise(function(resolve, reject) {
        // on success
        resolve(value);

        // on failure
        reject(reason);
      });

      promise.then(function(value) {
        // on fulfillment
      }, function(reason) {
        // on rejection
      });
      ```

      Advanced Usage:
      ---------------

      Promises shine when abstracting away asynchronous interactions such as
      `XMLHttpRequest`s.

      ```js
      function getJSON(url) {
        return new Promise(function(resolve, reject){
          var xhr = new XMLHttpRequest();

          xhr.open('GET', url);
          xhr.onreadystatechange = handler;
          xhr.responseType = 'json';
          xhr.setRequestHeader('Accept', 'application/json');
          xhr.send();

          function handler() {
            if (this.readyState === this.DONE) {
              if (this.status === 200) {
                resolve(this.response);
              } else {
                reject(new Error('getJSON: `' + url + '` failed with status: [' + this.status + ']'));
              }
            }
          };
        });
      }

      getJSON('/posts.json').then(function(json) {
        // on fulfillment
      }, function(reason) {
        // on rejection
      });
      ```

      Unlike callbacks, promises are great composable primitives.

      ```js
      Promise.all([
        getJSON('/posts'),
        getJSON('/comments')
      ]).then(function(values){
        values[0] // => postsJSON
        values[1] // => commentsJSON

        return values;
      });
      ```

      @class Promise
      @param {function} resolver
      Useful for tooling.
      @constructor
    */
    function $$es6$promise$promise$$Promise(resolver) {
      this._id = $$es6$promise$promise$$counter++;
      this._state = undefined;
      this._result = undefined;
      this._subscribers = [];

      if ($$$internal$$noop !== resolver) {
        if (!$$utils$$isFunction(resolver)) {
          $$es6$promise$promise$$needsResolver();
        }

        if (!(this instanceof $$es6$promise$promise$$Promise)) {
          $$es6$promise$promise$$needsNew();
        }

        $$$internal$$initializePromise(this, resolver);
      }
    }

    $$es6$promise$promise$$Promise.all = $$promise$all$$default;
    $$es6$promise$promise$$Promise.race = $$promise$race$$default;
    $$es6$promise$promise$$Promise.resolve = $$promise$resolve$$default;
    $$es6$promise$promise$$Promise.reject = $$promise$reject$$default;

    $$es6$promise$promise$$Promise.prototype = {
      constructor: $$es6$promise$promise$$Promise,

    /**
      The primary way of interacting with a promise is through its `then` method,
      which registers callbacks to receive either a promise's eventual value or the
      reason why the promise cannot be fulfilled.

      ```js
      findUser().then(function(user){
        // user is available
      }, function(reason){
        // user is unavailable, and you are given the reason why
      });
      ```

      Chaining
      --------

      The return value of `then` is itself a promise.  This second, 'downstream'
      promise is resolved with the return value of the first promise's fulfillment
      or rejection handler, or rejected if the handler throws an exception.

      ```js
      findUser().then(function (user) {
        return user.name;
      }, function (reason) {
        return 'default name';
      }).then(function (userName) {
        // If `findUser` fulfilled, `userName` will be the user's name, otherwise it
        // will be `'default name'`
      });

      findUser().then(function (user) {
        throw new Error('Found user, but still unhappy');
      }, function (reason) {
        throw new Error('`findUser` rejected and we're unhappy');
      }).then(function (value) {
        // never reached
      }, function (reason) {
        // if `findUser` fulfilled, `reason` will be 'Found user, but still unhappy'.
        // If `findUser` rejected, `reason` will be '`findUser` rejected and we're unhappy'.
      });
      ```
      If the downstream promise does not specify a rejection handler, rejection reasons will be propagated further downstream.

      ```js
      findUser().then(function (user) {
        throw new PedagogicalException('Upstream error');
      }).then(function (value) {
        // never reached
      }).then(function (value) {
        // never reached
      }, function (reason) {
        // The `PedgagocialException` is propagated all the way down to here
      });
      ```

      Assimilation
      ------------

      Sometimes the value you want to propagate to a downstream promise can only be
      retrieved asynchronously. This can be achieved by returning a promise in the
      fulfillment or rejection handler. The downstream promise will then be pending
      until the returned promise is settled. This is called *assimilation*.

      ```js
      findUser().then(function (user) {
        return findCommentsByAuthor(user);
      }).then(function (comments) {
        // The user's comments are now available
      });
      ```

      If the assimliated promise rejects, then the downstream promise will also reject.

      ```js
      findUser().then(function (user) {
        return findCommentsByAuthor(user);
      }).then(function (comments) {
        // If `findCommentsByAuthor` fulfills, we'll have the value here
      }, function (reason) {
        // If `findCommentsByAuthor` rejects, we'll have the reason here
      });
      ```

      Simple Example
      --------------

      Synchronous Example

      ```javascript
      var result;

      try {
        result = findResult();
        // success
      } catch(reason) {
        // failure
      }
      ```

      Errback Example

      ```js
      findResult(function(result, err){
        if (err) {
          // failure
        } else {
          // success
        }
      });
      ```

      Promise Example;

      ```javascript
      findResult().then(function(result){
        // success
      }, function(reason){
        // failure
      });
      ```

      Advanced Example
      --------------

      Synchronous Example

      ```javascript
      var author, books;

      try {
        author = findAuthor();
        books  = findBooksByAuthor(author);
        // success
      } catch(reason) {
        // failure
      }
      ```

      Errback Example

      ```js

      function foundBooks(books) {

      }

      function failure(reason) {

      }

      findAuthor(function(author, err){
        if (err) {
          failure(err);
          // failure
        } else {
          try {
            findBoooksByAuthor(author, function(books, err) {
              if (err) {
                failure(err);
              } else {
                try {
                  foundBooks(books);
                } catch(reason) {
                  failure(reason);
                }
              }
            });
          } catch(error) {
            failure(err);
          }
          // success
        }
      });
      ```

      Promise Example;

      ```javascript
      findAuthor().
        then(findBooksByAuthor).
        then(function(books){
          // found books
      }).catch(function(reason){
        // something went wrong
      });
      ```

      @method then
      @param {Function} onFulfilled
      @param {Function} onRejected
      Useful for tooling.
      @return {Promise}
    */
      then: function(onFulfillment, onRejection) {
        var parent = this;
        var state = parent._state;

        if (state === $$$internal$$FULFILLED && !onFulfillment || state === $$$internal$$REJECTED && !onRejection) {
          return this;
        }

        var child = new this.constructor($$$internal$$noop);
        var result = parent._result;

        if (state) {
          var callback = arguments[state - 1];
          $$asap$$default(function(){
            $$$internal$$invokeCallback(state, child, callback, result);
          });
        } else {
          $$$internal$$subscribe(parent, child, onFulfillment, onRejection);
        }

        return child;
      },

    /**
      `catch` is simply sugar for `then(undefined, onRejection)` which makes it the same
      as the catch block of a try/catch statement.

      ```js
      function findAuthor(){
        throw new Error('couldn't find that author');
      }

      // synchronous
      try {
        findAuthor();
      } catch(reason) {
        // something went wrong
      }

      // async with promises
      findAuthor().catch(function(reason){
        // something went wrong
      });
      ```

      @method catch
      @param {Function} onRejection
      Useful for tooling.
      @return {Promise}
    */
      'catch': function(onRejection) {
        return this.then(null, onRejection);
      }
    };

    var $$es6$promise$polyfill$$default = function polyfill() {
      var local;

      if (typeof global !== 'undefined') {
        local = global;
      } else if (typeof window !== 'undefined' && window.document) {
        local = window;
      } else {
        local = self;
      }

      var es6PromiseSupport =
        "Promise" in local &&
        // Some of these methods are missing from
        // Firefox/Chrome experimental implementations
        "resolve" in local.Promise &&
        "reject" in local.Promise &&
        "all" in local.Promise &&
        "race" in local.Promise &&
        // Older version of the spec had a resolver object
        // as the arg rather than a function
        (function() {
          var resolve;
          new local.Promise(function(r) { resolve = r; });
          return $$utils$$isFunction(resolve);
        }());

      if (!es6PromiseSupport) {
        local.Promise = $$es6$promise$promise$$default;
      }
    };

    var es6$promise$umd$$ES6Promise = {
      'Promise': $$es6$promise$promise$$default,
      'polyfill': $$es6$promise$polyfill$$default
    };

    /* global define:true module:true window: true */
    if (typeof define === 'function' && define['amd']) {
      define(function() { return es6$promise$umd$$ES6Promise; });
    } else if (typeof module !== 'undefined' && module['exports']) {
      module['exports'] = es6$promise$umd$$ES6Promise;
    } else if (typeof this !== 'undefined') {
      this['ES6Promise'] = es6$promise$umd$$ES6Promise;
    }
}).call(this);
}).call(this,_dereq_("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"VCmEsw":13}],34:[function(_dereq_,module,exports){
(function (__dirname){
/*
 * pkginfo.js: Top-level include for the pkginfo module
 *
 * (C) 2011, Charlie Robbins
 *
 */
 
var fs = _dereq_('fs'),
    path = _dereq_('path');

//
// ### function pkginfo ([options, 'property', 'property' ..])
// #### @pmodule {Module} Parent module to read from.
// #### @options {Object|Array|string} **Optional** Options used when exposing properties.
// #### @arguments {string...} **Optional** Specified properties to expose.
// Exposes properties from the package.json file for the parent module on 
// it's exports. Valid usage:
//
// `require('pkginfo')()`
//
// `require('pkginfo')('version', 'author');`
//
// `require('pkginfo')(['version', 'author']);`
//
// `require('pkginfo')({ include: ['version', 'author'] });`
//
var pkginfo = module.exports = function (pmodule, options) {
  var args = [].slice.call(arguments, 2).filter(function (arg) {
    return typeof arg === 'string';
  });
  
  //
  // **Parse variable arguments**
  //
  if (Array.isArray(options)) {
    //
    // If the options passed in is an Array assume that
    // it is the Array of properties to expose from the
    // on the package.json file on the parent module.
    //
    options = { include: options };
  }
  else if (typeof options === 'string') {
    //
    // Otherwise if the first argument is a string, then
    // assume that it is the first property to expose from
    // the package.json file on the parent module.
    //
    options = { include: [options] };
  }
  
  //
  // **Setup default options**
  //
  options = options || {};
  
  // ensure that includes have been defined
  options.include = options.include || [];
  
  if (args.length > 0) {
    //
    // If additional string arguments have been passed in
    // then add them to the properties to expose on the 
    // parent module. 
    //
    options.include = options.include.concat(args);
  }
  
  var pkg = pkginfo.read(pmodule, options.dir).package;
  Object.keys(pkg).forEach(function (key) {
    if (options.include.length > 0 && !~options.include.indexOf(key)) {
      return;
    }
    
    if (!pmodule.exports[key]) {
      pmodule.exports[key] = pkg[key];
    }
  });
  
  return pkginfo;
};

//
// ### function find (dir)
// #### @pmodule {Module} Parent module to read from.
// #### @dir {string} **Optional** Directory to start search from.
// Searches up the directory tree from `dir` until it finds a directory
// which contains a `package.json` file. 
//
pkginfo.find = function (pmodule, dir) {
  if (! dir) {
    dir = path.dirname(pmodule.filename);
  }
  
  var files = fs.readdirSync(dir);
  
  if (~files.indexOf('package.json')) {
    return path.join(dir, 'package.json');
  }
  
  if (dir === '/') {
    throw new Error('Could not find package.json up from: ' + dir);
  }
  else if (!dir || dir === '.') {
    throw new Error('Cannot find package.json from unspecified directory');
  }
  
  return pkginfo.find(pmodule, path.dirname(dir));
};

//
// ### function read (pmodule, dir)
// #### @pmodule {Module} Parent module to read from.
// #### @dir {string} **Optional** Directory to start search from.
// Searches up the directory tree from `dir` until it finds a directory
// which contains a `package.json` file and returns the package information.
//
pkginfo.read = function (pmodule, dir) { 
  dir = pkginfo.find(pmodule, dir);
  
  var data = fs.readFileSync(dir).toString();
      
  return {
    dir: dir, 
    package: JSON.parse(data)
  };
};

//
// Call `pkginfo` on this module and expose version.
//
pkginfo(module, {
  dir: __dirname,
  include: ['version'],
  target: pkginfo
});
}).call(this,"/..\\node_modules\\jsonld\\node_modules\\pkginfo\\lib")
},{"fs":1,"path":12}],35:[function(_dereq_,module,exports){
// **N3Lexer** tokenizes N3 documents.
var fromCharCode = String.fromCharCode;
var immediately = typeof setImmediate === 'function' ? setImmediate :
                  function setImmediate(func) { setTimeout(func, 0); };

// Regular expression and replacement string to escape N3 strings.
// Note how we catch invalid unicode sequences separately (they will trigger an error).
var escapeSequence = /\\u([a-fA-F0-9]{4})|\\U([a-fA-F0-9]{8})|\\[uU]|\\(.)/g;
var escapeReplacements = { '\\': '\\', "'": "'", '"': '"',
                           'n': '\n', 'r': '\r', 't': '\t', 'f': '\f', 'b': '\b',
                           '_': '_', '~': '~', '.': '.', '-': '-', '!': '!', '$': '$', '&': '&',
                           '(': '(', ')': ')', '*': '*', '+': '+', ',': ',', ';': ';', '=': '=',
                           '/': '/', '?': '?', '#': '#', '@': '@', '%': '%' };
var illegalIriChars = /[\x00-\x20<>\\"\{\}\|\^\`]/;

// ## Constructor
function N3Lexer(options) {
  if (!(this instanceof N3Lexer))
    return new N3Lexer(options);

  // In line mode (N-Triples or N-Quads), only simple features may be parsed
  if (options && options.lineMode) {
    // Don't tokenize special literals
    this._tripleQuotedString = this._number = this._boolean = /$0^/;
    // Swap the tokenize method for a restricted version
    var self = this;
    this._tokenize = this.tokenize;
    this.tokenize = function (input, callback) {
      this._tokenize(input, function (error, token) {
        if (!error && /IRI|prefixed|literal|langcode|type|\.|eof/.test(token.type))
          callback && callback(error, token);
        else
          callback && callback(error || self._syntaxError(token.type, callback = null));
      });
    };
  }
}

N3Lexer.prototype = {
  // ## Regular expressions
  // It's slightly faster to have these as properties than as in-scope variables.

  _iri: /^<((?:[^>\\]|\\[uU])+)>/, // IRI with escape sequences; needs sanity check after unescaping
  _unescapedIri: /^<([^\x00-\x20<>\\"\{\}\|\^\`]*)>/, // IRI without escape sequences; no unescaping
  _unescapedString: /^"[^"\\]+"(?=[^"\\])/, // non-empty string without escape sequences
  _singleQuotedString: /^"[^"\\]*(?:\\.[^"\\]*)*"(?=[^"\\])|^'[^'\\]*(?:\\.[^'\\]*)*'(?=[^'\\])/,
  _tripleQuotedString: /^""("[^"\\]*(?:(?:\\.|"(?!""))[^"\\]*)*")""|^''('[^'\\]*(?:(?:\\.|'(?!''))[^'\\]*)*')''/,
  _langcode: /^@([a-z]+(?:-[a-z0-9]+)*)(?=[^a-z0-9\-])/i,
  _prefix: /^((?:[A-Za-z\xc0-\xd6\xd8-\xf6\xf8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])(?:\.?[\-0-9A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])*)?:(?=[#\s<])/,
  _prefixed: /^((?:[A-Za-z\xc0-\xd6\xd8-\xf6\xf8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])(?:\.?[\-0-9A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])*)?:((?:(?:[0-:A-Z_a-z\xc0-\xd6\xd8-\xf6\xf8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff]|%[0-9a-fA-F]{2}|\\[!#-\/;=?\-@_~])(?:(?:[\.\-0-:A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff]|%[0-9a-fA-F]{2}|\\[!#-\/;=?\-@_~])*(?:[\-0-:A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff]|%[0-9a-fA-F]{2}|\\[!#-\/;=?\-@_~]))?)?)(?=\.?[,;\s#()\[\]\{\}"'<])/,
  _blank: /^_:((?:[0-9A-Z_a-z\xc0-\xd6\xd8-\xf6\xf8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])(?:\.?[\-0-9A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])*)(?=\.?[,;:\s#()\[\]\{\}"'<])/,
  _number: /^[\-+]?(?:\d+\.?\d*([eE](?:[\-\+])?\d+)|\d*\.?\d+)(?=[.,;:\s#()\[\]\{\}"'<])/,
  _boolean: /^(?:true|false)(?=[.,;:\s#()\[\]\{\}"'<])/,
  _keyword: /^@[a-z]+(?=[\s#<:])/,
  _sparqlKeyword: /^(?:PREFIX|BASE|GRAPH)(?=[\s#<:])/i,
  _shortPredicates: /^a(?=\s+|<)/,
  _newline: /^[ \t]*(?:#[^\n\r]*)?(?:\r\n|\n|\r)[ \t]*/,
  _whitespace: /^[ \t]+/,
  _endOfFile: /^(?:#[^\n\r]*)?$/,

  // ## Private methods

  // ### `_tokenizeToEnd` tokenizes as for as possible, emitting tokens through the callback.
  _tokenizeToEnd: function (callback, inputFinished) {
    // Continue parsing as far as possible; the loop will return eventually.
    var input = this._input;
    while (true) {
      // Count and skip whitespace lines.
      var whiteSpaceMatch;
      while (whiteSpaceMatch = this._newline.exec(input))
        input = input.substr(whiteSpaceMatch[0].length, input.length), this._line++;
      // Skip whitespace on current line.
      if (whiteSpaceMatch = this._whitespace.exec(input))
        input = input.substr(whiteSpaceMatch[0].length, input.length);

      // Stop for now if we're at the end.
      if (this._endOfFile.test(input)) {
        // If the input is finished, emit EOF.
        if (inputFinished)
          callback(input = null, { line: this._line, type: 'eof', value: '', prefix: '' });
        return this._input = input;
      }

      // Look for specific token types based on the first character.
      var line = this._line, type = '', value = '', prefix = '',
          firstChar = input[0], match = null, matchLength = 0, unescaped, inconclusive = false;
      switch (firstChar) {
      case '^':
        // Try to match a type.
        if (input.length === 1) break;
        else if (input[1] !== '^') return reportSyntaxError(this);
        this._prevTokenType = '^';
        // Move to type IRI or prefixed name.
        input = input.substr(2);
        if (input[0] !== '<') {
          inconclusive = true;
          break;
        }
        // Fall through in case the type is an IRI.

      case '<':
        // Try to find a full IRI without escape sequences.
        if (match = this._unescapedIri.exec(input)) {
          type = 'IRI';
          value = match[1];
        }
        // Try to find a full IRI with escape sequences.
        else if (match = this._iri.exec(input)) {
          unescaped = this._unescape(match[1]);
          if (unescaped === null || illegalIriChars.test(unescaped))
            return reportSyntaxError(this);
          type = 'IRI';
          value = unescaped;
        }
        break;

      case '_':
        // Try to find a blank node. Since it can contain (but not end with) a dot,
        // we always need a non-dot character before deciding it is a prefixed name.
        // Therefore, try inserting a space if we're at the end of the input.
        if ((match = this._blank.exec(input)) ||
            inputFinished && (match = this._blank.exec(input + ' '))) {
          type = 'prefixed';
          prefix = '_';
          value = match[1];
        }
        break;

      case '"':
      case "'":
        // Try to find a non-empty double-quoted literal without escape sequences.
        if (match = this._unescapedString.exec(input)) {
          type = 'literal';
          value = match[0];
        }
        // Try to find any other literal wrapped in a pair of single or double quotes.
        else if (match = this._singleQuotedString.exec(input)) {
          unescaped = this._unescape(match[0]);
          if (unescaped === null)
            return reportSyntaxError(this);
          type = 'literal';
          value = unescaped.replace(/^'|'$/g, '"');
        }
        // Try to find a literal wrapped in three pairs of single or double quotes.
        else if (match = this._tripleQuotedString.exec(input)) {
          unescaped = match[1] || match[2];
          // Count the newlines and advance line counter.
          this._line += unescaped.split(/\r\n|\r|\n/).length - 1;
          unescaped = this._unescape(unescaped);
          if (unescaped === null)
            return reportSyntaxError(this);
          type = 'literal';
          value = unescaped.replace(/^'|'$/g, '"');
        }
        break;

      case '@':
        // Try to find a language code.
        if (this._prevTokenType === 'literal' && (match = this._langcode.exec(input))) {
          type = 'langcode';
          value = match[1];
        }
        // Try to find a keyword.
        else if (match = this._keyword.exec(input)) {
          type = match[0];
        }
        break;

      case '.':
        // Try to find a dot as punctuation.
        if (input.length === 1 ? inputFinished : (input[1] < '0' || input[1] > '9')) {
          type = '.';
          matchLength = 1;
          break;
        }
        // Fall through to numerical case (could be a decimal dot).

      case '0':
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
      case '+':
      case '-':
        // Try to find a number.
        if (match = this._number.exec(input)) {
          type = 'literal';
          value = '"' + match[0] + '"^^http://www.w3.org/2001/XMLSchema#' +
                  (match[1] ? 'double' : (/^[+\-]?\d+$/.test(match[0]) ? 'integer' : 'decimal'));
        }
        break;

      case 'B':
      case 'b':
      case 'p':
      case 'P':
      case 'G':
      case 'g':
        // Try to find a SPARQL-style keyword.
        if (match = this._sparqlKeyword.exec(input))
          type = match[0].toUpperCase();
        else
          inconclusive = true;
        break;

      case 'f':
      case 't':
        // Try to match a boolean.
        if (match = this._boolean.exec(input)) {
          type = 'literal';
          value = '"' + match[0] + '"^^http://www.w3.org/2001/XMLSchema#boolean';
        }
        else
          inconclusive = true;
        break;

      case 'a':
        // Try to find an abbreviated predicate.
        if (match = this._shortPredicates.exec(input)) {
          type = 'abbreviation';
          value = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
        }
        else
          inconclusive = true;
        break;

      case ',':
      case ';':
      case '[':
      case ']':
      case '(':
      case ')':
      case '{':
      case '}':
        // The next token is punctuation
        matchLength = 1;
        type = firstChar;
        break;

      default:
        inconclusive = true;
      }

      // Some first characters do not allow an immediate decision, so inspect more.
      if (inconclusive) {
        // Try to find a prefix.
        if ((this._prevTokenType === '@prefix' || this._prevTokenType === 'PREFIX') &&
            (match = this._prefix.exec(input))) {
          type = 'prefix';
          value = match[1] || '';
        }
        // Try to find a prefixed name. Since it can contain (but not end with) a dot,
        // we always need a non-dot character before deciding it is a prefixed name.
        // Therefore, try inserting a space if we're at the end of the input.
        else if ((match = this._prefixed.exec(input)) ||
                 inputFinished && (match = this._prefixed.exec(input + ' '))) {
          type = 'prefixed';
          prefix = match[1] || '';
          value = this._unescape(match[2]);
        }
      }

      // A type token is special: it can only be emitted after an IRI or prefixed name is read.
      if (this._prevTokenType === '^')
        type = (type === 'IRI' || type === 'prefixed') ? 'type' : '';

      // What if nothing of the above was found?
      if (!type) {
        // We could be in streaming mode, and then we just wait for more input to arrive.
        // Otherwise, a syntax error has occurred in the input.
        // One exception: error on an unaccounted linebreak (= not inside a triple-quoted literal).
        if (inputFinished || (!/^'''|^"""/.test(input) && /\n|\r/.test(input)))
          return reportSyntaxError(this);
        else
          return this._input = input;
      }

      // Emit the parsed token.
      callback(null, { line: line, type: type, value: value, prefix: prefix });
      this._prevTokenType = type;

      // Advance to next part to tokenize.
      input = input.substr(matchLength || match[0].length, input.length);
    }

    // Signals the syntax error through the callback
    function reportSyntaxError(self) { callback(self._syntaxError(/^\S*/.exec(input)[0])); }
  },

  // ### `_unescape` replaces N3 escape codes by their corresponding characters.
  _unescape: function (item) {
    try {
      return item.replace(escapeSequence, function (sequence, unicode4, unicode8, escapedChar) {
        var charCode;
        if (unicode4) {
          charCode = parseInt(unicode4, 16);
          if (isNaN(charCode)) throw new Error(); // can never happen (regex), but helps performance
          return fromCharCode(charCode);
        }
        else if (unicode8) {
          charCode = parseInt(unicode8, 16);
          if (isNaN(charCode)) throw new Error(); // can never happen (regex), but helps performance
          if (charCode <= 0xFFFF) return fromCharCode(charCode);
          return fromCharCode(0xD800 + ((charCode -= 0x10000) / 0x400), 0xDC00 + (charCode & 0x3FF));
        }
        else {
          var replacement = escapeReplacements[escapedChar];
          if (!replacement)
            throw new Error();
          return replacement;
        }
      });
    }
    catch (error) { return null; }
  },

  // ### `_syntaxError` creates a syntax error for the given issue
  _syntaxError: function (issue) {
    this._input = null;
    return new Error('Syntax error: unexpected "' + issue + '" on line ' + this._line + '.');
  },


  // ## Public methods

  // ### `tokenize` starts the transformation of an N3 document into an array of tokens.
  // The input can be a string or a stream.
  tokenize: function (input, callback) {
    var self = this;
    this._line = 1;

    // If the input is a string, continuously emit tokens through the callback until the end.
    if (typeof input === 'string') {
      this._input = input;
      immediately(function () { self._tokenizeToEnd(callback, true); });
    }
    // Otherwise, the input will be streamed.
    else {
      this._input = '';

      // If no input was given, it will be streamed through `addChunk` and ended with `end`
      if (!input || typeof input === 'function') {
        this.addChunk = addChunk;
        this.end = end;
        if (!callback)
          callback = input;
      }
      // Otherwise, the input itself must be a stream
      else {
        if (typeof input.setEncoding === 'function')
          input.setEncoding('utf8');
        input.on('data', addChunk);
        input.on('end', end);
      }
    }

    // Adds the data chunk to the buffer and parses as far as possible
    function addChunk(data) {
      if (self._input !== null) {
        self._input += data;
        self._tokenizeToEnd(callback, false);
      }
    }

    // Parses until the end
    function end() {
      if (self._input !== null) {
        self._tokenizeToEnd(callback, true);
      }
    }
  },
};

// ## Exports

// Export the `N3Lexer` class as a whole.
module.exports = N3Lexer;

},{}],36:[function(_dereq_,module,exports){
// **N3Parser** parses N3 documents.
var N3Lexer = _dereq_('./N3Lexer');

var RDF_PREFIX = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    RDF_NIL    = RDF_PREFIX + 'nil',
    RDF_FIRST  = RDF_PREFIX + 'first',
    RDF_REST   = RDF_PREFIX + 'rest';

var absoluteIRI = /:/,
    documentPart = /[^\/]*$/,
    rootIRI = /^(?:[^:]+:\/*)?[^\/]*/;

// The next ID for new blank nodes
var blankNodePrefix = 0, blankNodeCount = 0;

// ## Constructor
function N3Parser(options) {
  if (!(this instanceof N3Parser))
    return new N3Parser(options);
  this._tripleStack = [];
  this._graph = null;

  // Set the document IRI.
  options = options || {};
  if (!options.documentIRI) {
    this._baseIRI = null;
    this._baseIRIPath = null;
  }
  else {
    if (options.documentIRI.indexOf('#') > 0)
      throw new Error('Invalid document IRI');
    this._baseIRI = options.documentIRI;
    this._baseIRIPath = this._baseIRI.replace(documentPart, '');
    this._baseIRIRoot = this._baseIRI.match(rootIRI)[0];
  }

  // Set supported features depending on the format.
  var format = (typeof options.format === 'string') && options.format.match(/\w*$/)[0].toLowerCase(),
      isTurtle = format === 'turtle', isTriG = format === 'trig',
      isNTriples = /triple/.test(format), isNQuads = /quad/.test(format),
      isLineMode = isNTriples || isNQuads;
  if (!(this._supportsNamedGraphs = !isTurtle))
    this._readPredicateOrNamedGraph = this._readPredicate;
  this._supportsQuads = !(isTurtle || isTriG || isNTriples);
  // Disable relative IRIs in N-Triples or N-Quads mode
  if (isLineMode) {
    this._baseIRI = '';
    this._resolveIRI = function (token) {
      this._error('Disallowed relative IRI', token);
      return this._callback = noop, this._subject = null;
    };
  }
  this._blankNodePrefix = typeof options.blankNodePrefix !== 'string' ? '' :
                            '_:' + options.blankNodePrefix.replace(/^_:/, '');
  this._lexer = options.lexer || new N3Lexer({ lineMode: isLineMode });
}

// ## Private class methods

// ### `_resetBlankNodeIds` restarts blank node identification.
N3Parser._resetBlankNodeIds = function () {
  blankNodePrefix = blankNodeCount = 0;
};

N3Parser.prototype = {
  // ## Private methods

  // ### `_readInTopContext` reads a token when in the top context.
  _readInTopContext: function (token) {
    switch (token.type) {
    // If an EOF token arrives in the top context, signal that we're done.
    case 'eof':
      if (this._graph !== null)
        return this._error('Unclosed graph', token);
      delete this._prefixes._;
      return this._callback(null, null, this._prefixes);
    // It could be a prefix declaration.
    case '@prefix':
      this._sparqlStyle = false;
      return this._readPrefix;
    case 'PREFIX':
      this._sparqlStyle = true;
      return this._readPrefix;
    // It could be a base declaration.
    case '@base':
      this._sparqlStyle = false;
      return this._readBaseIRI;
    case 'BASE':
      this._sparqlStyle = true;
      return this._readBaseIRI;
    // It could be a graph.
    case '{':
      if (this._supportsNamedGraphs) {
        this._graph = '';
        this._subject = null;
        return this._readSubject;
      }
    case 'GRAPH':
      if (this._supportsNamedGraphs) {
        return this._readNamedGraphLabel;
      }
    // Otherwise, the next token must be a subject.
    default:
      return this._readSubject(token);
    }
  },

  // ### `_readSubject` reads a triple's subject.
  _readSubject: function (token) {
    this._predicate = null;
    switch (token.type) {
    case 'IRI':
      if (this._baseIRI === null || absoluteIRI.test(token.value))
        this._subject = token.value;
      else
        this._subject = this._resolveIRI(token);
      break;
    case 'prefixed':
      var prefix = this._prefixes[token.prefix];
      if (prefix === undefined)
        return this._error('Undefined prefix "' + token.prefix + ':"', token);
      this._subject = prefix + token.value;
      break;
    case '[':
      // Start a new triple with a new blank node as subject.
      this._subject = '_:b' + blankNodeCount++;
      this._tripleStack.push({ subject: this._subject, predicate: null, object: null, type: 'blank' });
      return this._readBlankNodeHead;
    case '(':
      // Start a new list
      this._tripleStack.push({ subject: RDF_NIL, predicate: null, object: null, type: 'list' });
      this._subject = null;
      return this._readListItem;
    case '}':
      return this._readPunctuation(token);
    default:
      return this._error('Expected subject but got ' + token.type, token);
    }
    // The next token must be a predicate,
    // or, if the subject was actually a graph IRI, a named graph.
    return this._readPredicateOrNamedGraph;
  },

  // ### `_readPredicate` reads a triple's predicate.
  _readPredicate: function (token) {
    var type = token.type;
    switch (type) {
    case 'IRI':
    case 'abbreviation':
      if (this._baseIRI === null || absoluteIRI.test(token.value))
        this._predicate = token.value;
      else
        this._predicate = this._resolveIRI(token);
      break;
    case 'prefixed':
      if (token.prefix === '_') {
        return this._error('Disallowed blank node as predicate', token);
      }
      else {
        var prefix = this._prefixes[token.prefix];
        if (prefix === undefined)
          return this._error('Undefined prefix "' + token.prefix + ':"', token);
        this._predicate = prefix + token.value;
      }
      break;
    case '.':
    case ']':
    case '}':
      // Expected predicate didn't come, must have been trailing semicolon.
      if (this._predicate === null)
        return this._error('Unexpected ' + type, token);
      this._subject = null;
      return type === ']' ? this._readBlankNodeTail(token) : this._readPunctuation(token);
    case ';':
      // Extra semicolons can be safely ignored
      return this._readPredicate;
    default:
      return this._error('Expected predicate to follow "' + this._subject + '"', token);
    }
    // The next token must be an object.
    return this._readObject;
  },

  // ### `_readObject` reads a triple's object.
  _readObject: function (token) {
    switch (token.type) {
    case 'IRI':
      if (this._baseIRI === null || absoluteIRI.test(token.value))
        this._object = token.value;
      else
        this._object = this._resolveIRI(token);
      break;
    case 'prefixed':
      var prefix = this._prefixes[token.prefix];
      if (prefix === undefined)
        return this._error('Undefined prefix "' + token.prefix + ':"', token);
      this._object = prefix + token.value;
      break;
    case 'literal':
      this._object = token.value;
      return this._readDataTypeOrLang;
    case '[':
      // Start a new triple with a new blank node as subject.
      var blank = '_:b' + blankNodeCount++;
      this._tripleStack.push({ subject: this._subject, predicate: this._predicate, object: blank, type: 'blank' });
      this._subject = blank;
      return this._readBlankNodeHead;
    case '(':
      // Start a new list
      this._tripleStack.push({ subject: this._subject, predicate: this._predicate, object: RDF_NIL, type: 'list' });
      this._subject = null;
      return this._readListItem;
    default:
      return this._error('Expected object to follow "' + this._predicate + '"', token);
    }
    return this._getTripleEndReader();
  },

  // ### `_readPredicateOrNamedGraph` reads a triple's predicate, or a named graph.
  _readPredicateOrNamedGraph: function (token) {
    return token.type === '{' ? this._readGraph(token) : this._readPredicate(token);
  },

  // ### `_readGraph` reads a graph.
  _readGraph: function (token) {
    if (token.type !== '{')
      return this._error('Expected graph but got ' + token.type, token);
    // The "subject" we read is actually the GRAPH's label
    this._graph = this._subject, this._subject = null;
    return this._readSubject;
  },

  // ### `_readBlankNodeHead` reads the head of a blank node.
  _readBlankNodeHead: function (token) {
    if (token.type === ']') {
      this._subject = null;
      return this._readBlankNodeTail(token);
    }
    this._predicate = null;
    return this._readPredicate(token);
  },

  // ### `_readBlankNodeTail` reads the end of a blank node.
  _readBlankNodeTail: function (token) {
    if (token.type !== ']')
      return this._readBlankNodePunctuation(token);

    // Store blank node triple.
    if (this._subject !== null)
      this._callback(null, { subject:   this._subject,
                             predicate: this._predicate,
                             object:    this._object,
                             graph:     this._graph || '' });

    // Restore parent triple that contains the blank node.
    var triple = this._tripleStack.pop();
    this._subject = triple.subject;
    // Was the blank node the object?
    if (triple.object !== null) {
      // Restore predicate and object as well, and continue by reading punctuation.
      this._predicate = triple.predicate;
      this._object = triple.object;
      return this._getTripleEndReader();
    }
    // The blank node was the subject, so continue reading the predicate.
    // If the blank node didn't contain any predicates, it could also be the label of a named graph.
    return this._predicate !== null ? this._readPredicate : this._readPredicateOrNamedGraph;
  },

  // ### `_readDataTypeOrLang` reads an _optional_ data type or language.
  _readDataTypeOrLang: function (token) {
    switch (token.type) {
    case 'type':
      var value;
      if (token.prefix === '') {
        if (this._baseIRI === null || absoluteIRI.test(token.value))
          value = token.value;
        else
          value = this._resolveIRI(token);
      }
      else {
        var prefix = this._prefixes[token.prefix];
        if (prefix === undefined)
          return this._error('Undefined prefix "' + token.prefix + ':"', token);
        value = prefix + token.value;
      }
      this._object += '^^' + value;
      return this._getTripleEndReader();
    case 'langcode':
      this._object += '@' + token.value.toLowerCase();
      return this._getTripleEndReader();
    default:
      return this._getTripleEndReader().call(this, token);
    }
  },

  // ### `_readListItem` reads items from a list.
  _readListItem: function (token) {
    var item = null,                  // The actual list item.
        itemHead = null,              // The head of the rdf:first predicate.
        prevItemHead = this._subject, // The head of the previous rdf:first predicate.
        stack = this._tripleStack,    // The stack of triples part of recursion (lists, blanks, etc.).
        parentTriple = stack[stack.length - 1], // The triple containing the current list.
        next = this._readListItem;    // The next function to execute.

    switch (token.type) {
    case 'IRI':
      item = token.value;
      break;
    case 'prefixed':
      var prefix = this._prefixes[token.prefix];
      if (prefix === undefined)
        return this._error('Undefined prefix "' + token.prefix + ':"', token);
      item = prefix + token.value;
      break;
    case 'literal':
      item = token.value;
      next = this._readDataTypeOrLang;
      break;
    case '[':
      // Stack the current list triple and start a new triple with a blank node as subject.
      itemHead = '_:b' + blankNodeCount++;
      item     = '_:b' + blankNodeCount++;
      stack.push({ subject: itemHead, predicate: RDF_FIRST, object: item, type: 'blank' });
      this._subject = item;
      next = this._readBlankNodeHead;
      break;
    case '(':
      // Stack the current list triple and start a new list
      itemHead = '_:b' + blankNodeCount++;
      stack.push({ subject: itemHead, predicate: RDF_FIRST, object: RDF_NIL, type: 'list' });
      this._subject = null;
      next = this._readListItem;
      break;
    case ')':
      // Restore the parent triple.
      stack.pop();
      // If this list is contained within a parent list, return the membership triple here.
      // This will be `<parent list element> rdf:first <this list>.`.
      if (stack.length !== 0 && stack[stack.length - 1].type === 'list')
        this._callback(null, { subject:   parentTriple.subject,
                               predicate: parentTriple.predicate,
                               object:    parentTriple.object,
                               graph:     this._graph || '' });
      // Restore the parent triple's subject.
      this._subject = parentTriple.subject;
      // Was this list in the parent triple's subject?
      if (parentTriple.predicate === null) {
        // The next token is the predicate.
        next = this._readPredicate;
        // Skip writing the list tail if this was an empty list.
        if (parentTriple.subject === RDF_NIL)
          return next;
      }
      // The list was in the parent triple's object.
      else {
        // Restore the parent triple's predicate and object as well.
        this._predicate = parentTriple.predicate;
        this._object = parentTriple.object;
        next = this._getTripleEndReader();
        // Skip writing the list tail if this was an empty list.
        if (parentTriple.object === RDF_NIL)
          return next;
      }
      // Close the list by making the item head nil.
      itemHead = RDF_NIL;
      break;
    default:
      return this._error('Expected list item instead of "' + token.type + '"', token);
    }

     // Create a new blank node if no item head was assigned yet.
    if (itemHead === null)
      this._subject = itemHead = '_:b' + blankNodeCount++;

    // Is this the first element of the list?
    if (prevItemHead === null) {
      // This list is either the object or the subject.
      if (parentTriple.object === RDF_NIL)
        parentTriple.object = itemHead;
      else
        parentTriple.subject = itemHead;
    }
    else {
      // The rest of the list is in the current head.
      this._callback(null, { subject:   prevItemHead,
                             predicate: RDF_REST,
                             object:    itemHead,
                             graph:     this._graph || '' });
    }
    // Add the item's value.
    if (item !== null)
      this._callback(null, { subject:   itemHead,
                             predicate: RDF_FIRST,
                             object:    item,
                             graph:     this._graph || '' });
    return next;
  },

  // ### `_readPunctuation` reads punctuation between triples or triple parts.
  _readPunctuation: function (token) {
    var next, subject = this._subject, graph = this._graph;
    switch (token.type) {
    // A closing brace ends a graph
    case '}':
      if (this._graph === null)
        return this._error('Unexpected graph closing', token);
      this._graph = null;
    // A dot just ends the statement, without sharing anything with the next.
    case '.':
      this._subject = null;
      next = this._readInTopContext;
      break;
    // Semicolon means the subject is shared; predicate and object are different.
    case ';':
      next = this._readPredicate;
      break;
    // Comma means both the subject and predicate are shared; the object is different.
    case ',':
      next = this._readObject;
      break;
    // An IRI means this is a quad (only allowed if not already inside a graph).
    case 'IRI':
      if (this._supportsQuads && this._graph === null) {
        if (this._baseIRI === null || absoluteIRI.test(token.value))
          graph = token.value;
        else
          graph = this._resolveIRI(token);
        subject = this._subject;
        next = this._readQuadPunctuation;
        break;
      }
    // An prefixed name means this is a quad (only allowed if not already inside a graph).
    case 'prefixed':
      if (this._supportsQuads && this._graph === null) {
        var prefix = this._prefixes[token.prefix];
        if (prefix === undefined)
          return this._error('Undefined prefix "' + token.prefix + ':"', token);
        graph = prefix + token.value;
        next = this._readQuadPunctuation;
        break;
      }
    default:
      return this._error('Expected punctuation to follow "' + this._object + '"', token);
    }
    // A triple has been completed now, so return it.
    if (subject !== null)
      this._callback(null, { subject:   subject,
                             predicate: this._predicate,
                             object:    this._object,
                             graph:     graph || '' });
    return next;
  },

    // ### `_readBlankNodePunctuation` reads punctuation in a blank node
  _readBlankNodePunctuation: function (token) {
    var next;
    switch (token.type) {
    // Semicolon means the subject is shared; predicate and object are different.
    case ';':
      next = this._readPredicate;
      break;
    // Comma means both the subject and predicate are shared; the object is different.
    case ',':
      next = this._readObject;
      break;
    default:
      return this._error('Expected punctuation to follow "' + this._object + '"', token);
    }
    // A triple has been completed now, so return it.
    this._callback(null, { subject:   this._subject,
                           predicate: this._predicate,
                           object:    this._object,
                           graph:     this._graph || '' });
    return next;
  },

  // ### `_readQuadPunctuation` reads punctuation after a quad.
  _readQuadPunctuation: function (token) {
    if (token.type !== '.')
      return this._error('Expected dot to follow quad', token);
    return this._readInTopContext;
  },

  // ### `_readPrefix` reads the prefix of a prefix declaration.
  _readPrefix: function (token) {
    if (token.type !== 'prefix')
      return this._error('Expected prefix to follow @prefix', token);
    this._prefix = token.value;
    return this._readPrefixIRI;
  },

  // ### `_readPrefixIRI` reads the IRI of a prefix declaration.
  _readPrefixIRI: function (token) {
    if (token.type !== 'IRI')
      return this._error('Expected IRI to follow prefix "' + this._prefix + ':"', token);
    var prefixIRI;
    if (this._baseIRI === null || absoluteIRI.test(token.value))
      prefixIRI = token.value;
    else
      prefixIRI = this._resolveIRI(token);
    this._prefixes[this._prefix] = prefixIRI;
    this._prefixCallback(this._prefix, prefixIRI);
    return this._readDeclarationPunctuation;
  },

  // ### `_readBaseIRI` reads the IRI of a base declaration.
  _readBaseIRI: function (token) {
    if (token.type !== 'IRI')
      return this._error('Expected IRI to follow base declaration', token);
    if (token.value.indexOf('#') > 0)
      return this._error('Invalid base IRI', token);
    if (this._baseIRI === null || absoluteIRI.test(token.value))
      this._baseIRI = token.value;
    else
      this._baseIRI = this._resolveIRI(token);
    this._baseIRIPath = this._baseIRI.replace(documentPart, '');
    this._baseIRIRoot = this._baseIRI.match(rootIRI)[0];
    return this._readDeclarationPunctuation;
  },

  // ### `_readNamedGraphLabel` reads the label of a named graph.
  _readNamedGraphLabel: function (token) {
    switch (token.type) {
    case 'IRI':
    case 'prefixed':
      return this._readSubject(token), this._readGraph;
    case '[':
      return this._readNamedGraphBlankLabel;
    default:
      return this._error('Invalid graph label', token);
    }
  },

  // ### `_readNamedGraphLabel` reads a blank node label of a named graph.
  _readNamedGraphBlankLabel: function (token) {
    if (token.type !== ']')
      return this._error('Invalid graph label', token);
    this._subject = '_:b' + blankNodeCount++;
    return this._readGraph;
  },

  // ### `_readDeclarationPunctuation` reads the punctuation of a declaration.
  _readDeclarationPunctuation: function (token) {
    // SPARQL-style declarations don't have punctuation.
    if (this._sparqlStyle)
      return this._readInTopContext(token);

    if (token.type !== '.')
      return this._error('Expected declaration to end with a dot', token);
    return this._readInTopContext;
  },

  // ### `_getTripleEndReader` gets the next reader function at the end of a triple.
  _getTripleEndReader: function () {
    var stack = this._tripleStack;
    if (stack.length === 0)
      return this._readPunctuation;

    switch (stack[stack.length - 1].type) {
    case 'blank':
      return this._readBlankNodeTail;
    case 'list':
      return this._readListItem;
    }
  },

  // ### `_error` emits an error message through the callback.
  _error: function (message, token) {
    this._callback(new Error(message + ' at line ' + token.line + '.'));
  },

  // ### `_resolveIRI` resolves an IRI token against the base path
  _resolveIRI: function (token) {
    var iri = token.value;
    switch (iri[0]) {
    // An empty relative IRI indicates the base IRI
    case undefined:
      return this._baseIRI;
    // Resolve relative fragment IRIs against the base IRI
    case '#':
      return this._baseIRI     + iri;
    // Resolve relative query string IRIs by replacing the query string
    case '?':
      return this._baseIRI.replace(/(?:\?.*)?$/, iri);
    // Resolve root relative IRIs at the root of the base IRI
    case '/':
      return this._baseIRIRoot + iri;
    // Resolve all other IRIs at the base IRI's path
    default:
      return this._baseIRIPath + iri;
    }
  },

  // ## Public methods

  // ### `parse` parses the N3 input and emits each parsed triple through the callback.
  parse: function (input, tripleCallback, prefixCallback) {
    // The read callback is the next function to be executed when a token arrives.
    // We start reading in the top context.
    this._readCallback = this._readInTopContext;
    this._prefixes = Object.create(null);
    this._prefixes._ = this._blankNodePrefix || '_:b' + blankNodePrefix++ + '_';

    // If the input argument is not given, shift parameters
    if (typeof input === 'function')
      prefixCallback = tripleCallback, tripleCallback = input, input = null;

    // Set the triple and prefix callbacks.
    this._callback = tripleCallback || noop;
    this._prefixCallback = prefixCallback || noop;

    // Execute the read callback when a token arrives.
    var self = this;
    this._lexer.tokenize(input, function (error, token) {
      if (error !== null)
        self._callback(error), self._callback = noop;
      else if (self._readCallback !== undefined)
        self._readCallback = self._readCallback(token);
    });

    // If no input was given, it can be added with `addChunk` and ended with `end`
    if (!input) {
      this.addChunk = this._lexer.addChunk;
      this.end = this._lexer.end;
    }
  }
};

// The empty function
function noop() {}

// ## Exports

// Export the `N3Parser` class as a whole.
module.exports = N3Parser;

},{"./N3Lexer":35}],37:[function(_dereq_,module,exports){
// imports
var SparqlParser = _dereq_("./parser");
var Utils = _dereq_("./utils");
var _ = Utils;

function NonSupportedSparqlFeatureError(feature, message) {
    this.name = "NonSupportedSparqlFeatureError";
    this.feature = feature;
    this.message = message || "SPARQL feature "+feature+" non supported";
}
NonSupportedSparqlFeatureError.prototype = new Error();
NonSupportedSparqlFeatureError.constructor = NonSupportedSparqlFeatureError;

function SparqlParserError(message) {
    this.name = ParserError;
    this.message = message || "Error parsing SPARQL query";
}
SparqlParserError.prototype = new Error();
SparqlParserError.constructor = SparqlParserError;


/**
 * @doc
 *
 * Based on <http://www.w3.org/2001/sw/DataAccess/rq23/rq24-algebra.html>
 * W3C's note
 */
AbstractQueryTree = function() {
};

AbstractQueryTree.prototype.parseQueryString = function(query_string) {
        return SparqlParser.parse(query_string);
};

AbstractQueryTree.prototype.parseExecutableUnit = function(executableUnit) {
    if(executableUnit.kind === 'select') {
        return this.parseSelect(executableUnit);
    } else if(executableUnit.kind === 'ask') {
        return this.parseSelect(executableUnit);
    } else if(executableUnit.kind === 'modify') {
        return this.parseSelect(executableUnit);
    } else if(executableUnit.kind === 'construct') {
        return this.parseSelect(executableUnit);
    } else if(executableUnit.kind === 'insertdata') {
        return this.parseInsertData(executableUnit);
    } else if(executableUnit.kind === 'deletedata') {
        return this.parseInsertData(executableUnit);
    } else if(executableUnit.kind === 'load') {
        return executableUnit;
    } else if(executableUnit.kind === 'clear') {
        return executableUnit;
    } else if(executableUnit.kind === 'drop') {
        return executableUnit;
    } else if(executableUnit.kind === 'create') {
        return executableUnit;
    } else {
        throw new Error('unknown executable unit: ' + executableUnit.kind);
    }
};

AbstractQueryTree.prototype.parseSelect = function(syntaxTree){

    if(syntaxTree == null) {
        console.log("error parsing query");
        return null;
    } else {
        var env = { freshCounter: 0 };
        syntaxTree.pattern = this.build(syntaxTree.pattern, env);
        return syntaxTree;
    }
};

AbstractQueryTree.prototype.parseInsertData = function(syntaxTree){
    if(syntaxTree == null) {
        console.log("error parsing query");
        return null;
    } else {
        return syntaxTree;
    }
};

AbstractQueryTree.prototype.build = function(node, env) {
    if(node.token === 'groupgraphpattern') {
        return this._buildGroupGraphPattern(node, env);
    } else if (node.token === 'basicgraphpattern') {
        var bgp = {
            kind: 'BGP',
            value: node.triplesContext
        };
        bgp = AbstractQueryTree.translatePathExpressionsInBGP(bgp, env);
        return bgp;
    } else if (node.token === 'graphunionpattern') {
        var a = this.build(node.value[0],env);
        var b = this.build(node.value[1],env);

        return {
            kind: 'UNION',
            value: [a,b]
        };
    } else if(node.token === 'graphgraphpattern') {
        var c = this.build(node.value, env);
        return {
            kind: 'GRAPH',
            value: c,
            graph: node.graph
        };
    } else {
        if(node.token != null) {
            throw new NonSupportedSparqlFeatureError(node.token, "Non implemented SPARQL graph pattern: '" + node.token+"'");
        } else {
            throw new SparqlParserError("Error parsing graph pattern: '"+JSON.stringify(node)+"'");
        }
    }
};

AbstractQueryTree.translatePathExpressionsInBGP = function(bgp, env) {
    var pathExpression;
    var before = [], rest, bottomJoin;
    for(var i=0; i<bgp.value.length; i++) {
        if(bgp.value[i].predicate && bgp.value[i].predicate.token === 'path') {
            //console.log("FOUND A PATH");
            pathExpression = bgp.value[i];
            rest = bgp.value.slice(i+1);
            var bgpTransformed = AbstractQueryTree.translatePathExpression(pathExpression, env);
            var optionalPattern = null;
            //console.log("BACK FROM TRANSFORMED");
            if(bgpTransformed.kind === 'BGP') {
                before = before.concat(bgpTransformed.value);
            } else if(bgpTransformed.kind === 'ZERO_OR_MORE_PATH' || bgpTransformed.kind === 'ONE_OR_MORE_PATH'){
                //console.log("BEFORE");
                //console.log(bgpTransformed);


                if(before.length > 0) {
                    bottomJoin =  {kind: 'JOIN',
                        lvalue: {kind: 'BGP', value:before},
                        rvalue: bgpTransformed};
                } else {
                    bottomJoin = bgpTransformed;
                }


                if(bgpTransformed.kind === 'ZERO_OR_MORE_PATH') {
                    if(bgpTransformed.y.token === 'var' && bgpTransformed.y.value.indexOf("fresh:")===0 &&
                        bgpTransformed.x.token === 'var' && bgpTransformed.x.value.indexOf("fresh:")===0) {
                        //console.log("ADDING EXTRA PATTERN 1)");
                        for(var j=0; j<bgp.value.length; j++) {
                            //console.log(bgp.value[j]);
                            if(bgp.value[j].object && bgp.value[j].object.token === 'var' && bgp.value[j].object.value === bgpTransformed.x.value) {
                                //console.log(" YES 1)");
                                optionalPattern = _.clone(bgp.value[j], true);
                                optionalPattern.object = bgpTransformed.y;
                            }
                        }
                    } else if(bgpTransformed.y.token === 'var' && bgpTransformed.y.value.indexOf("fresh:")===0) {
                        //console.log("ADDING EXTRA PATTERN 2)");
                        for(var j=0; j<bgp.value.length; j++) {
                            //console.log(bgp.value[j]);
                            if(bgp.value[j].subject && bgp.value[j].subject.token === 'var' && bgp.value[j].subject.value === bgpTransformed.y.value) {
                                //console.log(" YES 2)");
                                optionalPattern = _.clone(bgp.value[j],true);
                                optionalPattern.subject = bgpTransformed.x;
                            }
                        }
                    }
                }

                if(rest.length >0) {
                    //console.log("(2a)")
                    var rvalueJoin = AbstractQueryTree.translatePathExpressionsInBGP({kind: 'BGP', value: rest}, env);
                    //console.log("got rvalue");
                    if(optionalPattern != null) {
                        var optionals = before.concat([optionalPattern]).concat(rest);
                        return { kind: 'UNION',
                            value: [{ kind: 'JOIN',
                                lvalue: bottomJoin,
                                rvalue: rvalueJoin },
                                {kind: 'BGP',
                                    value: optionals}] };
                    } else {
                        return { kind: 'JOIN',
                            lvalue: bottomJoin,
                            rvalue: rvalueJoin };
                    }
                } else {
                    //console.log("(2b)")
                    return bottomJoin;
                }

            } else {
                // @todo ????
                return bgpTransformed;
            }
        } else {
            before.push(bgp.value[i]);
        }
    }

    //console.log("returning");
    bgp.value = before;
    return bgp;
};


AbstractQueryTree.translatePathExpression  = function(pathExpression, env) {
    // add support for different path patterns
    if(pathExpression.predicate.kind === 'element') {
        // simple paths, maybe modified
        if(pathExpression.predicate.modifier === '+') {
            pathExpression.predicate.modifier = null;
            var expandedPath = AbstractQueryTree.translatePathExpression(pathExpression, env);
            return {kind: 'ONE_OR_MORE_PATH',
                path: expandedPath,
                x: pathExpression.subject,
                y: pathExpression.object};
        } else if(pathExpression.predicate.modifier === '*') {
            pathExpression.predicate.modifier = null;
            var expandedPath = AbstractQueryTree.translatePathExpression(pathExpression, env);
            return {kind: 'ZERO_OR_MORE_PATH',
                path: expandedPath,
                x: pathExpression.subject,
                y: pathExpression.object};
        } else {
            pathExpression.predicate = pathExpression.predicate.value;
            return {kind: 'BGP', value: [pathExpression]};
        }
    } else if(pathExpression.predicate.kind === 'sequence') {
        var currentSubject = pathExpression.subject;
        var lastObject = pathExpression.object;
        var currentGraph = pathExpression.graph;
        var nextObject, chain;
        var restTriples = [];
        for(var i=0; i< pathExpression.predicate.value.length; i++) {
            if(i!=pathExpression.predicate.value.length-1) {
                nextObject = {
                    token: "var",
                    value: "fresh:"+env.freshCounter
                };
                env.freshCounter++;
            } else {
                nextObject = lastObject;
            }

            // @todo
            // what if the predicate is a path with
            // '*'? same fresh va in subject and object??
            chain = {
                subject: currentSubject,
                predicate: pathExpression.predicate.value[i],
                object: nextObject
            };

            if(currentGraph != null)
                chain.graph =_.clone(currentGraph,true);

            restTriples.push(chain);

            if(i!=pathExpression.predicate.value.length-1)
                currentSubject = _.clone(nextObject,true);
        }
        var bgp = {kind: 'BGP', value: restTriples};
        //console.log("BEFORE (1):");
        //console.log(bgp);
        //console.log("--------------");
        return AbstractQueryTree.translatePathExpressionsInBGP(bgp, env);
    } else {
        throw new NonSupportedSparqlFeatureError("Non supported path expression "+pathExpression.predicate.kind);
    }
};

AbstractQueryTree.prototype._buildGroupGraphPattern = function(node, env) {
    var f = (node.filters || []);
    var g = {kind: "EMPTY_PATTERN"};

    for(var i=0; i<node.patterns.length; i++) {
        var pattern = node.patterns[i];
        if(pattern.token === 'optionalgraphpattern') {
            var parsedPattern = this.build(pattern.value,env);
            if(parsedPattern.kind === 'FILTER') {
                g =  { kind:'LEFT_JOIN',
                    lvalue: g,
                    rvalue: parsedPattern.value,
                    filter: parsedPattern.filter };
            } else {
                g = { kind:'LEFT_JOIN',
                    lvalue: g,
                    rvalue: parsedPattern,
                    filter: true };
            }
        } else {
            var parsedPattern = this.build(pattern,env);
            if(g.kind == "EMPTY_PATTERN") {
                g = parsedPattern;
            } else {
                g = { kind: 'JOIN',
                    lvalue: g,
                    rvalue: parsedPattern };
            }
        }
    }

    if(f.length != 0) {
        if(g.kind === 'EMPTY_PATTERN') {
            return { kind: 'FILTER',
                filter: f,
                value: g};
        } else if(g.kind === 'LEFT_JOIN' && g.filter === true) {
            return { kind: 'FILTER',
                filter: f,
                value: g};

//            g.filter = f;
//            return g;
        } else if(g.kind === 'LEFT_JOIN') {
            return { kind: 'FILTER',
                filter: f,
                value: g};
        } else if(g.kind === 'JOIN') {
            return { kind: 'FILTER',
                filter: f,
                value: g};
        } else if(g.kind === 'UNION') {
            return { kind: 'FILTER',
                filter: f,
                value: g};
        } else if(g.kind === 'GRAPH') {
            return { kind: 'FILTER',
                filter: f,
                value: g};
        } else if(g.kind === 'BGP') {
            return { kind: 'FILTER',
                filter: f,
                value: g};
        } else {
            throw new Error("Unknow kind of algebra expression: "+ g.kind);
        }
    } else {
        return g;
    }
};

/**
 * Collects basic triple pattern in a complex SPARQL AQT
 */
AbstractQueryTree.prototype.collectBasicTriples = function(aqt, acum) {
    if(acum == null) {
        acum = [];
    }

    if(aqt.kind === 'select') {
        acum = this.collectBasicTriples(aqt.pattern,acum);
    } else if(aqt.kind === 'BGP') {
        acum = acum.concat(aqt.value);
    } else if(aqt.kind === 'ZERO_OR_MORE_PATH') {
        acum = this.collectBasicTriples(aqt.path);
    } else if(aqt.kind === 'UNION') {
        acum = this.collectBasicTriples(aqt.value[0],acum);
        acum = this.collectBasicTriples(aqt.value[1],acum);
    } else if(aqt.kind === 'GRAPH') {
        acum = this.collectBasicTriples(aqt.value,acum);
    } else if(aqt.kind === 'LEFT_JOIN' || aqt.kind === 'JOIN') {
        acum = this.collectBasicTriples(aqt.lvalue, acum);
        acum = this.collectBasicTriples(aqt.rvalue, acum);
    } else if(aqt.kind === 'FILTER') {
        acum = this.collectBasicTriples(aqt.value, acum);
    } else if(aqt.kind === 'construct') {
        acum = this.collectBasicTriples(aqt.pattern,acum);
    } else if(aqt.kind === 'EMPTY_PATTERN') {
        // nothing
    } else {
        throw "Unknown pattern: "+aqt.kind;
    }

    return acum;
};

/**
 * Replaces bindings in an AQT
 */
AbstractQueryTree.prototype.bind = function(aqt, bindings) {
    if(aqt.graph != null && aqt.graph.token && aqt.graph.token === 'var' &&
        bindings[aqt.graph.value] != null) {
        aqt.graph = bindings[aqt.graph.value];
    }
    if(aqt.filter != null) {
        var acum = [];
        for(var i=0; i< aqt.filter.length; i++) {
            aqt.filter[i].value = this._bindFilter(aqt.filter[i].value, bindings);
            acum.push(aqt.filter[i]);
        }
        aqt.filter = acum;
    }
    if(aqt.kind === 'select') {
        aqt.pattern = this.bind(aqt.pattern, bindings);
        //acum = this.collectBasicTriples(aqt.pattern,acum);
    } else if(aqt.kind === 'BGP') {
        aqt.value = this._bindTripleContext(aqt.value, bindings);
        //acum = acum.concat(aqt.value);
    } else if(aqt.kind === 'ZERO_OR_MORE_PATH') {
        aqt.path = this._bindTripleContext(aqt.path, bindings);
        if(aqt.x && aqt.x.token === 'var' && bindings[aqt.x.value] != null) {
            aqt.x = bindings[aqt.x.value];
        }
        if(aqt.y && aqt.y.token === 'var' && bindings[aqt.y.value] != null) {
            aqt.y = bindings[aqt.y.value];
        }
    } else if(aqt.kind === 'UNION') {
        aqt.value[0] = this.bind(aqt.value[0],bindings);
        aqt.value[1] = this.bind(aqt.value[1],bindings);
    } else if(aqt.kind === 'GRAPH') {
        aqt.value = this.bind(aqt.value,bindings);
    } else if(aqt.kind === 'LEFT_JOIN' || aqt.kind === 'JOIN') {
        aqt.lvalue = this.bind(aqt.lvalue, bindings);
        aqt.rvalue = this.bind(aqt.rvalue, bindings);
    } else if(aqt.kind === 'FILTER') {
        aqt.filter = this._bindFilter(aqt.filter[i].value, bindings);
    } else if(aqt.kind === 'EMPTY_PATTERN') {
        // nothing
    } else {
        throw "Unknown pattern: "+aqt.kind;
    }

    return aqt;
};

AbstractQueryTree.prototype._bindTripleContext = function(triples, bindings) {
    for(var i=0; i<triples.length; i++) {
        delete triples[i]['graph'];
        delete triples[i]['variables'];
        for(var p in triples[i]) {
            var comp = triples[i][p];
            if(comp.token === 'var' && bindings[comp.value] != null) {
                triples[i][p] = bindings[comp.value];
            }
        }
    }

    return triples;
};


AbstractQueryTree.prototype._bindFilter = function(filterExpr, bindings) {
    if(filterExpr.expressionType != null) {
        var expressionType = filterExpr.expressionType;
        if(expressionType == 'relationalexpression') {
            filterExpr.op1 = this._bindFilter(filterExpr.op1, bindings);
            filterExpr.op2 = this._bindFilter(filterExpr.op2, bindings);
        } else if(expressionType == 'conditionalor' || expressionType == 'conditionaland') {
            for(var i=0; i< filterExpr.operands.length; i++) {
                filterExpr.operands[i] = this._bindFilter(filterExpr.operands[i], bindings);
            }
        } else if(expressionType == 'additiveexpression') {
            filterExpr.summand = this._bindFilter(filterExpr.summand, bindings);
            for(var i=0; i<filterExpr.summands.length; i++) {
                filterExpr.summands[i].expression = this._bindFilter(filterExpr.summands[i].expression, bindings);
            }
        } else if(expressionType == 'builtincall') {
            for(var i=0; i<filterExpr.args.length; i++) {
                filterExpr.args[i] = this._bindFilter(filterExpr.args[i], bindings);
            }
        } else if(expressionType == 'multiplicativeexpression') {
            filterExpr.factor = this._bindFilter(filterExpr.factor, bindings);
            for(var i=0; i<filterExpr.factors.length; i++) {
                filterExpr.factors[i].expression = this._bindFilter(filterExpr.factors[i].expression, bindings);
            }
        } else if(expressionType == 'unaryexpression') {
            filterExpr.expression = this._bindFilter(filterExpr.expression, bindings);
        } else if(expressionType == 'irireforfunction') {
            for(var i=0; i<filterExpr.factors.args; i++) {
                filterExpr.args[i] = this._bindFilter(filterExpr.args[i], bindings);
            }
        } else if(expressionType == 'atomic') {
            if(filterExpr.primaryexpression == 'var') {
                // lookup the var in the bindings
                if(bindings[filterExpr.value.value] != null) {
                    var val = bindings[filterExpr.value.value];
                    if(val.token === 'uri') {
                        filterExpr.primaryexpression = 'iri';
                    } else {
                        filterExpr.primaryexpression = 'literal';
                    }
                    filterExpr.value = val;
                }
            }
        }
    }

    return filterExpr;
};

/**
 * Replaces terms in an AQT
 */
AbstractQueryTree.prototype.replace = function(aqt, from, to, ns) {
    if(aqt.graph != null && aqt.graph.token && aqt.graph.token === from.token &&
        aqt.graph.value == from.value) {
        aqt.graph = _.clone(to,true);
    }
    if(aqt.filter != null) {
        var acum = [];
        for(var i=0; i< aqt.filter.length; i++) {
            aqt.filter[i].value = this._replaceFilter(aqt.filter[i].value, from, to, ns);
            acum.push(aqt.filter[i]);
        }
        aqt.filter = acum;
    }
    if(aqt.kind === 'select') {
        aqt.pattern = this.replace(aqt.pattern, from, to, ns);
    } else if(aqt.kind === 'BGP') {
        aqt.value = this._replaceTripleContext(aqt.value, from, to, ns);
    } else if(aqt.kind === 'ZERO_OR_MORE_PATH') {
        aqt.path = this._replaceTripleContext(aqt.path, from,to, ns);
        if(aqt.x && aqt.x.token === from.token && aqt.value === from.value) {
            aqt.x = _.clone(to,true);
        }
        if(aqt.y && aqt.y.token === from.token && aqt.value === from.value) {
            aqt.y = _.clone(to,true);
        }
    } else if(aqt.kind === 'UNION') {
        aqt.value[0] = this.replace(aqt.value[0],from,to, ns);
        aqt.value[1] = this.replace(aqt.value[1],from,to, ns);
    } else if(aqt.kind === 'GRAPH') {
        aqt.value = this.replace(aqt.value,from,to);
    } else if(aqt.kind === 'LEFT_JOIN' || aqt.kind === 'JOIN') {
        aqt.lvalue = this.replace(aqt.lvalue, from, to, ns);
        aqt.rvalue = this.replace(aqt.rvalue, from, to, ns);
    } else if(aqt.kind === 'FILTER') {
        aqt.value = this._replaceFilter(aqt.value, from,to, ns);
    } else if(aqt.kind === 'EMPTY_PATTERN') {
        // nothing
    } else {
        throw "Unknown pattern: "+aqt.kind;
    }

    return aqt;
};

AbstractQueryTree.prototype._replaceTripleContext = function(triples, from, to, ns) {
    for(var i=0; i<triples.length; i++) {
        for(var p in triples[i]) {
            var comp = triples[i][p];
            if(comp.token === 'var' && from.token === 'var' && comp.value === from.value) {
                triples[i][p] = to;
            } else if(comp.token === 'blank' && from.token === 'blank' && comp.value === from.value) {
                triples[i][p] = to;
            } else {
                if((comp.token === 'literal' || comp.token ==='uri') &&
                    (from.token === 'literal' || from.token ==='uri') &&
                    comp.token === from.token && Utils.lexicalFormTerm(comp,ns)[comp.token] === Utils.lexicalFormTerm(from,ns)[comp.token]) {
                    triples[i][p] = to;
                }
            }
        }
    }

    return triples;
};


AbstractQueryTree.prototype._replaceFilter = function(filterExpr, from, to, ns) {
    if(filterExpr.expressionType != null) {
        var expressionType = filterExpr.expressionType;
        if(expressionType == 'relationalexpression') {
            filterExpr.op1 = this._replaceFilter(filterExpr.op1, from, to, ns);
            filterExpr.op2 = this._replaceFilter(filterExpr.op2, from, to, ns);
        } else if(expressionType == 'conditionalor' || expressionType == 'conditionaland') {
            for(var i=0; i< filterExpr.operands.length; i++) {
                filterExpr.operands[i] = this._replaceFilter(filterExpr.operands[i], from, to, ns);
            }
        } else if(expressionType == 'additiveexpression') {
            filterExpr.summand = this._replaceFilter(filterExpr.summand, from, to, ns);
            for(var i=0; i<filterExpr.summands.length; i++) {
                filterExpr.summands[i].expression = this._replaceFilter(filterExpr.summands[i].expression, from, to, ns);
            }
        } else if(expressionType == 'builtincall') {
            for(var i=0; i<filterExpr.args.length; i++) {
                filterExpr.args[i] = this._replaceFilter(filterExpr.args[i], from, to, ns);
            }
        } else if(expressionType == 'multiplicativeexpression') {
            filterExpr.factor = this._replaceFilter(filterExpr.factor, from, to, ns);
            for(var i=0; i<filterExpr.factors.length; i++) {
                filterExpr.factors[i].expression = this._replaceFilter(filterExpr.factors[i].expression, from, to, ns);
            }
        } else if(expressionType == 'unaryexpression') {
            filterExpr.expression = this._replaceFilter(filterExpr.expression, from, to, ns);
        } else if(expressionType == 'irireforfunction') {
            for(var i=0; i<filterExpr.factors.args; i++) {
                filterExpr.args[i] = this._replaceFilter(filterExpr.args[i], from, to, ns);
            }
        } else if(expressionType == 'atomic') {
            var val = null;
            if(filterExpr.primaryexpression == from.token && filterExpr.value == from.value) {
                val = to.value;
            } else if(filterExpr.primaryexpression == 'iri' && from.token == 'uri' && filterExpr.value == from.value) {
                val = to.value;
            }


            if(val != null) {
                if(to.token === 'uri') {
                    filterExpr.primaryexpression = 'iri';
                } else {
                    filterExpr.primaryexpression = to.token;
                }
                filterExpr.value = val;
            }
        }
    }

    return filterExpr;
};

AbstractQueryTree.prototype.treeWithUnion = function(aqt) {
    if(aqt == null)
        return false;
    if(aqt.kind == null)
        return false;
    if(aqt.kind === 'select') {
        return this.treeWithUnion(aqt.pattern);
    } else if(aqt.kind === 'BGP') {
        return this.treeWithUnion(aqt.value);
    } else if(aqt.kind === 'ZERO_OR_MORE_PATH') {
        return false;
    } else if(aqt.kind === 'UNION') {
        if(aqt.value[0].value != null && aqt.value[0].value.variables != null &&
            aqt.value[1].value != null && aqt.value[1].value.variables != null) {
            if(aqt.value[0].variables.join("/") === aqt.values[1].variables.join("/")) {
                if(this.treeWithUnion(aqt.value[0]))
                    return true;
                else
                    return this.treeWithUnion(aqt.value[1]);
            }
        } else {
            return true;
        }
    } else if(aqt.kind === 'GRAPH') {
        return false;
    } else if(aqt.kind === 'LEFT_JOIN' || aqt.kind === 'JOIN') {
        var leftUnion  = this.treeWithUnion(aqt.lvalue);
        if(leftUnion)
            return true;
        else
            this.treeWithUnion(aqt.rvalue);
    } else if(aqt.kind === 'FILTER') {
        return false;
    } else if(aqt.kind === 'EMPTY_PATTERN') {
        return false;
    } else {
        return false;
    }
};

module.exports = {
    AbstractQueryTree: AbstractQueryTree,
    NonSupportedSparqlFeatureError: NonSupportedSparqlFeatureError,
    SparqlParserError: SparqlParserError
};

},{"./parser":44,"./utils":55}],38:[function(_dereq_,module,exports){
"use strict";

var utils = _dereq_('./utils');
var async = utils;
var nextTick = utils.nextTick;

var left = -1;
var right = 1;

/**
 * @doc
 * Implementation based on <http://www.gossamer-threads.com/lists/linux/kernel/667935>
 *
 */

/**
 * Tree
 *
 * Implements the interface of BinarySearchTree.Tree
 *
 * An implementation of an in memory B-Tree.
 */
var Tree = function(order,f) {
    if(arguments.length != 0) {
        this.order = order;
        this.root = this._allocateNode();
        this.root.isLeaf = true;
        this.root.level = 0;
        var that = this;
        this._diskWrite(this.root, function(root){
            that.root = root;
            that._updateRootNode(that.root, function(n){
                that.comparator = function(a,b) {
                    if(a < b) {
                        return -1;
                    } else if(a > b){
                        return 1;
                    } else {
                        return 0;
                    }
                };
                that.merger = null;
                // we notify we are ready
                if(f!=null) {
                    f(that);
                }
            })});
    }
};

/**
 * Creates the new node.
 *
 * This class can be overwritten by different versions of
 * the tree t select the right kind of node to be used
 *
 * @returns the new alloacted node
 */
Tree.prototype._allocateNode = function() {
    return new Node();
};

/**
 * _diskWrite
 *
 * Persists the node to secondary memory.
 */
Tree.prototype._diskWrite= function(node, f) {
    // dummy implementation;
    // no-op
    nextTick(function(){
        f(node);
    });
};


/**
 * _diskRead
 *
 * Retrieves a node from secondary memory using the provided
 * pointer
 */
Tree.prototype._diskRead = function(pointer, f) {
    // dummy implementation;
    // no-op
    nextTick(function() {
        f(pointer);
    });
};

Tree.prototype._diskDelete= function(node,f) {
    // dummy implementation
    // no-op
    nextTick(function() {
        f();
    });
};


/**
 * _updateRootNode
 *
 * Updates the pointer to the root node stored in disk.
 */
Tree.prototype._updateRootNode = function(node,f) {
    // dummy implementation;
    // no-op
    f(node)
};


/**
 * search
 *
 * Retrieves the node matching the given value.
 * If no node is found, null is returned.
 */
Tree.prototype.search = function(key,f, checkExists) {
    var node = this.root;
    var tree = this;
    tree.__search(tree,key,node,f, checkExists);
};
Tree.prototype.__search = function (tree, key, node, f, checkExists) {
    var idx = 0;
    while (idx < node.numberActives && tree.comparator(key, node.keys[idx].key) === 1) {
        idx++;
    }

    if (idx < node.numberActives && tree.comparator(node.keys[idx].key, key) === 0) {
        if (checkExists != null && checkExists == true) {
            f(true);
        } else {
            f(node.keys[idx].data);
        }
    } else {
        if (node.isLeaf === true) {
            f(null)
        } else {
            tree._diskRead(node.children[idx], function (node) {
                tree.__search(tree, key, node, f, checkExists)
            });
        }
    }
};


/**
 * walk
 * Applies a function to all the nodes key and data in the the
 * tree in key order.
 */
Tree.prototype.walk = function(f,e) {
    this.__walk(this,this.root,f,e);
};
Tree.prototype.__walk = function(tree,node,f,callback) {
    var max = node.numberActives;
    var i = 0;
    if(node.isLeaf) {
        for(i=0; i<node.numberActives; i++) {
            f(node.keys[i]);
        }
        return callback();
    } else {
        async.whilst(function(){
            return i < max;
        },function(c){
            tree._diskRead(node.children[i], function(n){
                tree.__walk(tree,n,f,function(){
                    tree._diskRead(node.keys[i], function(n){
                        f(n);
                        i++;
                        c();
                    })
                });
            });
        },function(){
            tree._diskRead(node.children[max],function(node){
                tree.__walk(tree,node,f,function(){callback();});
            });
        });
    }
};


/**
 * walkNodes
 * Applies a function to all the nodes in the the
 * tree in key order.
 */
Tree.prototype.walkNodes = function(f) {
    this.__walkNodes(this,root,f,function(){});
};
Tree.prototype.__walkNodes = function(tree,node,f,callback) {
    if(node.isLeaf) {
        f(node);
        return callback();
    } else {
        f(node);
        var max = node.numberActives;
        var i = 0;
        async.whilst(function(){
            return i<max;
        }, function(c){
            tree._diskRead(node.children[i], function(n){
                tree.__walkNodes(tree,n,f,function(){
                    i++;
                    c();
                });
            });
        },function(){
            tree._diskRead(node.children[max],function(n){
                tree.__walkNodes(tree,n,f,function(){});
            });
        });
    }
};

/**
 * _splitChild
 *
 * Split the child node and adjusts the parent.
 */
Tree.prototype._splitChild = function(parent, index, child, callback) {
    var newChild = this._allocateNode();
    newChild.isLeaf = child.isLeaf;
    newChild.level = child.level;
    newChild.numberActives = this.order - 1;

    // Copy the higher order keys to the new child
    var newParentChild = child.keys[this.order-1];
    child.keys[this.order-1] = null;

    for(var i=0; i< this.order-1; i++) {
        newChild.keys[i]=child.keys[i+this.order];
        child.keys[i+this.order] = null;
        if(!child.isLeaf) {
            newChild.children[i] = child.children[i+this.order];
            child.children[i+this.order] = null;
        }
    }

    // Copy the last child pointer
    if(!child.isLeaf) {
        newChild.children[i] = child.children[i+this.order];
        child.children[i+this.order] = null;
    }

    child.numberActives = this.order - 1;


    for(i = parent.numberActives + 1; i>index+1; i--) {
        parent.children[i] = parent.children[i-1];
    }

    parent.children[index+1] = newChild;

    for(i = parent.numberActives; i>index; i--) {
        parent.keys[i] = parent.keys[i-1];
    }

    parent.keys[index] = newParentChild;
    parent.numberActives++;

    var that = this;
    this._diskWrite(newChild,function(newChild){
        that._diskWrite(parent,function(parent){
            parent.children[index+1] = newChild;
            that._diskWrite(child,function(child){
                return callback(parent);
            });
        });
    });
};

/**
 * insert
 *
 * Creates a new node with value key and data and inserts it
 * into the tree.
 */
Tree.prototype.insert = function(key,data,callback) {

    if(this.root.numberActives === (2 * this.order - 1)) {
        var newRoot = this._allocateNode();
        newRoot.isLeaf = false;
        newRoot.level = this.root.level + 1;
        newRoot.numberActives = 0;
        newRoot.children[0] = this.root;

        var that = this;
        this._splitChild(newRoot, 0, this.root, function(updatedParent){
            newRoot = updatedParent; // @warning tricky!
            that.root = newRoot;
            that._updateRootNode(newRoot, function(newRoot){
                that._insertNonFull(newRoot, key, data, callback);
            });
        });
    } else {
        this._insertNonFull(this.root, key, data,callback);
    }
};

/**
 * _insertNonFull
 *
 * Recursive function that tries to insert the new key in
 * in the provided node, or splits it and go deeper
 * in the BTree hierarchy.
 */
Tree.prototype._insertNonFull = function (node, key, data, callback) {
    var idx = node.numberActives - 1;
    this.__insertNonFull(this, node, idx, key, data, callback);
};
Tree.prototype.__insertNonFull = function(tree,node,idx,key,data,callback) {
    if(!node.isLeaf) {
        while(idx>=0 && tree.comparator(key,node.keys[idx].key) === -1) {
            idx--;
        }
        idx++;
        var that = tree;
        tree._diskRead(node.children[idx],function(child) {
            if(child.numberActives === 2*that.order -1) {
                that._splitChild(node,idx,child,function(){
                    if(that.comparator(key, node.keys[idx].key)===1) {
                        idx++;
                    }
                    that._diskRead(node.children[idx], function(node){
                        idx = node.numberActives -1;
                        that.__insertNonFull(tree,node,idx,key,data,callback);
                    });
                });
            } else {
                that._diskRead(node.children[idx], function(node){
                    idx = node.numberActives -1;
                    that.__insertNonFull(tree,node,idx,key,data,callback);
                });
            }
        });

    } else {
        while(idx>=0 && tree.comparator(key,node.keys[idx].key) === -1) {
            node.keys[idx+1] = node.keys[idx];
            idx--;
        }

        if(idx>=0 && tree.comparator(key,node.keys[idx].key) === 0){
            node.keys[idx] = {key:key, data:data};
        } else {
            node.keys[idx + 1] = {key:key, data:data};
            node.numberActives++;
        }
        tree._diskWrite(node, function(node){
            return callback(node);
        });
    }
};

/**
 * delete
 *
 * Deletes the key from the
 * If the key is not found, an exception is thrown.
 *
 * @param key the key to be deleted
 * @returns true if the key is deleted false otherwise
 */
Tree.prototype.delete = function(key,callback) {
    var node = this.root;
    Tree.prototype.__deleteSearchNode(this,key,node,callback);
};
Tree.prototype.__deleteSearchNode = function(tree,key,node,callback) {
    var i = 0;

    if(node.numberActives === 0) {
        return callback(false);
    }

    while(i<node.numberActives && tree.comparator(key, node.keys[i].key) === 1) {
        i++;
    }

    var idx = i;

    if(i<node.numberActives && tree.comparator(key, node.keys[i].key) === 0) {
        return tree.__deleteNodeFound(tree,idx,key,node,callback);
    }

    if(node.isLeaf === true) {
        return callback(false);
    }

    var parent = node;
    tree._diskRead(node.children[i], function(node){
        if(node===null) {
            return callback(false);
        }

        var isLsiblingNull = false;
        var isRsiblingNull = false;
        var rsiblingIndex = null;
        var lsiblingIndex = null;

        if(idx === parent.numberActives) {
            isRsiblingNull = true;
            lsiblingIndex = parent.children[idx - 1];
            rsiblingIndex = parent.children[idx-1]
        } else if(idx === 0) {
            isLsiblingNull = true;
            rsiblingIndex = parent.children[1];
            lsiblingIndex = parent.children[1];
        } else {
            lsiblingIndex = parent.children[idx-1];
            rsiblingIndex = parent.children[idx+1];
        }

        tree._diskRead(lsiblingIndex, function(lsibling){
            tree._diskRead(rsiblingIndex, function(rsibling){
                if(isRsiblingNull===true) {
                    rsibling = null;
                }
                if(isLsiblingNull===true) {
                    lsibling = null;
                }

                if(node.numberActives === (tree.order-1) && parent != null) {
                    if(rsibling != null && rsibling.numberActives > (tree.order-1)) {
                        // The current node has (t - 1) keys but the right sibling has > (t - 1) keys
                        tree._moveKey(parent,i,left, function(parent){
                            tree.__deleteSearchNode(tree,key,node,callback);
                        });
                    } else if(lsibling != null && lsibling.numberActives > (tree.order-1)) {
                        // The current node has (t - 1) keys but the left sibling has > (t - 1) keys
                        tree._moveKey(parent,i,right, function(parent){
                            tree.__deleteSearchNode(tree,key,node,callback);
                        });
                    } else if(lsibling != null && lsibling.numberActives === (tree.order-1)) {
                        // The current node has (t - 1) keys but the left sibling has (t - 1) keys
                        tree._mergeSiblings(parent,i,left,function(node) {
                            tree.__deleteSearchNode(tree,key,node,callback);
                        });
                    } else if(rsibling != null && rsibling.numberActives === (tree.order-1)){
                        // The current node has (t - 1) keys but the left sibling has (t - 1) keys
                        tree._mergeSiblings(parent,i,right,function(node) {
                            tree.__deleteSearchNode(tree,key,node,callback);
                        });
                    }
                } else {
                    tree.__deleteSearchNode(tree,key,node,callback);
                }
            });
        })
    });
};
Tree.prototype.__deleteNodeFound = function (tree, idx, key, node, callback) {
    //Case 1 : The node containing the key is found and is the leaf node.
    //Also the leaf node has keys greater than the minimum required.
    //Simply remove the key
    if (node.isLeaf && (node.numberActives > (tree.order - 1))) {
        tree._deleteKeyFromNode(node, idx, function () {
            callback(true);
        });
        return true;
    }


    //If the leaf node is the root permit deletion even if the number of keys is
    //less than (t - 1)
    if (node.isLeaf && (node === tree.root)) {
        tree._deleteKeyFromNode(node, idx, function () {
            callback(true);
        });
        return true;
    }


    //Case 2: The node containing the key is found and is an internal node
    if (node.isLeaf === false) {
        tree._diskRead(node.children[idx], function (tmpNode) {
            if (tmpNode.numberActives > (tree.order - 1)) {
                tree._getMaxKeyPos(tree, tmpNode, function (subNodeIdx) {
                    key = subNodeIdx.node.keys[subNodeIdx.index];

                    node.keys[idx] = key;

                    tree._diskWrite(node, function (node) {
                        node = tmpNode;
                        key = key.key;
                        tree.__deleteSearchNode(tree, key, node, callback);
                    });
                });
            } else {
                tree._diskRead(node.children[idx + 1], function (tmpNode2) {
                    if (tmpNode2.numberActives > (tree.order - 1)) {
                        tree._getMinKeyPos(tree, tmpNode2, function (subNodeIdx) {
                            key = subNodeIdx.node.keys[subNodeIdx.index];

                            node.keys[idx] = key;

                            tree._diskWrite(node, function (node) {
                                node = tmpNode2;
                                key = key.key;
                                tree.__deleteSearchNode(tree, key, node, callback);
                            });
                        });
                    } else if (tmpNode.numberActives === (tree.order - 1) && tmpNode2.numberActives === (tree.order - 1)) {

                        tree._mergeNodes(tmpNode, node.keys[idx], tmpNode2, function (combNode) {

                            node.children[idx] = combNode;

                            idx++;
                            for (var i = idx; i < node.numberActives; i++) {
                                node.children[i] = node.children[i + 1];
                                node.keys[i - 1] = node.keys[i];
                            }
                            // freeing unused references
                            node.children[i] = null;
                            node.keys[i - 1] = null;

                            node.numberActives--;
                            if (node.numberActives === 0 && tree.root === node) {
                                tree.root = combNode;
                            }

                            tree._diskWrite(node, function (node) {
                                tree.__deleteSearchNode(tree, key, combNode, callback);
                            });
                        });
                    }
                });
            }
        });
    } // end case 2

    // Case 3:
    // In this case start from the top of the tree and continue
    // moving to the leaf node making sure that each node that
    // we encounter on the way has atleast 't' (order of the tree)
    // keys
    if (node.isLeaf && (node.numberActives > tree.order - 1)) {
        tree._deleteKeyFromNode(node, idx, function (node) {
            tree.__deleteSearchNode(tree, key, node, callback);
        });
    }
};

/**
 * _moveKey
 *
 * Move key situated at position i of the parent node
 * to the left or right child at positions i-1 and i+1
 * according to the provided position
 *
 * @param parent the node whose is going to be moved to a child
 * @param i Index of the key in the parent
 * @param position left, or right
 */
Tree.prototype._moveKey = function (parent, i, position, callback) {

    if (position === right) {
        i--;
    }

    var that = this;
    //var lchild = parent.children[i-1];
    that._diskRead(parent.children[i], function (lchild) {
        that._diskRead(parent.children[i + 1], function (rchild) {

            if (position == left) {
                lchild.keys[lchild.numberActives] = parent.keys[i];
                lchild.children[lchild.numberActives + 1] = rchild.children[0];
                rchild.children[0] = null;
                lchild.numberActives++;

                parent.keys[i] = rchild.keys[0];

                for (var _i = 1; _i < rchild.numberActives; _i++) {
                    rchild.keys[_i - 1] = rchild.keys[_i];
                    rchild.children[_i - 1] = rchild.children[_i];
                }
                rchild.children[rchild.numberActives - 1] = rchild.children[rchild.numberActives];
                rchild.numberActives--;
            } else {
                rchild.children[rchild.numberActives + 1] = rchild.children[rchild.numberActives];
                for (var _i = rchild.numberActives; _i > 0; _i--) {
                    rchild.children[_i] = rchild.children[_i - 1];
                    rchild.keys[_i] = rchild.keys[_i - 1];
                }
                rchild.keys[0] = null;
                rchild.children[0] = null;

                rchild.children[0] = lchild.children[lchild.numberActives];
                rchild.keys[0] = parent.keys[i];
                rchild.numberActives++;

                lchild.children[lchild.numberActives] = null;
                parent.keys[i] = lchild.keys[lchild.numberActives - 1];
                lchild.keys[lchild.numberActives - 1] = null;
                lchild.numberActives--;
            }

            that._diskWrite(lchild, function (lchild) {
                that._diskWrite(rchild, function (rchild) {
                    that._diskWrite(parent, function (parent) {
                        return callback(parent);
                    });
                });
            });
        });
    });
};

/**
 * _mergeSiblings
 *
 * Merges two nodes at the left and right of the provided
 * index in the parent node.
 *
 * @param parent the node whose children will be merged
 * @param i Index of the key in the parent pointing to the nodes to merge
 */
Tree.prototype._mergeSiblings = function(parent,index,pos,callback) {
    var i,j;
    var n1, n2;
    var tolookn1, tolookn2;

    if (index === (parent.numberActives)) {
        index--;
        tolookn1 = parent.children[parent.numberActives - 1];
        tolookn2 = parent.children[parent.numberActives]
    } else {
        tolookn1 = parent.children[index];
        tolookn2 = parent.children[index + 1];
    }

    var that = this;
    that._diskRead(tolookn1, function(n1){
        that._diskRead(tolookn2, function(n2){

            //Merge the current node with the left node
            var newNode = that._allocateNode();
            newNode.isLeaf = n1.isLeaf;
            newNode.level = n1.level;

            for(j=0; j<that.order-1; j++) {
                newNode.keys[j] = n1.keys[j];
                newNode.children[j] = n1.children[j];
            }

            newNode.keys[that.order-1] = parent.keys[index];
            newNode.children[that.order-1] = n1.children[that.order-1];

            for(j=0; j<that.order-1; j++) {
                newNode.keys[j+that.order] = n2.keys[j];
                newNode.children[j+that.order] = n2.children[j];
            }
            newNode.children[2*that.order-1] = n2.children[that.order-1];

            parent.children[index] = newNode;

            for(j=index; j<parent.numberActives;j++) {
                parent.keys[j] = parent.keys[j+1];
                parent.children[j+1] = parent.children[j+2];
            }

            newNode.numberActives = n1.numberActives + n2.numberActives+1;
            parent.numberActives--;

            for(i=parent.numberActives; i<2*that.order-1; i++) {
                parent.keys[i] = null;
            }

            if (parent.numberActives === 0 && that.root === parent) {
                that.root = newNode;
                if(newNode.level) {
                    newNode.isLeaf = false;
                } else {
                    newNode.isLeaf = true;
                }
            }

            that._diskWrite(newNode, function(newNode){
                that._diskWrite(parent,function(parent){
                    that._diskDelete(n1,function(){
                        that._diskDelete(n2,function(){
                            if(that.root === newNode) {
                                that._updateRootNode(that.root,function(){
                                    return callback(newNode);
                                });
                            } else {
                                return callback(newNode);
                            }
                        });
                    });
                });
            });
        });
    });
};

/**
 * _deleteKeyFromNode
 *
 * Deletes the key at position index from the provided node.
 *
 * @param node The node where the key will be deleted.
 * @param index The index of the key that will be deletd.
 * @return true if the key can be deleted, false otherwise
 */
Tree.prototype._deleteKeyFromNode = function (node, index, callback) {
    var keysMax = (2 * this.order) - 1;
    if (node.numberActives < keysMax) {
        keysMax = node.numberActives;
    }
    ;

    var i;

    if (node.isLeaf === false) {
        return false;
    }

    var key = node.keys[index];

    for (i = index; i < keysMax - 1; i++) {
        node.keys[i] = node.keys[i + 1];
    }

    // cleaning invalid reference
    node.keys.pop();

    node.numberActives--;

    this._diskWrite(node, function (node) {
        return callback(node);
    });
};

Tree.prototype._mergeNodes = function(n1, key, n2, callback) {
    var newNode;
    var i;

    newNode = this._allocateNode();
    newNode.isLeaf = true;

    for(i=0; i<n1.numberActives; i++) {
        newNode.keys[i]   = n1.keys[i];
        newNode.children[i]   = n1.children[i];
    }
    newNode.children[n1.numberActives] = n1.children[n1.numberActives];
    newNode.keys[n1.numberActives] = key;

    for(i=0; i<n2.numberActives; i++) {
        newNode.keys[i+n1.numberActives+1] = n2.keys[i];
        newNode.children[i+n1.numberActives+1] = n2.children[i];
    }
    newNode.children[(2*this.order)-1] = n2.children[n2.numberActives];

    newNode.numberActives = n1.numberActives + n2.numberActives + 1;
    newNode.isLeaf = n1.isLeaf;
    newNode.level = n1.level;


    var that = this;
    this._diskWrite(newNode, function(newNode){
        that._diskDelete(n1, function(){
            that._diskDelete(n2, function(){
                return callback(newNode);
            });
        })
    });
};

/**
 * audit
 *
 * Checks that the tree data structure is
 * valid.
 */
Tree.prototype.audit = function (showOutput) {
    var errors = [];
    var alreadySeen = [];
    var that = this;

    var foundInArray = function (data) {
        for (var i = 0; i < alreadySeen.length; i++) {
            if (that.comparator(alreadySeen[i], data) === 0) {
                var error = " !!! duplicated key " + data;
                if (showOutput === true) {
                    console.log(error);
                }
                errors.push(error);
            }
        }
    };

    var length = null;
    var that = this;
    this.walkNodes(function (n) {
        if (showOutput === true) {
            console.log("--- Node at " + n.level + " level");
            console.log(" - leaf? " + n.isLeaf);
            console.log(" - num actives? " + n.numberActives);
            console.log(" - keys: ");
        }
        for (var i = n.numberActives; i < n.keys.length; i++) {
            if (n.keys[i] != null) {
                if (showOutput === true) {
                    console.log(" * warning : redundant key data");
                    errors.push(" * warning : redundant key data");
                }
            }
        }

        for (var i = n.numberActives + 1; i < n.children.length; i++) {
            if (n.children[i] != null) {
                if (showOutput === true) {
                    console.log(" * warning : redundant children data");
                    errors.push(" * warning : redundant key data");
                }
            }
        }


        if (n.isLeaf === false) {
            for (var i = 0; i < n.numberActives; i++) {
                var maxLeft = this._diskRead(n.children[i]).keys[this._diskRead(n.children[i]).numberActives - 1 ].key;
                var minRight = this._diskRead(n.children[i + 1]).keys[0].key;
                if (showOutput === true) {
                    console.log("   " + n.keys[i].key + "(" + maxLeft + "," + minRight + ")");
                }
                if (that.comparator(n.keys[i].key, maxLeft) === -1) {
                    var error = " !!! value max left " + maxLeft + " > key " + n.keys[i].key;
                    if (showOutput === true) {
                        console.log(error);
                    }
                    errors.push(error);
                }
                if (that.comparator(n.keys[i].key, minRight) === 1) {
                    var error = " !!! value min right " + minRight + " < key " + n.keys[i].key;
                    if (showOutput === true) {
                        console.log(error);
                    }
                    errors.push(error);
                }

                foundInArray(n.keys[i].key);
                alreadySeen.push(n.keys[i].key);
            }
        } else {
            if (length === null) {
                length = n.level;
            } else {
                if (length != n.level) {
                    var error = " !!! Leaf node with wrong level value";
                    if (showOutput === true) {
                        console.log(error);
                    }
                    errors.push(error);
                }
            }
            for (var i = 0; i < n.numberActives; i++) {
                if (showOutput === true) {
                    console.log(" " + n.keys[i].key);
                }
                foundInArray(n.keys[i].key);
                alreadySeen.push(n.keys[i].key);

            }
        }

        if (n != that.root) {
            if (n.numberActives > ((2 * that.order) - 1)) {
                if (showOutput === true) {
                    var error = " !!!! MAX num keys restriction violated ";
                }
                console.log(error);
                errors.push(error);
            }
            if (n.numberActives < (that.order - 1)) {
                if (showOutput === true) {
                    var error = " !!!! MIN num keys restriction violated ";
                }
                console.log(error);
                errors.push(error);
            }

        }
    });

    return errors;
};

/**
 *  _getMaxKeyPos
 *
 *  Used to get the position of the MAX key within the subtree
 *  @return An object containing the key and position of the key
 */
Tree.prototype._getMaxKeyPos = function (tree, node, callback) {
    var node_pos = {};

    if (node === null) {
        return callback(null);
    }

    if (node.isLeaf === true) {
        node_pos.node = node;
        node_pos.index = node.numberActives - 1;
        return callback(node_pos);
    } else {
        node_pos.node = node;
        node_pos.index = node.numberActives - 1;
        tree._diskRead(node.children[node.numberActives], function (node) {
            return tree._getMaxKeyPos(tree, node, callback);
        });
    }
};

/**
 *  _getMinKeyPos
 *
 *  Used to get the position of the MAX key within the subtree
 *  @return An object containing the key and position of the key
 */
Tree.prototype._getMinKeyPos = function (tree, node, callback) {
    var node_pos = {};

    if (node === null) {
        callback(null);
    }

    if (node.isLeaf === true) {
        node_pos.node = node;
        node_pos.index = 0;
        return callback(node_pos);
    } else {
        node_pos.node = node;
        node_pos.index = 0;
        tree._diskRead(node.children[0], function (node) {
            return tree._getMinKeyPos(tree, node, callback);
        });
    }
};


/**
 * Node
 *
 * Implements the interface of BinarySearchTree.Node
 *
 * A Tree node augmented with BTree
 * node structures
 */
var Node = function() {
    this.numberActives = 0;
    this.isLeaf = null;
    this.keys = [];
    this.children = [];
    this.level = 0;
};

module.exports = {
    Tree: Tree,
    Node: Node
};
},{"./utils":55}],39:[function(_dereq_,module,exports){
(function (__dirname){
// imports
var QueryEngine = _dereq_("./query_engine").QueryEngine;
var InMemoryQuadBackend = _dereq_("./quad_backend").QuadBackend;
var PersistentBackend = _dereq_("./persistent_quad_backend").QuadBackend;
var InMemoryLexicon = _dereq_("./lexicon").Lexicon;
var PersistentLexicon = _dereq_("./persistent_lexicon").Lexicon;
var RDFModel = _dereq_("./rdf_model");
var _ = _dereq_("./utils");


/**
 * Creates a new store.<br/>
 * <br/>
 * It accepts two optional arguments, a map of configuration
 * options for the store and a callback function.<br/>
 *
 * @constructor
 * @param {Function} [callback] Callback that will be invoked when the store has been created
 * @param {Object} [params]
 * <ul>
 *  <li> persistent:  should the store use persistence? </li>
 *  <li> treeOrder: in versions of the store backed by the native indexing system, the order of the BTree indices</li>
 *  <li> name: when using persistence, the name for this store. In the MongoDB backed version, name of the DB used by the store. By default <code>'rdfstore_js'</code> is used</li>
 *  <li> overwrite: clears the persistent storage </li>
 *  <li> maxCacheSize: if using persistence, maximum size of the index cache </li>
 * </ul>
 */
function Store(arg1, arg2) {
    var callback = null;
    var params   = null;


    if(arguments.length == 0) {
        params ={};
    } else if(arguments.length == 1) {
        params   = {};
        callback = arg1;
    } else if(arguments.length > 1) {
        params   = arg1;
        callback = arg2;
    } else {
        throw("An optional argument map and a callback must be provided");
    }

    if(params['treeOrder'] == null) {
        params['treeOrder'] = 15;
    }

    this.functionMap = {};
    this.customFns = {};

    this.engine = null;
    
    this._buildEngine(params, callback);

};

/**
 * Creates new Lexicon, QuadBackend, and QueryEngine.
 *
 * @arguments:
 * @param {Object} [params]
 * @param {Function} [callback]: returned upon instantiation of store
 */

Store.prototype._buildEngine = function(params, callback){
    
    var Lexicon;
    var QuadBackend;

    if(params['persistent'] === true){
        Lexicon = PersistentLexicon;
        QuadBackend = PersistentBackend;
    
    } else {
        Lexicon = InMemoryLexicon;
        QuadBackend = InMemoryQuadBackend;
    }

    var that = this;
    var createEngine = function(){
        that.engine = new QueryEngine(params);
        callback(null, that);
    };
    
    var createQuadBackend = function(lexicon){

        new QuadBackend(params, function(backend){
            params.lexicon = lexicon;
            params.backend = backend;

            if(params['overwrite']) {
                backend.clear(createEngine);
            } else {
                createEngine()
            }
        })
    };

    new Lexicon(function(lexicon){
        
        if(params['overwrite'] === true) {
            lexicon.clear(createQuadBackend(lexicon));
        } else {
            createQuadBackend(lexicon);
        }
    },params['name'])
};

/**
 * An instance of RDF JS Interface <code>RDFEnvironment</code>
 * associated to this graph instance.
 */
Store.prototype.rdf = RDFModel.rdf;
Store.prototype.rdf.api = RDFModel;

/**
 * Registers a new function with an associated name that can
 * be invoked as 'custom:fn_name(arg1,arg2,...,argn)' inside
 * a SPARQL query.
 * <br/>
 * The registered function will receive two arguments, an
 * instance of the store's query filters engine and a list
 * with the arguments received by the function in the SPARQL query.
 * <br/>
 * The function must return a single token value that can
 * consist in a literal value or an URI.
 * <br/>
 * The following is an example literal value:
 * {token: 'literal', type:"http://www.w3.org/2001/XMLSchema#integer", value:'3'}
 * This is an example URI value:
 * {token: 'uri', value:'http://test.com/my_uri'}
 * <br/>
 * The query filters engine can be used to perform common operations
 * on the input values.
 * An error can be returne dusing the 'ebvError' function of the engine.
 * True and false values can be built directly using the 'ebvTrue' and
 * 'ebvFalse' functions.
 *
 * A complete reference of the available functions can be found in the
 * documentation or source code of the QueryFilters module.
 *
 * @arguments:
 * @param {String} [name]: name of the custom function, it will be accesible as custom:name in the query
 * @param {Function} [function]: lambda function with the code for the query custom function.
 */
Store.prototype.registerCustomFunction = function(name, fn) {
    this.customFns[name] = fn;
    this.engine.setCustomFunctions(this.customFns);
};

/**
 * Executes a query in the store.<br/>
 * <br/>
 * There are two possible ways of invoking this function,
 * providing a pair of arrays of namespaces that will be
 * used to compute the union of the default and named
 * dataset, or without them.
 * <br/>
 * <br/>
 * Both invocations receive as an optional last parameter
 * a callback function that will receive the return status
 * of the query and the results.
 * <br/>
 * <br/>
 * Results can have different formats:
 * <ul>
 *  <li> SELECT queries: array of binding maps </li>
 *  <li> CONSTRUCT queries: RDF JS Interface Graph object </li>
 *  <li> ASK queries: JS boolean value </li>
 *  <li> LOAD/INSERT... queries: Number of triples modified/inserted </li>
 * </ul>
 *
 * @arguments:
 * @param {String} query
 * @param {String} [defaultURIs] default namespaces
 * @param {String} [namespacesURIs] named namespaces
 * @param {Function} [callback]
 */
Store.prototype.execute = function() {
    if(arguments.length === 3) {
        this.executeWithEnvironment(arguments[0],
            arguments[1],
            arguments[2]);
    } else if(arguments.length === 4) {
        this.executeWithEnvironment(arguments[0],
            arguments[1],
            arguments[2],
            arguments[3]);
    } else {

        var queryString;
        var callback;

        if(arguments.length === 1) {
            queryString = arguments[0];
            var callback = function(){};
        } else if(arguments.length === 2) {
            queryString = arguments[0];
            callback = arguments [1];
        }
        this.engine.execute(queryString, callback);
    }
};

/**
 * A variation of the execute function that expects
 * arguments containing values for the default and named
 * graphs that will be used in the query.
 *
 *
 * @arguments:
 * @param {String} query
 * @param {String} URIs default namespaces
 * @param {String} URIs named namespaces
 * @param {Function} [callback]
 */
Store.prototype.executeWithEnvironment = function() {
    var queryString, defaultGraphs, namedGraphs;

    if(arguments.length === 3) {
        queryString   = arguments[0];
        // JSDoc fails if this is pushed outside
        var callback  = function(){};
        defaultGraphs = arguments[1];
        namedGraphs   = arguments[2];
    } else if(arguments.length === 4) {
        queryString   = arguments[0];
        var callback      = arguments [3];
        defaultGraphs = arguments[1];
        namedGraphs   = arguments[2];
    }

    defaultGraphs = _.map(defaultGraphs, function(graph){
        return {'token':'uri','value':graph};
    });
    namedGraphs = _.map(namedGraphs, function(graph){
        return {'token':'uri','value':graph};
    });

    this.engine.execute(queryString, callback, defaultGraphs, namedGraphs);
};

/**
 * Retrieves all the quads belonging to a certain graph
 * in the store as a RDF JS Interface Graph object.<br/>
 * <br/>
 * The function accepts as mandatory parameter a callback
 * function that will receive the a success notification and the returned graph.<br/>
 * <br/>
 * Optionally, the URI of the graph can also be passed as
 * the first argument. If no graph is specified, the
 * default graph will be returned.<br/>
 *
 * @arguments
 * @param {String} [graphURI] If this parameter is missing, the default graph will be returned
 * @param {Functon} callback
 */
Store.prototype.graph = function() {
    var graphUri = null;
    var callback = null;
    if(arguments.length === 1) {
        callback = arguments[0] || function(){};
        graphUri = this.engine.lexicon.defaultGraphUri;
    } else if(arguments.length === 2) {
        callback = arguments[1] || function(){};
        graphUri = arguments[0];
    } else {
        throw("An optional graph URI and a callback function must be provided");
    }

    if(this.rdf.resolve(graphUri) != null) {
        graphUri = this.rdf.resolve(graphUri);
    }

    this.engine.execute("CONSTRUCT { ?s ?p ?o } WHERE { GRAPH <" + graphUri + "> { ?s ?p ?o } }", callback);
};

/**
 * Retrieves all the quads belonging to a certain node
 * in the store as a RDF JS Interface Graph object containing
 * the collection of triples whose subject is the provided
 * node URI.<br/>
 * <br/>
 * The function accepts as mandatory parameters the node URI and
 * a callback unction that will receive a success notification and the returned node.<br/>
 * <br/>
 * Optionally, the URI of the graph where the node is contained
 * can also be passed as the first argument. <br/>
 * <br/>
 * If no graph is specified, the node will be looked into the
 * default graph.<br/>
 *
 * @arguments
 * @param {String} nodeURI URI of the node to look for
 * @param {String} [graphURI] If this parameter is missing, the node will be looked into the default graph
 * @param {Functon} callback
 */
Store.prototype.node = function() {
    var graphUri = null;
    var callback = null;
    var nodeUri  = null;
    if(arguments.length === 2) {
        nodeUri = arguments[0];
        callback = arguments[1] || function(){};
        graphUri = this.engine.lexicon.defaultGraphUri;
    } else if(arguments.length === 3) {
        nodeUri = arguments[0];
        graphUri = arguments[1];
        callback = arguments[2] || function(){};
    } else {
        throw("An optional graph URI, node URI and a callback function must be provided");
    }

    if(this.rdf.resolve(graphUri) != null) {
        graphUri = this.rdf.resolve(graphUri);
    }

    if(this.rdf.resolve(nodeUri) != null) {
        nodeUri = this.rdf.resolve(nodeUri);
    }

    this.engine.execute("CONSTRUCT { <" + nodeUri + "> ?p ?o } WHERE { GRAPH <" + graphUri + "> { <" + nodeUri + "> ?p ?o } }", callback);
};

/**
 * Associates an event listener function to a node URI. Every time the collection
 * of triples whose subject is the specified node URI changes, because an
 * insertion or deletion, the provided callback function will be invoked
 * receiving as a parameter a RDF JS Interface Graph object with the new
 * collection of triples.<br/>
 * <br/>
 * The function accepts two mandatory arguments, the URI of the node to observe
 * and the function that will receive the event notifications. An optional
 * third parameter, consisting of a callback function, can be passed and will be invoked
 * once the store had correctly configured the event listener.<br/>
 *<br/>
 * LOAD queries, batch loading data into the store, do not
 * trigger events by default. If you wish to be notified
 * by changes triggered by this kind of queries, invoke
 * the *setBatchLoadEvents* function with a true argument.<br/>
 *<br/>
 * The event listener function can be removed using the stopObservingNode function.
 *
 * @arguments
 * @param {String} nodeURI URI of the node to observe
 * @param {Function} eventListener Function that will be notified with the events
 * @param {Function} [callback] Function that will be invoked, once the event listener had been correctly set up.
 */
Store.prototype.startObservingNode = function() {
    var uri, graphUri, callback;

    if(arguments.length === 2) {
        uri = arguments[0];
        callback = arguments[1];
        this.engine.callbacksBackend.observeNode(uri, callback, function(){});
    } else if(arguments.length === 3) {
        uri = arguments[0];
        graphUri = arguments[1];
        callback = arguments[2];
        this.engine.callbacksBackend.observeNode(uri, graphUri, callback, function(){});
    }
};

/**
 * Removes a callback function associated to a node.<br/>
 * The event listener function object must be passed as an argument.<br/>
 *
 * @arguments
 * @param {Function} eventListener The event listener function to remove, the same passed as an argument to startObservingNode
 */
Store.prototype.stopObservingNode = function(callback) {
    this.engine.callbacksBackend.stopObservingNode(callback);
};

/**
 * Associates an event listener function to a SPARQL SELECT or
 * CONSTRUCT query.<br/>
 * Every time an update (insert, delete...) query modified the
 * triples in the store in a way that modifies the output of the
 * query, the event listener will be invoked with an updated
 * result.<br/>
 *<br/>
 * LOAD queries, batch loading data into the store, do not
 * trigger events by default. If you wish to be notified
 * by changes triggered by this kind of queries, invoke
 * the <code>setBatchLoadEvents</code> function with a true argument.<br/>
 *<br/>
 * The event listener function can be removed invoking the
 * <code>stopObservingQuery</code> function.
 *
 * @arguments
 * @param {String} query SELECT or CONSTRUCT SPARQL query
 * @param {Function} eventListener the function that will receive the notifications
 * @param {Function} [callback] optional function that will be invoked when the stored had set up the event listener function.
 */
Store.prototype.startObservingQuery = function() {
    var query = arguments[0];
    var callback = arguments[1];
    var endCallback = arguments[2];
    if(endCallback!=null) {
        this.engine.callbacksBackend.observeQuery(query, callback, endCallback);
    } else {
        this.engine.callbacksBackend.observeQuery(query, callback, function(){});
    }
};

/**
 * Removes a callback function associated to a SPARQL query.<br/>
 * The event listener function object must be passed as an argument.
 *
 * @arguments
 * @param {Function} eventListener The event listener function to remove, the same passed as an argument to startObservingQuery
 */
Store.prototype.stopObservingQuery = function(query) {
    this.engine.callbacksBackend.stopObservingQuery(query);
};

/**
 * Associates an event listener to a pattern expressed as the
 * subject, predicate, object and graph string parameters passed
 * to the function. To match any value in that position, a <code>null</code>
 * value can be passed as an argument. e.g. <code>subscribe(null, null, null, g, cb)</code>,
 * will be notified with any change in the g graph.<br/>
 * The graph component of the pattern does not support a <code>null</code> value.<br/>
 *<br/>
 * Results will be notified as an Array of RDF JS Interface
 * <code>Triple</code> objects.<br/>
 *<br/>
 * LOAD queries, batch loading data into the store, do not
 * trigger events by default. If you wish to be notified
 * by changes triggered by this kind of queries, invoke
 * the <code>setBatchLoadEvents</code> function with a true argument.
 *
 * @arguments
 * @param {String} s subject or null for any subject
 * @param {String} p predicate or null for any predicate
 * @param {String} o object or null for any object
 * @param {String} g graph or null for any graph
 * @param {Function} event listener function that will be notified when a change occurs
 */
Store.prototype.subscribe = function(s, p, o, g, callback) {
    var that = this;
    var adapterCb = function(event,triples){
        var acum = [];
        var queryEnv = {blanks:{}, outCache:{}};
        var bindings = [];

        _.each(triples, function(triple){
            var s = RDFModel.buildRDFResource(triple.subject,bindings,that.engine,queryEnv);
            var p = RDFModel.buildRDFResource(triple.predicate,bindings,that.engine,queryEnv);
            var o = RDFModel.buildRDFResource(triple.object,bindings,that.engine,queryEnv);
            if(s!=null && p!=null && o!=null) {
                triple = new RDFModel.Triple(s,p,o);
                acum.push(triple);
            }
        });

        callback(event,acum);
    };

    this.functionMap[callback] = adapterCb;
    this.engine.callbacksBackend.subscribe(s,p,o,g,adapterCb,function(){});
};

/**
 * Removes an event listener associated to a certain pattern.
 * The function passed as an argument to <code>subscribe</code> must be
 * passed as an argument.
 *
 * @arguments
 * @param {Function} callback The event listener to be removed
 */
Store.prototype.unsubscribe = function(callback) {
    var adapterCb = this.functionMap[callback];
    this.engine.callbacksBackend.unsubscribe(adapterCb);
    delete this.functionMap[callback];
};

/**
 * Register a combination of prefix and URI fragment in the default instance
 * of the RDF JS Interface API <code>RDFEnvironment</code> object associated
 * to the store and available through the <code>storeInstance.rdf</code> property.
 *
 * @arguments
 * @param {String} prefix The prefix to be associated
 * @param {String} URIFragment URI fragment the provided prefix will be resolved
 */
Store.prototype.setPrefix = function(prefix, uri) {
    this.rdf.setPrefix(prefix, uri);
};

/**
 * Defines the URI that will be used by default by the RDF JS Interface
 * API <code>RDFEnvironment</code> object associated to the store and available
 * through the <code>storeInstance.rdf</code> property.
 *
 * @arguments
 * @param {String} URIFragment The URI fragment will be used by default
 */
Store.prototype.setDefaultPrefix = function(uri) {
    this.rdf.setDefaultPrefix(uri);
};

/**
 * Inserts a RDF JS Interface API <code>Graph</code> object into the store.
 * The function receives a mandatory <code>Graph</code> object whose triples
 * will be inserted. Optionally, a URI string for a graph and a
 * callback function can be passed as arguments.<br/>
 * <br/>
 * If no graph URI is specified, triples will be inserted into the
 * default graph.<br/>
 * <br/>
 * If the callback function is specified, it will be invoked when all the
 * triples had been inserted into the store.<br/>
 *
 * @arguments
 * @param {RDFModel.Graph} triples a RDF JS Interface <code>Graph</code> object
 * @param {String} [graphURI] URI of the graph where the triples will be inserted. If it is missing, triples will be inserted in the default graph
 * @param {String} [callback] A callback function that will be invoked with a success notification and the number of triples inserted
 */
Store.prototype.insert = function() {
    var graph;
    var triples;
    var callback;
    if(arguments.length === 1) {
        triples = arguments[0];
        callback= function(){};
    } else if(arguments.length === 2) {
        triples = arguments[0];
        callback= arguments[1] || function(){};
    } else if(arguments.length === 3) {
        triples = arguments[0];
        graph = this.rdf.createNamedNode(arguments[1]);
        callback= arguments[2] || function(){};
    } else {
        throw("The triples to insert, an optional graph and callback must be provided");
    }

    var query = "";
    var that = this;
    triples.forEach(function(triple) {
        query = query + that._nodeToQuery(triple.subject) + that._nodeToQuery(triple.predicate) + that._nodeToQuery(triple.object) + ".";
    });

    if(graph != null) {
        query = "INSERT DATA { GRAPH " + this._nodeToQuery(graph) +" { "+ query + " } }";
    } else {
        query = "INSERT DATA { "+ query + " }";
    }

    this.engine.execute(query, callback);
};

Store.prototype._nodeToQuery = function(term) {
    if(term.interfaceName === 'NamedNode') {
        var resolvedUri = this.rdf.resolve(term.valueOf());
        if(resolvedUri != null) {
            return "<" + resolvedUri + ">";
        } else {
            return "<" + term.valueOf() + ">";
        }
    } else {
        return term.toString();
    }
};

/**
 * Removes the triples in a RDF JS Interface API <code>Graph</code> object from the store.
 * The function receives a mandatory <code>Graph</code> object whose triples
 * will be removed. Optionally, a URI string for a graph and a
 * callback function can be passed as arguments.<br/>
 * <br/>
 * If no graph URI is specified, triples will be removed from the
 * default graph.<br/>
 * <br/>
 * If the callback function is specified, it will be invoked when all the
 * triples had been removed from the store.
 *
 * @arguments
 * @param {RDFModel.Graph} triples a RDF JS Interface <code>Graph</code> object
 * @param {String} [graphURI] URI of the graph where the triples will be removed from. If it is missing, triples will be removed from the default graph
 * @param {String} [callback] A callback function that will be invoked with a success notification
 */
Store.prototype.delete = function() {

    var graph;
    var triples;
    var callback;
    if(arguments.length === 1) {
        triples = arguments[0];
        callback= function(){};
    } else if(arguments.length === 2) {
        triples = arguments[0];
        callback= arguments[1] || function(){};
    } else if(arguments.length === 3) {
        triples = arguments[0];
        graph = this.rdf.createNamedNode(arguments[1]);
        callback= arguments[2] || function(){};
    } else {
        throw("The triples to delete, an optional graph and callback must be provided");
    }

    var query = "";
    var that = this;
    triples.forEach(function(triple) {
        query = query + that._nodeToQuery(triple.subject) + that._nodeToQuery(triple.predicate) + that._nodeToQuery(triple.object) + ".";
    });

    if(graph != null) {
        query = "DELETE DATA { GRAPH " + this._nodeToQuery(graph) +" { "+ query + " } }";
    } else {
        query = "DELETE DATA { "+ query + " }";
    }

    this.engine.execute(query, callback);
};

/**
 * Removes all the triples stored in a graph.
 *
 * The URI of the graph and a callback function can be
 * optinally passed as parameters.<br/>
 * <br/>
 * If no graph URI is specified, all triples in the
 * default graph will be removed.
 *
 * @arguments
 * @param {String} [graph] the URI of the graph the triples must be removed from
 * @param {Function} [callback] a function that will be invoked with a success notification
 */
Store.prototype.clear = function() {
    var graph;
    var callback;

    if(arguments.length === 0) {
        graph = this.rdf.createNamedNode(this.engine.lexicon.defaultGraphUri);
        var callback= function(){};
    } else if(arguments.length === 1) {
        graph = this.rdf.createNamedNode(this.engine.lexicon.defaultGraphUri);
        callback= arguments[0] || function(){};
    } else if(arguments.length === 2) {
        graph = this.rdf.createNamedNode(arguments[0]);
        callback= arguments[1] || function(){};
    } else {
        throw("The optional graph and a callback must be provided");
    }

    var query = "CLEAR GRAPH " + this._nodeToQuery(graph);
    this.engine.execute(query, callback);
};

/**
 * Boolean value determining if loading RDF must produce
 * triple add events and fire callbacks.<br/>
 * Default value is false.
 *
 * @arguments
 * @param {boolean} mustFireEvents true/false value.
 */
Store.prototype.setBatchLoadEvents = function(mustFireEvents){
    this.engine.eventsOnBatchLoad = mustFireEvents;
};

/**
 * Registers a namespace prefix that will be automatically declared
 * in all the queries.<br/>
 * <br/>
 * The prefix will also be inserte in the default <code>RDFEnvironment</code> object
 * associated to the <code>rdf</code> property of the store instance.
 *
 * @arguments
 * @param {String} ns the name space to be regsitered
 * @param {String} prefix the URI fragment associated to the name space
 */
Store.prototype.registerDefaultNamespace = function(ns, prefix) {
    this.rdf.prefixes.set(ns,prefix);
    this.engine.registerDefaultNamespace(ns,prefix);
};

/**
 * Registers the default namespaces declared in the RDF JS Interfaces
 * specification in the default Profile.
 */
Store.prototype.registerDefaultProfileNamespaces = function() {
    var defaultNsMap = this.rdf.prefixes.values();
    for (var p in defaultNsMap) {
        this.registerDefaultNamespace(p,defaultNsMap[p]);
    }
};

/**
 * Load triples into a graph in the store. Data can be passed directly to the method
 * or a remote URI speifying where the data is located can be used.<br/>
 *<br/>
 * If the data is passed directly to the load function, the media type stating the format
 * of the data must also be passed to the function.<br/>
 *<br/>
 * If an URI is passed as a parameter, the store will attempt to perform content negotiation
 * with the remote server and get a representation for the RDF data matching one of the
 * the RDF parsers registered in the store. In this case, the media type parameter must be
 * set to the <code>'remote'</code> value.<br/>
 *<br/>
 * An additional URI for the graph where the parsed data will be loaded and a callback function
 * can be also passed as parameters. If no graph is specified, triples will be loaded in the
 * default graph.<br/>
 *<br/>
 * By default loading data will not trigger notification through the events API. If events needs to
 * be trigger, the functio <code>setBatchLoadEvents</code> must be invoked with a true parameter.
 *
 * @arguments
 * @param {String} mediaType Media type (application/json, text/n3...) of the data to be parsed or the value <code>'remote'</code> if a URI for the data is passed instead
 * @param {String} data RDF data to be parsed and loaded or an URI where the data will be retrieved after performing content negotiation
 * @param {String} [graph] Graph where the parsed triples will be inserted. If it is not specified, triples will be loaded in the default graph
 * @param {Function} callback that will be invoked with a success notification and the number of triples loaded.
 */
Store.prototype.load = function(){
    var mediaType;
    var data;
    var graph;
    var callback;
    var options = {};

    if(arguments.length === 3) {
        graph = this.rdf.createNamedNode(this.engine.lexicon.defaultGraphUri);
        mediaType = arguments[0];
        data = arguments[1];
        callback= arguments[2] || function(){};
    } else if(arguments.length === 4) {
        mediaType = arguments[0];
        data = arguments[1];
        options = arguments[2];
        if(typeof(options) === 'string') {
            graph = this.rdf.createNamedNode(options);
            options = {};
        } else {
            graph = this.rdf.createNamedNode(options.graph || this.engine.lexicon.defaultGraphUri);
            delete options['graph'];
        }
        callback= arguments[3] || function(){};
    } else if(arguments.length === 2) {
        throw("The mediaType of the parser, the data a callback and an optional graph must be provided");
    }

    if(mediaType === 'remote') {
        data = this.rdf.createNamedNode(data);
        var query = "LOAD <"+data.valueOf()+"> INTO GRAPH <"+graph.valueOf()+">";
        this.engine.execute(query, callback);
    } else {

        var that = this;

        var parser = this.engine.rdfLoader.parsers[mediaType];

        if (!parser) return callback(new Error("Cannot find parser for the provided media type:"+mediaType));

        var cb = function(err, quads) {
            if(err) {
                callback(err, quads);
            } else {
                that.engine.batchLoad(quads,function(success){
                    if(success != null){
                        callback(null,success);
                    } else {
                        callback(new Error("Erro batch-loading triples."));
                    }
                });
            }
        };

        var args = [parser, {'token':'uri', 'value':graph.valueOf()}, data, options, cb];

        if(data && typeof(data)==='string' && data.indexOf('file://')=== 0) {
            this.engine.rdfLoader.loadFromFile.apply(null, args);
        } else {
            this.engine.rdfLoader.tryToParse.apply(null, args);
        }
    }
};

/**
 * Registers a new parser associated to the provided media type. If there is a parser already registered for
 * that media type, the new parser will replace the old one.<br/>
 *<br/>
 * Parsers must implement a function *parse* accepting the data to be parsed as the
 * first parameter and the destination graph URI as the second one.
 * They must return an array of objects with properties: 'subject', 'predicate', 'object'
 * and 'graph' containing lexical representations for these values:
 *<br/>
 *<ul>
 * <li><code>{literal: '"literal"'}</code></li>
 * <li><code>{literal: ''"literal"^^<datatype>'}</code></li>
 * <li><code>{literal: '"literal"@lang'}</code></li>
 * <li><code>{uri: 'uri'}</code></li>
 * <li><code>{blank: '_:label'}</code></li>
 *</ul>
 *<br/>
 * The provided media type will be used to perform content negotiation when dealing with remote
 * resources, or to select the parser in the <code>load</code> function.
 *
 * @arguments
 * @param {String} mediaType the media type for this parser
 * @param {String} parser an object containing the *parse* function with the parser logic
 */
Store.prototype.registerParser = function(mediaType, parser) {
    this.engine.rdfLoader.registerParser(mediaType,parser);
};

/**
 * Returns the URI of all the graphs currently contained
 * in the store
 *
 * @arguments:
 * @param {Function} callback function that will receive a success notification and the array of graph URIs
 */
Store.prototype.registeredGraphs = function(callback) {
    this.engine.lexicon.registeredGraphs(true, function(graphs){
        var graphNodes = _.map(graphs, function(graph){
            return new RDFModel.NamedNode(graph);
        });

        callback(null, graphNodes);
    });
};

/**
 * Returns the current network transport being used by the
 * the store.
 *
 * The default transport uses TCP sockets in the Node.js version
 * and relies on jQuery in the browser version. This can be overriden
 * using the <code>setNetworkTransport</code> function.
 */
Store.prototype.getNetworkTransport = function() {
    return NetworkTransport;
};

/**
 * Sets the network transport used by the store.<br/>
 * <br/>
 * Network transport consist of an object implementing the <code>load</code>
 * function, receiving the URI to load, a string with the value
 * of the HTTP 'Accept' header for the store registered parsers,
 * a callback function where the retrieved data and the success notification
 * must be returned.<br/>
 *<br/>
 * Different examples with implementations of different transports can be found
 * in the source code of the store:
 *<ul>
 * <li>src/js-communication/src/tcp_transport.js</li>
 * <li>src/js-communication/src/ajax_transport.js</li>
 *</ul>
 * @arguments
 * @param networkTransportImpl object implementing the transport *load* function.
 */
Store.prototype.setNetworkTransport = function(networkTransportImpl) {
    NetworkTransport = networkTransportImpl;
};


/**
 * Clean-up function releasing all temporary resources held by the
 * store instance.
 */
Store.prototype.close = function(cb) {
    if(cb == null)
        cb = function(){};
    if(this.engine.close)
        this.engine.close(cb);
    else
        cb();
};

/**
 * Version of the store
 */
Store.VERSION = "0.9.7";

/**
 * Create a new RDFStore instance that will be
 * executed in a web worker in the browser or a new process
 * in Node.js.
 * <br/>
 * <br/>
 * The first argument to this function is the URL/FS location
 * of the store script.
 * <br/>
 * <br/>
 * This parameter is mandatory in the browser. It is safe to
 * ignore this parameter in Node.js.
 * <br/>
 * <br/>
 * If support for web workers is not present, a regular
 * store object will be initialized and returned.
 * <br/>
 * <br/>
 *
 * @param {String} [scriptPath] URL of the RDFStore script
 * @param {Object[]} [args] Arguments to be passed to the store that will be created
 * @param {Function} callback Callback function that will be invoked with an error flag and the connection/store object.
 */
var connect = function() {
    var path, args, callback;
    if(arguments.length == 1) {
        path = __dirname;
        args = {};
        callback = arguments[0];
    } else if(arguments.length == 2) {
        if(typeof(arguments[0]) === 'string') {
            path = arguments[0];
            args = {};
        } else {
            path = __dirname+"/index.js";
            args = arguments[0];
        }
        callback = arguments[1];
    } else {
        path = arguments[0];
        args = arguments[1];
        callback = arguments[2];
    }
    callback(new Error("Store#connect is not supported in the 1.x series of the library"));
};

/**
 * Creates a new instance of the store.
 *
 * The function accepts two optional arguments.
 * <br/>
 * If only one argument is passed it must be a
 * callback function that will be invoked when the
 * store had been created.<br/>
 * <br/>
 * If two arguments are passed the first one must
 * be a map of configuration parameters for the
 * store, and the second one the callback function.<br/>
 * <br/>
 * Take a look at the Store constructor function for
 * a detailed list of possible configuration parameters.<br/>
 *
 * @param {Object[]} [args] Arguments to be passed to the store that will be created
 * @param {Function} [callback] Callback function that will be invoked with an error flag and the connection/store object.
 */
var create = function(){
    if(arguments.length == 1) {
        return new Store(arguments[0]);
    } else if(arguments.length == 2) {
        return new Store(arguments[0], arguments[1]);
    } else {
        return new Store();
    };
};

module.exports.Store = Store;
module.exports.create = create;
module.exports.connect = connect;

}).call(this,"/")
},{"./lexicon":42,"./persistent_lexicon":45,"./persistent_quad_backend":46,"./quad_backend":47,"./query_engine":49,"./rdf_model":53,"./utils":55}],40:[function(_dereq_,module,exports){
//imports
var _ = _dereq_('./utils');
var async = _dereq_('./utils');
var QuadIndex = _dereq_('./quad_index').QuadIndex;
var Pattern = _dereq_('./quad_index').Pattern;
var RDFModel = _dereq_('./rdf_model');
var AbstractQueryTree = _dereq_('./abstract_query_tree').AbstractQueryTree;

Callbacks = {};

Callbacks.ANYTHING = {
    'token': 'var',
    'value': '_'
};

Callbacks.added = 'added';
Callbacks.deleted = 'deleted';
Callbacks.eventsFlushed = 'eventsFlushed';

Callbacks.CallbacksBackend = function() {
    this.aqt = new AbstractQueryTree();
    this.engine = arguments[0];
    this.indexMap = {};
    this.observersMap = {};
    this.queriesIndexMap = {};
    this.emptyNotificationsMap = {};
    this.queriesList = [];
    this.pendingQueries = [];
    this.matchedQueries = [];
    this.updateInProgress = null;
    this.indices = ['SPOG', 'GP', 'OGS', 'POG', 'GSP', 'OS'];
    this.componentOrders = {
	SPOG: ['subject', 'predicate', 'object', 'graph'],
	GP: ['graph', 'predicate', 'subject', 'object'],
	OGS: ['object', 'graph', 'subject', 'predicate'],
	POG: ['predicate', 'object', 'graph', 'subject'],
	GSP: ['graph', 'subject', 'predicate', 'object'],
	OS: ['object', 'subject', 'predicate', 'graph']
    };

    this.callbackCounter = 0;
    this.callbacksMap = {};
    this.callbacksInverseMap = {};

    this.queryCounter = 0;
    this.queriesMap = {};
    this.queriesCallbacksMap = {};
    this.queriesInverseMap = {};

    for(var i=0; i<this.indices.length; i++) {
	var indexKey = this.indices[i];
	this.indexMap[indexKey] = {};
	this.queriesIndexMap[indexKey] = {};
    }
};

Callbacks.CallbacksBackend.prototype.startGraphModification = function() {
    if(this.ongoingModification !== true) {
	this.pendingQueries = [].concat(this.queriesList);
	this.matchedQueries = [];

	if (this.updateInProgress == null) {
	    this.updateInProgress = {};
	    this.updateInProgress[Callbacks['added']] = [];
	    this.updateInProgress[Callbacks['deleted']] = [];
	}
    }
};

Callbacks.CallbacksBackend.prototype.nextGraphModification = function(event, quad) {
    this.updateInProgress[event].push(quad);
};

Callbacks.CallbacksBackend.prototype.endGraphModification = function(callback) {
    if(this.ongoingModification !== true) {
	var that = this;
	if (this.updateInProgress != null) {
	    var tmp = that.updateInProgress;
	    that.updateInProgress = null;
	    this.sendNotification(Callbacks['deleted'], tmp[Callbacks['deleted']], function () {
		that.sendNotification(Callbacks['added'], tmp[Callbacks['added']], function () {
		    that.sendEmptyNotification(Callbacks['eventsFlushed'], null, function () {
			that.dispatchQueries(function () {
			    callback(true);
			});
		    });
		});
	    });
	} else {
	    callback(true);
	}
    } else {
	callback(true);
    }
};

Callbacks.CallbacksBackend.prototype.cancelGraphModification = function() {
    if(this.ongoingModification !== true) {
	this.updateInProgress = null;
    }
};

Callbacks.CallbacksBackend.prototype.sendNotification = function(event, quadsPairs, doneCallback) {
    var notificationsMap = {};
    for(var i=0; i<quadsPairs.length; i++) {
	var quadPair = quadsPairs[i];
	for(var indexKey in this.indexMap) {
	    var index = this.indexMap[indexKey];
	    var order = this.componentOrders[indexKey];
	    this._searchCallbacksInIndex(index, order, event, quadPair, notificationsMap);
	    if(this.pendingQueries.length != 0) {
		index = this.queriesIndexMap[indexKey];
		this._searchQueriesInIndex(index, order, quadPair);
	    }
	}
    }

    this.dispatchNotifications(notificationsMap);

    if(doneCallback != null)
	doneCallback(true);
};

Callbacks.CallbacksBackend.prototype.sendEmptyNotification = function(event, value, doneCallback) {
    var callbacks = this.emptyNotificationsMap[event] || [];
    for(var i=0; i<callbacks.length; i++) {
	callbacks[i](event, value);
    }
    doneCallback();
};

Callbacks.CallbacksBackend.prototype.dispatchNotifications = function(notificationsMap) {
    for(var callbackId in notificationsMap) {
	var callback = this.callbacksMap[callbackId];
	var deleted = notificationsMap[callbackId][Callbacks['deleted']];
	if(deleted!=null) {
	    try {
		callback(Callbacks['deleted'],deleted);
	    }catch(e){}
	}
	for(var event in notificationsMap[callbackId]) {
	    if(event!=Callbacks['deleted']) {
		try{
		    callback(event, notificationsMap[callbackId][event]);
		}catch(e){}

	    }
	}
    }
};

Callbacks.CallbacksBackend.prototype._searchCallbacksInIndex = function(index, order, event, quadPair, notificationsMap) {
    var quadPairNomalized = quadPair[1];
    var quadPair = quadPair[0];

    for(var i=0; i<(order.length+1); i++) {
	var matched = index['_'] || [];

	var filteredIds = [];
	for(var j=0; j<matched.length; j++) {
	    var callbackId = matched[j];
	    if(this.callbacksMap[callbackId] != null) {
		notificationsMap[callbackId] = notificationsMap[callbackId] || {};
		notificationsMap[callbackId][event] = notificationsMap[callbackId][event] || [];
		notificationsMap[callbackId][event].push(quadPair);
		filteredIds.push(callbackId);
	    }
	}
	index['_'] = filteredIds;
	var component = order[i];
	if(index[''+quadPairNomalized[component]] != null) {
	    index = index[''+quadPairNomalized[component]];
	} else {
	    break;
	}
    }
};

Callbacks.CallbacksBackend.prototype.subscribeEmpty = function(event, callback) {
    var callbacks = this.emptyNotificationsMap[event] || [];
    callbacks.push(callback);
    this.emptyNotificationsMap[event] = callbacks;
};

Callbacks.CallbacksBackend.prototype.unsubscribeEmpty = function(event, callback) {
    var callbacks = this.emptyNotificationsMap[event];
    if(callbacks != null) {
	callbacks = _.reject(callbacks, function(cb){ return cb === callback });
    }
    this.emptyNotificationsMap[event] = callbacks;
};

Callbacks.CallbacksBackend.prototype.subscribe = function(s,p,o,g,callback, doneCallback) {
    var quad = this._tokenizeComponents(s,p,o,g);
    var queryEnv = {blanks:{}, outCache:{}};
    this.engine.registerNsInEnvironment(null, queryEnv);
    var that = this;
    this.engine.normalizeQuad(quad, queryEnv, true, function(normalized){
	var pattern =  new Pattern(normalized);
	var indexKey = that._indexForPattern(pattern);
	var indexOrder = that.componentOrders[indexKey];
	var index = that.indexMap[indexKey];
	for(var i=0; i<indexOrder.length; i++) {
	    var component = indexOrder[i];
	    var quadValue = normalized[component];
	    if(quadValue === '_') {
		if(index['_'] == null) {
		    index['_'] = [];
		}
		that.callbackCounter++;
		index['_'].push(that.callbackCounter);
		that.callbacksMap[that.callbackCounter] = callback;
		that.callbacksInverseMap[callback] = that.callbackCounter;
		break;
	    } else {
		if(i===indexOrder.length-1) {
		    index[quadValue] = index[quadValue] || {'_':[]};
		    that.callbackCounter++;
		    index[quadValue]['_'].push(that.callbackCounter);
		    that.callbacksMap[that.callbackCounter] = callback;
		    that.callbacksInverseMap[callback] = that.callbackCounter;
		} else {
		    index[quadValue] = index[quadValue] || {};
		    index = index[quadValue];
		}
	    }
	}
	if(doneCallback != null)
	    doneCallback(true);
    });
};

Callbacks.CallbacksBackend.prototype.unsubscribe = function(callback) {
    var id = this.callbacksInverseMap[callback];
    if(id != null) {
	delete this.callbacksInverseMap[callback];
	delete this.callbacksMap[id];
    }
};

Callbacks.CallbacksBackend.prototype._tokenizeComponents = function(s, p, o, g) {
    var pattern = {};

    if(s == null) {
	pattern['subject'] = Callbacks.ANYTHING;
    } else {
	if(s.indexOf("_:") == 0) {
	    pattern['subject'] = {'token': 'blank', 'value':s};
	} else {
	    pattern['subject'] = {'token': 'uri', 'value':s};
	}
    }

    if(p == null) {
	pattern['predicate'] = Callbacks.ANYTHING;
    } else {
	pattern['predicate'] = {'token': 'uri', 'value':p};
    }

    if(o == null) {
	pattern['object'] = Callbacks.ANYTHING;
    } else {
	pattern['object'] = {'token': 'uri', 'value':o};
    }

    if(g == null) {
	pattern['graph'] = Callbacks.ANYTHING;
    } else {
	pattern['graph'] = {'token': 'uri', 'value':g};
    }

    return pattern;
};

Callbacks.CallbacksBackend.prototype._indexForPattern = function(pattern) {
    var indexKey = pattern.indexKey;
    var matchingIndices = this.indices;

    for(var i=0; i<matchingIndices.length; i++) {
	var index = matchingIndices[i];
	var indexComponents = this.componentOrders[index];
	for(var j=0; j<indexComponents.length; j++) {
	    if(_.include(indexKey, indexComponents[j])===false) {
		break;
	    }
	    if(j==indexKey.length-1) {
		return index;
	    }
	}
    }

    return 'SPOG'; // If no other match, we return the most generic index
};

Callbacks.CallbacksBackend.prototype.observeNode = function() {
    var uri,graphUri,callback,doneCallback;

    if(arguments.length === 4) {
	uri = arguments[0];
	graphUri = arguments[1];
	callback = arguments[2];
	doneCallback = arguments[3];
    } else {
	uri = arguments[0];
	graphUri = this.engine.lexicon.defaultGraphUri;
	callback = arguments[1];
	doneCallback = arguments[2];
    }
    var query = "CONSTRUCT { <" + uri + "> ?p ?o } WHERE { GRAPH <" + graphUri + "> { <" + uri + "> ?p ?o } }";
    var that = this;
    var queryEnv = {blanks:{}, outCache:{}};
    this.engine.registerNsInEnvironment(null, queryEnv);
    var bindings = [];
    this.engine.execute(query,  function(err, graph){
	if(!err) {
	    var node = graph;
	    var mustFlush = false;
	    var observer = function(event, triples){
		if(event === 'eventsFlushed' && mustFlush ) {
		    mustFlush = false;
		    try {
			callback(node);
		    }catch(e){}
		} else if(event !== 'eventsFlushed') {
		    mustFlush = true;
		    for(var i = 0; i<triples.length; i++) {
			var triple = triples[i];
			var s = RDFModel.buildRDFResource(triple.subject,bindings,that.engine,queryEnv);
			var p = RDFModel.buildRDFResource(triple.predicate,bindings,that.engine,queryEnv);
			var o = RDFModel.buildRDFResource(triple.object,bindings,that.engine,queryEnv);
			if(s!=null && p!=null && o!=null) {
			    triple = new RDFModel.Triple(s,p,o);
			    if(event === Callbacks['added']) {
				node.add(triple);
			    } else if(event === Callbacks['deleted']) {
				node.remove(triple);
			    }
			}
		    }
		}
	    };
	    that.observersMap[callback] = observer;
	    that.subscribeEmpty(Callbacks['eventsFlushed'], observer);
	    that.subscribe(uri,null,null,null,observer,function(){
		try {
		    callback(node);
		}catch(e){}

		if(doneCallback)
		    doneCallback(true)
	    });
	} else {
	    if(doneCallback)
		doneCallback(false);
	}
    });
};

Callbacks.CallbacksBackend.prototype.stopObservingNode = function(callback) {
    var observer = this.observersMap[callback];
    if(observer) {
	this.unsubscribe(observer);
	this.unsubscribeEmpty(Callbacks['eventsFlushed'],observer);
	return true;
    } else {
	return false;
    }
};

// Queries

Callbacks.CallbacksBackend.prototype.observeQuery = function(query, callback, endCallback) {
    var queryParsed = this.aqt.parseQueryString(query);
    var parsedTree = this.aqt.parseSelect(queryParsed.units[0]);
    var patterns = this.aqt.collectBasicTriples(parsedTree);
    var that = this;
    var queryEnv = {blanks:{}, outCache:{}};
    this.engine.registerNsInEnvironment(null, queryEnv);
    var counter = this.queryCounter;
    this.queryCounter++;
    this.queriesMap[counter] = query;
    this.queriesInverseMap[query] = counter;
    this.queriesList.push(counter);
    this.queriesCallbacksMap[counter] = callback;

    async.eachSeries(patterns, function(quad, k) {
	if(quad.graph == null) {
	    quad.graph = that.engine.lexicon.defaultGraphUriTerm;
	}

	that.engine.normalizeQuad(quad, queryEnv, true, function(normalized) {
	    var pattern =  new Pattern(normalized);
	    var indexKey = that._indexForPattern(pattern);
	    var indexOrder = that.componentOrders[indexKey];
	    var index = that.queriesIndexMap[indexKey];

	    for(var j=0; j<indexOrder.length; j++) {
		var component = indexOrder[j];
		var quadValue = normalized[component];
		if(typeof(quadValue) === 'string') {
		    if(index['_'] == null) {
			index['_'] = [];
		    }
		    index['_'].push(counter);
		    break;
		} else {
		    if(j===indexOrder.length-1) {
			index[quadValue] = index[quadValue] || {'_':[]};
			index[quadValue]['_'].push(counter);
		    } else {
			index[quadValue] = index[quadValue] || {};
			index = index[quadValue];
		    }
		}
	    }
	    k();
	});

    }, function(){
	that.engine.execute(query, function(err, results){
	    if(!err){
		callback(results);
	    } else {
		console.log("ERROR in query callback "+results);
	    }
	});

	if(endCallback != null)
	    endCallback();
    });
};

Callbacks.CallbacksBackend.prototype.stopObservingQuery = function(query) {
    var id = this.queriesInverseMap[query];
    if(id != null) {
	delete this.queriesInverseMap[query];
	delete this.queriesMap[id];
	this.queriesList = _.reject(this.queriesList, function(queryId){ return queryId === id });
    }
};

Callbacks.CallbacksBackend.prototype._searchQueriesInIndex = function(index, order, quadPair) {
    var quadPairNomalized = quadPair[1];
    var quadPair = quadPair[0];

    for(var i=0; i<(order.length+1); i++) {
	var matched = index['_'] || [];

	var filteredIds = [];
	for(var j=0; j<matched.length; j++) {
	    var queryId = matched[j];
	    if(_.include(this.pendingQueries,queryId)) {
		_.remove(this.pendingQueries,function(pendingQueryId){ return pendingQueryId === queryId });
		this.matchedQueries.push(queryId);
	    }
	    // removing IDs for queries no longer being observed
	    if(this.queriesMap[queryId] != null) {
		filteredIds.push(queryId);
	    }
	}
	index['_'] = filteredIds;

	var component = order[i];
	if(index[''+quadPairNomalized[component]] != null) {
	    index = index[''+quadPairNomalized[component]];
	} else {
	    break;
	}
    }
};

Callbacks.CallbacksBackend.prototype.dispatchQueries = function(callback) {
    var that = this;
    var query, queryCallback;
    var toDispatchMap = {};

    async.eachSeries(this.matchedQueries, function(queryId,k) {
	// avoid duplicate notifications
	if(toDispatchMap[queryId] == null) {
	    toDispatchMap[queryId] = true;
	    query = that.queriesMap[queryId];
	    queryCallback = that.queriesCallbacksMap[queryId];

	    that.engine.execute(query,
		function(err, results){
		    if(!err) {
			try{
			    queryCallback(results);
			}catch(e){}
		    }
		    k();
		});
	} else {
	    k();
	}
    }, function(){
	callback();
    });
};

Callbacks.CallbacksBackend.added = Callbacks.added;
Callbacks.CallbacksBackend.deleted = Callbacks.deleted;
Callbacks.CallbacksBackend.eventsFlushed = Callbacks.eventsFlushed;

module.exports = Callbacks;

},{"./abstract_query_tree":37,"./quad_index":48,"./rdf_model":53,"./utils":55}],41:[function(_dereq_,module,exports){
var jsonld = _dereq_('jsonld');

var toTriples = function (input, graph, cb) {
    var rval = null;

    // normalize input
    jsonld.normalize(input, {}, function (err, normalized) {
        if (err)
            cb(err);
        else {
            var parseTerm = function (term) {
                if (term.type === 'blank node') {
                    return {'blank': term.value};
                } else if (term.type === 'IRI') {
                    return {'token': 'uri', 'value': term.value};
                } else if (term.type === 'literal') {
                    if (term.datatype !== null) {
                        return {'literal': '"' + term.value + '"^^<' + term.datatype + ">"};
                    } else if (term.language != null) {
                        return {'literal': '"' + term.value + '"@' + term.language};
                    } else {
                        return {'literal': '"' + term.value + '"'};

                    }
                }
            };

            rval = [];
            var callback = function (s, p, o) {
                rval.push({
                    'subject': parseTerm(s),
                    'predicate': parseTerm(p),
                    'object': parseTerm(o),
                    'graph': graph
                });
            };


            // generate triples
            var quit = false;
            for (var p in normalized) {
                var triples = normalized[p];
                for (var i = 0; i < triples.length; i++) {
                    var triple = triples[i];
                    callback(triple.subject, triple.predicate, triple.object);
                }
            }

            cb(null, rval);

        }
    });
};


// exports
exports.JSONLDParser = {};
var JSONLDParser = exports.JSONLDParser;

JSONLDParser.parser = {

    async: true,

    parse: function (data, graph, options, callback) {
        try {
            if (typeof(data) === 'string') {
                data = JSON.parse(data);
            }
            toTriples(data, graph, callback);
        } catch (error) {
            callback(error);
        }

    }

};

module.exports = {
    JSONLDParser: JSONLDParser
};



},{"jsonld":32}],42:[function(_dereq_,module,exports){
var async = _dereq_('./utils');
var Tree = _dereq_('./btree').Tree;

/**
 * Temporal implementation of the lexicon
 */


Lexicon = function(callback){
    var that = this;
    this.defaultGraphOid = 0;
    this.defaultGraphUri = "https://github.com/antoniogarrote/rdfstore-js#default_graph";
    this.defaultGraphUriTerm = {"token":"uri","prefix":null,"suffix":null,"value":this.defaultGraphUri};
    this.oidCounter = 1;

    async.seq(function(k){
        new Tree(2,function(tree){
            that.uris = tree;
            k();
        })
    }, function(k){
        new Tree(2, function(tree){
            that.literals = tree;
            k();
        })
    }, function(k){
        new Tree(2, function(tree){
            that.knownGraphs = tree;
            k();
        })
    },function(k){
        new Tree(2,function(tree){
            that.oidUris = tree;
            k();
        })
    }, function(k){
        new Tree(2, function(tree){
            that.oidLiterals = tree;
            k();
        })
    }, function(k){
        new Tree(2, function(tree){
            that.oidBlanks = tree;
            k();
        })
    })(function(){
        if(callback != null)
            callback(that);

    });
};

/**
 * Registers a new graph in the lexicon list of known graphs.
 * @param oid
 * @param uriToken
 * @param callback
 */
Lexicon.prototype.registerGraph = function(oid, uriToken, callback){
    if(oid != this.defaultGraphOid) {
        this.knownGraphs.insert(oid, uriToken, function(){
           callback();
        });
    } else {
        callback();
    }
};

/**
 * Returns the list of known graphs OIDs or URIs.
 * @param returnUris
 * @param callback
 */
Lexicon.prototype.registeredGraphs = function(returnUris, callback) {
    var graphs = [];
    this.knownGraphs.walk(function(node){
        if(returnUris === true) {
            graphs.push(node.data);
        } else {
            graphs.push(node.key);
        }
    },function(){
        callback(graphs);
    });
};

/**
 * Registers a URI in the lexicon. It returns the allocated OID for the URI.
 * As a side effect it increases the cost counter for that URI if it is already registered.
 * @param uri
 * @param callback
 * @returns URI's OID.
 */
Lexicon.prototype.registerUri = function(uri, callback) {
    var that = this;
    if(uri === this.defaultGraphUri) {
        callback(this.defaultGraphOid);
    } else{
        this.uris.search(uri, function(oidData){
            if(oidData == null){
                var oid = that.oidCounter;
                var oidStr = 'u'+oid;
                that.oidCounter++;

                async.seq(function(k){
                    that.uris.insert(uri, [oid,0], function(){
                        k();
                    })
                }, function(k){
                    that.oidUris.insert(oidStr, uri, function(){
                        k();
                    })
                })(function(){
                    callback(oid);
                });

            } else {
                oid = oidData[0];
                oidData[1] = oidData[1] + 1;
                callback(oid);
            }
        });
    }
};

/**
 * Returns the OID associated to the URI.
 * If the URI hasn't been  associated in the lexicon, -1 is returned.
 * @param uri
 * @param callback
 */
Lexicon.prototype.resolveUri = function(uri,callback) {
    if(uri === this.defaultGraphUri) {
        callback(this.defaultGraphOid);
    } else {
        this.uris.search(uri, function(oidData){
            if(oidData != null) {
                callback(oidData[0]);
            } else {
                callback(-1);
            }
        });
    }
};

/**
 * Returns the cost associated to the URI.
 * If the URI hasn't been associated in the lexicon, -1 is returned.
 * @param uri
 * @returns {*}
 */
Lexicon.prototype.resolveUriCost = function(uri, callback) {
    if(uri === this.defaultGraphUri) {
        callback(0);
    } else {
        this.uris.search(uri, function(oidData){
            if(oidData != null) {
                callback(oidData[1]);
            } else {
                callback(-1);
            }
        });
    }
};

/**
 * Register a new blank node in the lexicon.
 * @param label
 * @returns {string}
 */
Lexicon.prototype.registerBlank = function(callback) {
    var oid = this.oidCounter;
    this.oidCounter++;
    var oidStr = ""+oid;
    this.oidBlanks.insert(oidStr, oidStr, function(){
        callback(oid);
    })
};

/**
 * @TODO: check this implementation. It shouldn't be possible to
 * use blank nodes by name, but it's not clear what happens when parsing.
 * @param label
 * @param callback
 */
Lexicon.prototype.resolveBlank = function(label,callback) {
    var that = this;
    this.oidBlanks.search(label, function(oidData){
        if(oidData != null) {
            callback(oidData);
        } else {
            // ??
            var oid = that.oidCounter;
            this.oidCounter++;
            callback(""+oid);
            //
        }
    });
};

/**
 * Blank nodes don't have an associated cost.
 * @param label
 * @param callback
 * @returns {number}
 */
Lexicon.prototype.resolveBlankCost = function(label, callback) {
    callback(0);
};

/**
 * Registers a new literal in the index.
 * @param literal
 * @param callback
 * @returns the OID of the newly registered literal
 */
Lexicon.prototype.registerLiteral = function(literal, callback) {
    var that = this;

        this.literals.search(literal, function(oidData){
            if(oidData == null){
                var oid = that.oidCounter;
                var oidStr = 'l'+oid;
                that.oidCounter++;

                async.seq(function(k){
                    that.literals.insert(literal, [oid,0], function(){
                        k();
                    })
                }, function(k){
                    that.oidLiterals.insert(oidStr, literal, function(){
                        k();
                    })
                })(function(){
                    callback(oid);
                });

            } else {
                var oid = oidData[0];
                oidData[1] = oidData[1] + 1;
                callback(oid);
            }
        });
};

/**
 * Returns the OID of the resolved literal or -1 if no literal is found.
 * @param literal
 * @param callback
 */
Lexicon.prototype.resolveLiteral = function (literal,callback) {
    this.literals.search(literal, function(oidData){
        if(oidData != null) {
            callback(oidData[0]);
        } else {
            callback(-1);
        }
    });
};

/**
 * Returns the cost associated to the literal or -1 if no literal is found.
 * @param literal
 * @param callback
 */
Lexicon.prototype.resolveLiteralCost = function (literal,callback) {
    this.literals.search(literal, function(oidData){
        if(oidData != null) {
            callback(oidData[1]);
        } else {
            callback(-1);
        }
    });
};


/**
 * Transforms a literal string into a token object.
 * @param literalString
 * @returns A token object with the parsed literal.
 */
Lexicon.prototype.parseLiteral = function(literalString) {
    var parts = literalString.lastIndexOf("@");
    if(parts!=-1 && literalString[parts-1]==='"' && literalString.substring(parts, literalString.length).match(/^@[a-zA-Z\-]+$/g)!=null) {
        var value = literalString.substring(1,parts-1);
        var lang = literalString.substring(parts+1, literalString.length);
        return {token: "literal", value:value, lang:lang};
    }

    var parts = literalString.lastIndexOf("^^");
    if(parts!=-1 && literalString[parts-1]==='"' && literalString[parts+2] === '<' && literalString[literalString.length-1] === '>') {
        var value = literalString.substring(1,parts-1);
        var type = literalString.substring(parts+3, literalString.length-1);

        return {token: "literal", value:value, type:type};
    }

    var value = literalString.substring(1,literalString.length-1);
    return {token:"literal", value:value};
};

/**
 * Parses a literal URI string into a token object
 * @param uriString
 * @returns A token object with the parsed URI.
 */
Lexicon.prototype.parseUri = function(uriString) {
    return {token: "uri", value:uriString};
};

/**
 * Retrieves a token containing the URI, literal or blank node associated
 * to the provided OID.
 * If no value is found, null is returned.
 * @param oid
 * @param callback
 * @returns parsed token or null if not found.
 */
Lexicon.prototype.retrieve = function(oid, callback) {
    var that = this;

    if(oid === this.defaultGraphOid) {
        callback({
            token: "uri",
            value:this.defaultGraphUri,
            prefix: null,
            suffix: null,
            defaultGraph: true
        });
    } else {

        async.seq(function(found,k){
            that.oidUris.search('u'+oid, function(maybeUri) {
                if(maybeUri != null) {
                    k(null,that.parseUri(maybeUri));
                } else {
                    k(null,null);
                }
            })
        }, function(found,k){
            if(found == null) {
                that.oidLiterals.search('l'+oid, function(maybeLiteral) {
                    if (maybeLiteral != null) {
                        k(null,that.parseLiteral(maybeLiteral));
                    } else {
                        k(null,null);
                    }
                });
            } else {
                k(null,found);
            }
        }, function(found,k){
            if(found == null) {
                that.oidBlanks.search(''+oid, function(maybeBlank) {
                    if (maybeBlank != null) {
                        k(null,{token:"blank", value:"_:"+oid});
                    } else {
                        k(null,null);
                    }
                });
            } else {
                k(null,found);
            }
        })(null,function(_,found){
            callback(found);
        });
    }
};

/**
 * Empties the lexicon and restarts the counters.
 * @param callback
 */
Lexicon.prototype.clear = function(callback) {
    var that = this;
    this.defaultGraphOid = 0;
    this.defaultGraphUri = "https://github.com/antoniogarrote/rdfstore-js#default_graph";
    this.defaultGraphUriTerm = {"token":"uri","prefix":null,"suffix":null,"value":this.defaultGraphUri};
    this.oidCounter = 1;

    async.seq(function(k){
        new Tree(2,function(tree){
            that.uris = tree;
            k();
        })
    }, function(k){
        new Tree(2, function(tree){
            that.literals = tree;
            k();
        })
    }, function(k){
        new Tree(2, function(tree){
            that.knownGraphs = tree;
            k();
        })
    },function(k){
        new Tree(2,function(tree){
            that.oidUris = tree;
            k();
        })
    }, function(k){
        new Tree(2, function(tree){
            that.oidLiterals = tree;
            k();
        })
    }, function(k){
        new Tree(2, function(tree){
            that.oidBlanks = tree;
            k();
        })
    })(function(){
        if(callback != null)
            callback();

    });
};

/**
 * Removes the values associated to the subject, predicate, object and graph
 * values of the provided quad.
 * @param quad
 * @param key
 * @param callback
 */
Lexicon.prototype.unregister = function (quad, key, callback) {
    var that = this;
    async.seq(function(k){
        that._unregisterTerm(quad.subject.token, key.subject,k);
    }, function(k){
        that._unregisterTerm(quad.predicate.token, key.predicate,k);
    }, function(k){
        that._unregisterTerm(quad.object.token, key.object, k);
    }, function(k){
        if (quad.graph != null) {
            that._unregisterTerm(quad.graph.token, key.graph, k);
        } else {
            k();
        }
    })(function(){
        callback(true);
    });
};

/**
 * Unregisters a value, either URI, literal or blank.
 * @param kind
 * @param oid
 * @param callback
 * @private
 */
Lexicon.prototype._unregisterTerm = function (kind, oid, callback) {
    var that = this;
    if (kind === 'uri') {
        if (oid != this.defaultGraphOid) {
            var oidStr = 'u' + oid;
            that.oidUris.search(oidStr, function(uri) {
                that.uris.search(uri, function(oidData){
                    var counter = oidData[1];
                    if ("" + oidData[0] === "" + oid) {
                        if (counter === 0) {
                            async.seq(function(k) {
                                that.oidUris.delete(oidStr, function () {
                                    k();
                                });
                            }, function(k){
                                that.uris.delete(uri, function(){
                                    k();
                                });
                            }, function(k){
                                // delete the graph oid from known graphs
                                // in case this URI is a graph identifier
                                that.knownGraphs.delete(oid, function(){
                                   k();
                                }) ;
                            })(function(){
                                callback();
                            })
                        } else {
                            that.uris.insert(uri,[oid, counter - 1], function(){
                                callback();
                            });
                        }
                    } else {
                        callback();
                    }
                });
            });

        } else {
            callback();
        }
    } else if (kind === 'literal') {
        this.oidCounter++;
        var oidStr = 'l' + oid;

        that.oidLiterals.search(oidStr, function(literal) {
            that.literals.search(literal, function(oidData){
                var counter = oidData[1];
                if ("" + oidData[0] === "" + oid) {
                    if (counter === 0) {
                        async.seq(function(k) {
                            that.oidLiterals.delete(oidStr, function () {
                                k();
                            });
                        }, function(k){
                            that.literals.delete(literal, function(){
                                k();
                            });
                        })(function(){
                            callback();
                        })
                    } else {
                        that.literals.insert(literal,[oid, counter - 1], function(){
                            callback();
                        });
                    }
                } else {
                    callback();
                }
            });
        });

    } else if (kind === 'blank') {
        that.oidBlanks.delete("" + oid, function(){
            callback();
        })
    } else {
        callback();
    }
};

module.exports = {
    Lexicon: Lexicon
};
},{"./btree":38,"./utils":55}],43:[function(_dereq_,module,exports){
var http = _dereq_("http");
var https = _dereq_("https");
var url = _dereq_("url");

NetworkTransport = {

    load: function(uri, accept, callback, redirect) {
        var redirection = redirect==null ? 3 : redirect;
        var parts = url.parse(uri, true, true);

        var params = {
            'host': parts.host,
            'hostname': parts.hostname,
            'method': 'GET',
            'path': parts.path,
            'headers': {'host':parts.hostname, 'Accept':accept}
        };

        var client = null;

        if(parts.protocol === 'http:') {
            params.port = (parts.port || 80);
            client = http;
        } else if(parts.protocol === 'https:') {
            params.port = (parts.port || 443);
            client = https;
        }

        var request = client.request(params, function(response){
            var headers = response.headers;
            var data = "";

            if((""+response.statusCode)[0] == '2') {
                response.on('end', function() {
                    callback(null, {headers: headers, data: data});
                });
                response.on('data', function(chunk) {
                    data = data + chunk;
                });
            } else if((""+response.statusCode)[0] == '3'){
                if(redirection == 0) {
                    callback(new Error("Too many redirections"));
                } else {
                    var location = (headers["Location"] || headers["location"]);
                    if(location != null) {
                        NetworkTransport.load(location, accept, callback, (redirection -1));
                    } else {
                        callback(new Error("Redirection without location header"));
                    }
                }
            } else {
                callback(new Error("HTTP error: "+response.statusCode));
            }
        });

        request.on('error', callback);

        request.end();
    }

};

module.exports = {
    NetworkTransport: NetworkTransport
};
},{"http":6,"https":10,"url":28}],44:[function(_dereq_,module,exports){
module.exports = (function() {
  /*
   * Generated by PEG.js 0.8.0.
   *
   * http://pegjs.majda.cz/
   */

  function peg$subclass(child, parent) {
    function ctor() { this.constructor = child; }
    ctor.prototype = parent.prototype;
    child.prototype = new ctor();
  }

  function SyntaxError(message, expected, found, offset, line, column) {
    this.message  = message;
    this.expected = expected;
    this.found    = found;
    this.offset   = offset;
    this.line     = line;
    this.column   = column;

    this.name     = "SyntaxError";
  }

  peg$subclass(SyntaxError, Error);

  function parse(input) {
    var options = arguments.length > 1 ? arguments[1] : {},

        peg$FAILED = {},

        peg$startRuleIndices = { DOCUMENT: 0 },
        peg$startRuleIndex   = 0,

        peg$consts = [
          { type: "other", description: "[1] QueryUnit" },
          { type: "other", description: "[2] Query" },
          peg$FAILED,
          function(p, q, v) {
              return {
                  token: 'query',
                  kind: 'query',
                  prologue: p,
                  units: [q],
                  inlineData: v
              }
          },
          { type: "other", description: "[3] Prologue" },
          null,
          [],
          function(b, pfx) {
              return { token: 'prologue',
                  base: b,
                  prefixes: pfx }
          },
          { type: "other", description: "[4] BaseDecl" },
          "BASE",
          { type: "literal", value: "BASE", description: "\"BASE\"" },
          "base",
          { type: "literal", value: "base", description: "\"base\"" },
          function(i) {
              registerDefaultPrefix(i);

              var base = {};
              base.token = 'base';
              base.value = i;

              return base;
          },
          { type: "other", description: "[5] PrefixDecl" },
          "PREFIX",
          { type: "literal", value: "PREFIX", description: "\"PREFIX\"" },
          "prefix",
          { type: "literal", value: "prefix", description: "\"prefix\"" },
          function(p, l) {

              registerPrefix(p,l);

              var prefix = {};
              prefix.token = 'prefix';
              prefix.prefix = p;
              prefix.local = l;

              return prefix;
          },
          { type: "other", description: "[6] SelectQuery" },
          function(s, gs, w, sm) {

              var dataset = {'named':[], 'implicit':[]};
              for(var i=0; i<gs.length; i++) {
                  var g = gs[i];
                  if(g.kind === 'default') {
                      dataset['implicit'].push(g.graph);
                  } else {
                      dataset['named'].push(g.graph)
                  }
              }


              if(dataset['named'].length === 0 && dataset['implicit'].length === 0) {
                  dataset['implicit'].push({token:'uri',
                      prefix:null,
                      suffix:null,
                      value:'https://github.com/antoniogarrote/rdfstore-js#default_graph'});
              }

              var query = {};
              query.kind = 'select';
              query.token = 'executableunit';
              query.dataset = dataset;
              query.projection = s.vars;
              query.modifier = s.modifier;
              query.pattern = w;

              if(sm!=null && sm.limit!=null) {
                  query.limit = sm.limit;
              }
              if(sm!=null && sm.offset!=null) {
                  query.offset = sm.offset;
              }
              if(sm!=null && (sm.order!=null && sm.order!="")) {
                  query.order = sm.order;
              }
              if(sm!=null && sm.group!=null) {
                  query.group = sm.group;
              }

              return query;
          },
          { type: "other", description: "[7] SubSelect" },
          function(s, w, sm) {

              var query = {};
              query.kind = 'select';
              query.token = 'subselect';
              query.projection = s.vars;
              query.modifier = s.modifier;
              query.pattern = w;

              if(sm!=null && sm.limit!=null) {
                  query.limit = sm.limit;
              }
              if(sm!=null && sm.offset!=null) {
                  query.offset = sm.offset;
              }
              if(sm!=null && (sm.order!=null && sm.order!="")) {
                  query.order = sm.order;
              }
              if(sm!=null && sm.group!=null) {
                  query.group = sm.group;
              }

              return query;

          },
          { type: "other", description: "[8] SelectClause" },
          "SELECT",
          { type: "literal", value: "SELECT", description: "\"SELECT\"" },
          "select",
          { type: "literal", value: "select", description: "\"select\"" },
          "DISTINCT",
          { type: "literal", value: "DISTINCT", description: "\"DISTINCT\"" },
          "distinct",
          { type: "literal", value: "distinct", description: "\"distinct\"" },
          "REDUCED",
          { type: "literal", value: "REDUCED", description: "\"REDUCED\"" },
          "reduced",
          { type: "literal", value: "reduced", description: "\"reduced\"" },
          "(",
          { type: "literal", value: "(", description: "\"(\"" },
          "AS",
          { type: "literal", value: "AS", description: "\"AS\"" },
          "as",
          { type: "literal", value: "as", description: "\"as\"" },
          ")",
          { type: "literal", value: ")", description: "\")\"" },
          "*",
          { type: "literal", value: "*", description: "\"*\"" },
          function(mod, proj) {
              var vars = [];
              if(proj.length === 3 && proj[1]==="*") {
                  return {vars: [{token: 'variable', kind:'*'}], modifier:arrayToString(mod)};
              }

              for(var i=0; i< proj.length; i++) {
                  var aVar = proj[i];

                  if(aVar.length === 3) {
                      vars.push({token: 'variable', kind:'var', value:aVar[1]});
                  } else {
                      vars.push({token: 'variable', kind:'aliased', expression: aVar[3], alias:aVar[7]})
                  }
              }

              return {vars: vars, modifier:arrayToString(mod)};
          },
          { type: "other", description: "[9] ConstructQuery" },
          "CONSTRUCT",
          { type: "literal", value: "CONSTRUCT", description: "\"CONSTRUCT\"" },
          "construct",
          { type: "literal", value: "construct", description: "\"construct\"" },
          function(t, gs, w, sm) {
              var dataset = {'named':[], 'implicit':[]};
              for(var i=0; i<gs.length; i++) {
                  var g = gs[i];
                  if(g.kind === 'default') {
                      dataset['implicit'].push(g.graph);
                  } else {
                      dataset['named'].push(g.graph)
                  }
              }


              if(dataset['named'].length === 0 && dataset['implicit'].length === 0) {
                  dataset['implicit'].push({token:'uri',
                      prefix:null,
                      suffix:null,
                      value:'https://github.com/antoniogarrote/rdfstore-js#default_graph'});
              }

              var query = {};
              query.kind = 'construct';
              query.token = 'executableunit'
              query.dataset = dataset;
              query.template = t;
              query.pattern = w;

              if(sm!=null && sm.limit!=null) {
                  query.limit = sm.limit;
              }
              if(sm!=null && sm.offset!=null) {
                  query.offset = sm.offset;
              }
              if(sm!=null && (sm.order!=null && sm.order!="")) {
                  query.order = sm.order;
              }
              return query

          },
          "WHERE",
          { type: "literal", value: "WHERE", description: "\"WHERE\"" },
          "where",
          { type: "literal", value: "where", description: "\"where\"" },
          "{",
          { type: "literal", value: "{", description: "\"{\"" },
          "}",
          { type: "literal", value: "}", description: "\"}\"" },
          function(gs, t, sm) {
              var dataset = {'named':[], 'implicit':[]};
              for(var i=0; i<gs.length; i++) {
                  var g = gs[i];
                  if(g.kind === 'default') {
                      dataset['implicit'].push(g.graph);
                  } else {
                      dataset['named'].push(g.graph)
                  }
              }


              if(dataset['named'].length === 0 && dataset['implicit'].length === 0) {
                  dataset['implicit'].push({token:'uri',
                      prefix:null,
                      suffix:null,
                      value:'https://github.com/antoniogarrote/rdfstore-js#default_graph'});
              }

              var query = {};
              query.kind = 'construct';
              query.token = 'executableunit'
              query.dataset = dataset;
              query.template = t;
              query.pattern = {
                  token: "basicgraphpattern",
                  triplesContext: t.triplesContext
              };

              if(sm!=null && sm.limit!=null) {
                  query.limit = sm.limit;
              }
              if(sm!=null && sm.offset!=null) {
                  query.offset = sm.offset;
              }
              if(sm!=null && (sm.order!=null && sm.order!="")) {
                  query.order = sm.order;
              }
              return query
          },
          { type: "other", description: "[10] DescribeQuery" },
          "DESCRIBE",
          { type: "literal", value: "DESCRIBE", description: "\"DESCRIBE\"" },
          { type: "other", description: "[11] AskQuery" },
          "ASK",
          { type: "literal", value: "ASK", description: "\"ASK\"" },
          "ask",
          { type: "literal", value: "ask", description: "\"ask\"" },
          function(gs, w) {
              var dataset = {'named':[], 'implicit':[]};
              for(var i=0; i<gs.length; i++) {
                  var g = gs[i];
                  if(g.kind === 'implicit') {
                      dataset['implicit'].push(g.graph);
                  } else {
                      dataset['named'].push(g.graph)
                  }
              }


              if(dataset['named'].length === 0 && dataset['implicit'].length === 0) {
                  dataset['implicit'].push({token:'uri',
                      prefix:null,
                      suffix:null,
                      value:'https://github.com/antoniogarrote/rdfstore-js#default_graph'});
              }

              var query = {};
              query.kind = 'ask';
              query.token = 'executableunit'
              query.dataset = dataset;
              query.pattern = w

              return query
          },
          { type: "other", description: "[12] DatasetClause" },
          "FROM",
          { type: "literal", value: "FROM", description: "\"FROM\"" },
          "from",
          { type: "literal", value: "from", description: "\"from\"" },
          function(gs) {
              return gs;
          },
          { type: "other", description: "[13] DefaultGraphClause" },
          function(s) {
              return {graph:s , kind:'default', token:'graphClause'}
          },
          { type: "other", description: "[14] NamedGraphClause" },
          "NAMED",
          { type: "literal", value: "NAMED", description: "\"NAMED\"" },
          "named",
          { type: "literal", value: "named", description: "\"named\"" },
          function(s) {
              return {graph:s, kind:'named', token:'graphCluase'};
          },
          { type: "other", description: "[15] SourceSelector" },
          { type: "other", description: "[16] WhereClause" },
          function(g) {
              return g;
          },
          { type: "other", description: "[17] SolutionModifier" },
          function(gc, oc, lo) {
              var acum = {};
          if(lo != null) {
              if(lo.limit != null) {
                  acum.limit = lo.limit;
              }
              if(lo.offset != null) {
                  acum.offset = lo.offset;
              }
          }

          if(gc != null) {
              acum.group = gc;
          }

          acum.order = oc;

          return acum
          },
          { type: "other", description: "[18] GroupClause" },
          "GROUP",
          { type: "literal", value: "GROUP", description: "\"GROUP\"" },
          "group",
          { type: "literal", value: "group", description: "\"group\"" },
          "BY",
          { type: "literal", value: "BY", description: "\"BY\"" },
          "by",
          { type: "literal", value: "by", description: "\"by\"" },
          function(conds) {
              return conds;
          },
          { type: "other", description: "[19] GroupCondition" },
          function(b) {
              return b;
          },
          function(f) {
              return f;
          },
          function(e, alias) {
              if(alias.length != 0) {
              return {token: 'aliased_expression',
                  expression: e,
                  alias: alias[2] };
          } else {
              return e;
          }
          },
          function(v) {
              return v;
          },
          { type: "other", description: "[20] HavingClause" },
          "HAVING",
          { type: "literal", value: "HAVING", description: "\"HAVING\"" },
          { type: "other", description: "[21] HavingCondition" },
          { type: "other", description: "[22] OrderClause" },
          "ORDER",
          { type: "literal", value: "ORDER", description: "\"ORDER\"" },
          "order",
          { type: "literal", value: "order", description: "\"order\"" },
          function(os) {
              return os;
          },
          { type: "other", description: "[23] OrderCondition" },
          "ASC",
          { type: "literal", value: "ASC", description: "\"ASC\"" },
          "asc",
          { type: "literal", value: "asc", description: "\"asc\"" },
          "DESC",
          { type: "literal", value: "DESC", description: "\"DESC\"" },
          "desc",
          { type: "literal", value: "desc", description: "\"desc\"" },
          function(direction, e) {
              return { direction: direction.toUpperCase(), expression:e };
          },
          function(e) {
              if(e.token === 'var') {
              var e = { token:'expression',
                  expressionType:'atomic',
                  primaryexpression: 'var',
                  value: e };
          }
          return { direction: 'ASC', expression:e };
          },
          { type: "other", description: "[24] LimitOffsetClauses" },
          function(cls) {
              var acum = {};
              for(var i=0; i<cls.length; i++) {
                  var cl = cls[i];
                  if(cl != null && cl.limit != null) {
                      acum['limit'] = cl.limit;
                  } else if(cl != null && cl.offset != null){
                      acum['offset'] = cl.offset;
                  }
              }

              return acum;
          },
          { type: "other", description: "[25] LimitClause" },
          "LIMIT",
          { type: "literal", value: "LIMIT", description: "\"LIMIT\"" },
          "limit",
          { type: "literal", value: "limit", description: "\"limit\"" },
          function(i) {
              return { limit:parseInt(i.value) };
          },
          { type: "other", description: "[26] OffsetClause" },
          "OFFSET",
          { type: "literal", value: "OFFSET", description: "\"OFFSET\"" },
          "offset",
          { type: "literal", value: "offset", description: "\"offset\"" },
          function(i) {
              return { offset:parseInt(i.value) };
          },
          { type: "other", description: "[27] BindingsClause" },
          "BINDINGS",
          { type: "literal", value: "BINDINGS", description: "\"BINDINGS\"" },
          { type: "other", description: "[28] BindingValue" },
          "UNDEF",
          { type: "literal", value: "UNDEF", description: "\"UNDEF\"" },
          { type: "other", description: "[28]  \tValuesClause\t  ::=  \t( 'VALUES' DataBlock )?" },
          "VALUES",
          { type: "literal", value: "VALUES", description: "\"VALUES\"" },
          "values",
          { type: "literal", value: "values", description: "\"values\"" },
          function(b) {
               if(b != null) {
                 return b[1];
               } else {
                 return null;
               }
          },
          { type: "other", description: "[29] UpdateUnit" },
          { type: "other", description: "[30] Update" },
          ";",
          { type: "literal", value: ";", description: "\";\"" },
          function(p, u, us) {

              var query = {};
          query.token = 'query';
          query.kind = 'update'
          query.prologue = p;

          var units = [u];

          if(us != null && us.length != null && us[3] != null && us[3].units != null) {
              units = units.concat(us[3].units);
          }

          query.units = units;
          return query;
          },
          { type: "other", description: "[31] Update1" },
          { type: "other", description: "[32] Load" },
          "LOAD",
          { type: "literal", value: "LOAD", description: "\"LOAD\"" },
          "load",
          { type: "literal", value: "load", description: "\"load\"" },
          "INTO",
          { type: "literal", value: "INTO", description: "\"INTO\"" },
          "into",
          { type: "literal", value: "into", description: "\"into\"" },
          function(sg, dg) {
              var query = {};
          query.kind = 'load';
          query.token = 'executableunit';
          query.sourceGraph = sg;
          if(dg != null) {
              query.destinyGraph = dg[2];
          }
          return query;
          },
          { type: "other", description: "[33] Clear" },
          "CLEAR",
          { type: "literal", value: "CLEAR", description: "\"CLEAR\"" },
          "clear",
          { type: "literal", value: "clear", description: "\"clear\"" },
          "SILENT",
          { type: "literal", value: "SILENT", description: "\"SILENT\"" },
          "silent",
          { type: "literal", value: "silent", description: "\"silent\"" },
          function(ref) {
              var query = {};
              query.kind = 'clear';
              query.token = 'executableunit'
              query.destinyGraph = ref;

              return query;
          },
          { type: "other", description: "[34] Drop" },
          "DROP",
          { type: "literal", value: "DROP", description: "\"DROP\"" },
          "drop",
          { type: "literal", value: "drop", description: "\"drop\"" },
          function(ref) {
              var query = {};
              query.kind = 'drop';
              query.token = 'executableunit'
              query.destinyGraph = ref;

              return query;
          },
          { type: "other", description: "[35] Create" },
          "CREATE",
          { type: "literal", value: "CREATE", description: "\"CREATE\"" },
          "create",
          { type: "literal", value: "create", description: "\"create\"" },
          function(ref) {
              var query = {};
              query.kind = 'create';
              query.token = 'executableunit'
              query.destinyGraph = ref;

              return query;
          },
          { type: "other", description: "[36] InsertData" },
          "INSERT",
          { type: "literal", value: "INSERT", description: "\"INSERT\"" },
          "insert",
          { type: "literal", value: "insert", description: "\"insert\"" },
          "DATA",
          { type: "literal", value: "DATA", description: "\"DATA\"" },
          "data",
          { type: "literal", value: "data", description: "\"data\"" },
          function(qs) {
              var query = {};
              query.kind = 'insertdata';
              query.token = 'executableunit'
              query.quads = qs;

              return query;
          },
          { type: "other", description: "[37] DeleteData" },
          "DELETE",
          { type: "literal", value: "DELETE", description: "\"DELETE\"" },
          "delete",
          { type: "literal", value: "delete", description: "\"delete\"" },
          function(qs) {
              var query = {};
              query.kind = 'deletedata';
              query.token = 'executableunit'
              query.quads = qs;

              return query;
          },
          { type: "other", description: "[38] DeleteWhere" },
          function(p) {
              var query = {};
              query.kind = 'modify';
              query.pattern = p;
              query.with = null;
              query.using = null;

              var quads = [];


              var patternsCollection = p.patterns[0];
              if(patternsCollection.triplesContext == null && patternsCollection.patterns!=null) {
                  patternsCollection = patternsCollection.patterns[0].triplesContext;
              } else {
                  patternsCollection = patternsCollection.triplesContext;
              }

              for(var i=0; i<patternsCollection.length; i++) {
                  var quad = {};
                  var contextQuad = patternsCollection[i];

                  quad['subject'] = contextQuad['subject'];
                  quad['predicate'] = contextQuad['predicate'];
                  quad['object'] = contextQuad['object'];
                  quad['graph'] = contextQuad['graph'];

                  quads.push(quad);
              }

              query.delete = quads;

              return query;
          },
          { type: "other", description: "[39] Modify" },
          "WITH",
          { type: "literal", value: "WITH", description: "\"WITH\"" },
          "with",
          { type: "literal", value: "with", description: "\"with\"" },
          function(wg, dic, uc, p) {
              var query = {};
          query.kind = 'modify';

          if(wg != "" && wg != null) {
              query.with = wg[2];
          } else {
              query.with = null;
          }


          if(dic.length === 3 && (dic[2] === ''|| dic[2] == null)) {
              query.delete = dic[0];
              query.insert = null;
          } else if(dic.length === 3 && dic[0].length != null && dic[1].length != null && dic[2].length != null) {
              query.delete = dic[0];
              query.insert = dic[2];
          } else  {
              query.insert = dic;
              query.delete = null;
          }

          if(uc != '') {
              query.using = uc;
          }

          query.pattern = p;

          return query;
          },
          { type: "other", description: "[40] DeleteClause" },
          function(q) {
              return q;
          },
          { type: "other", description: "[41] InsertClause" },
          { type: "other", description: "[42] UsingClause" },
          "USING",
          { type: "literal", value: "USING", description: "\"USING\"" },
          "using",
          { type: "literal", value: "using", description: "\"using\"" },
          function(g) {
              if(g.length!=null) {
                  return {kind: 'named', uri: g[2]};
              } else {
                  return {kind: 'default', uri: g};
              }
          },
          { type: "other", description: "[43] GraphRef" },
          "GRAPH",
          { type: "literal", value: "GRAPH", description: "\"GRAPH\"" },
          "graph",
          { type: "literal", value: "graph", description: "\"graph\"" },
          function(i) {
              return i;
          },
          { type: "other", description: "[44] GraphRefAll" },
          "DEFAULT",
          { type: "literal", value: "DEFAULT", description: "\"DEFAULT\"" },
          "default",
          { type: "literal", value: "default", description: "\"default\"" },
          function() {
              return 'default';
          },
          function() {
              return 'named';
          },
          "ALL",
          { type: "literal", value: "ALL", description: "\"ALL\"" },
          "all",
          { type: "literal", value: "all", description: "\"all\"" },
          function() {
              return 'all';
          },
          { type: "other", description: "[45] QuadPattern" },
          function(qs) {
              return qs.quadsContext;
          },
          { type: "other", description: "[46] QuadData" },
          { type: "other", description: "[47] Quads" },
          ".",
          { type: "literal", value: ".", description: "\".\"" },
          function(ts, qs) {
              var quads = [];
              if(ts != null && ts.triplesContext != null) {
                  for(var i=0; i<ts.triplesContext.length; i++) {
                      var triple = ts.triplesContext[i]
                      triple.graph = null;
                      quads.push(triple)
                  }
              }

              if(qs && qs.length>0 && qs[0].length > 0) {
                  quads = quads.concat(qs[0][0].quadsContext);

                  if( qs[0][2] != null && qs[0][2].triplesContext != null) {
                      for(var i=0; i<qs[0][2].triplesContext.length; i++) {
                          var triple = qs[0][2].triplesContext[i]
                          triple.graph = null;
                          quads.push(triple)
                      }
                  }
              }

              return {token:'quads',
                  quadsContext: quads}
          },
          { type: "other", description: "[48] QuadsNotTriples" },
          function(g, ts) {
              var quads = [];
              if(ts!=null) {
                  for (var i = 0; i < ts.triplesContext.length; i++) {
                      var triple = ts.triplesContext[i];
                      triple.graph = g;
                      quads.push(triple)
                  }
              }

          return {token:'quadsnottriples',
              quadsContext: quads}
          },
          { type: "other", description: "[49] TriplesTemplate" },
          function(b, bs) {
              var triples = b.triplesContext;
              if(bs != null && typeof(bs) === 'object') {
                 if(bs.length != null) {
                    if(bs[3] != null && bs[3].triplesContext!=null) {
                        triples = triples.concat(bs[3].triplesContext);
                    }
                 }
              }

              return {
                  token:'triplestemplate',
                  triplesContext: triples
              };
          },
          { type: "other", description: "[50] GroupGraphPattern" },
          function(p) {
              return p;
          },
          { type: "other", description: "[51] GroupGraphPatternSub" },
          function(tb, tbs) {
              var subpatterns = [];
              if(tb != null && tb != []) {
                  subpatterns.push(tb);
              }

              for(var i=0; i<tbs.length; i++) {
                  for(var j=0; j< tbs[i].length; j++) {
                      if(tbs[i][j] != null && tbs[i][j].token != null) {
                          subpatterns.push(tbs[i][j]);
                      }
                  }
              }

              var compactedSubpatterns = [];

              var currentBasicGraphPatterns = [];
              var currentFilters = [];

              for(var i=0; i<subpatterns.length; i++) {
                  if(subpatterns[i].token!='triplespattern' && subpatterns[i].token != 'filter') {
                      if(currentBasicGraphPatterns.length != 0 || currentFilters.length != 0) {
                          var triplesContext = [];
                          for(var j=0; j<currentBasicGraphPatterns.length; j++) {
                              triplesContext = triplesContext.concat(currentBasicGraphPatterns[j].triplesContext);
                          }
                          if(triplesContext.length > 0) {
                              compactedSubpatterns.push({token: 'basicgraphpattern',
                                  triplesContext: triplesContext});
                          }
                          currentBasicGraphPatterns = [];
                      }
                      compactedSubpatterns.push(subpatterns[i]);
                  } else {
                      if(subpatterns[i].token === 'triplespattern') {
                          currentBasicGraphPatterns.push(subpatterns[i]);
                      } else {
                          currentFilters.push(subpatterns[i]);
                      }
                  }
              }

              if(currentBasicGraphPatterns.length != 0 || currentFilters.length != 0) {
                  var triplesContext = [];
                  for(var j=0; j<currentBasicGraphPatterns.length; j++) {
                      triplesContext = triplesContext.concat(currentBasicGraphPatterns[j].triplesContext);
                  }
                  if(triplesContext.length > 0) {
                      compactedSubpatterns.push({token: 'basicgraphpattern',
                          triplesContext: triplesContext});
                  }
              }

          //      if(compactedSubpatterns.length == 1) {
          //          compactedSubpatterns[0].filters = currentFilters;
          //          return compactedSubpatterns[0];
          //      } else  {
              return { token: 'groupgraphpattern',
                  patterns: compactedSubpatterns,
                  filters: currentFilters }
          //      }
          },
          { type: "other", description: "[54] TriplesBlock" },
          function(b, bs) {
              var triples = b.triplesContext;
          if(bs != null && typeof(bs) === 'object') {
              if(bs != null && bs.length != null) {
                  if(bs[2] != null && bs[2].triplesContext!=null) {
                      triples = triples.concat(bs[2].triplesContext);
                  }
              }
          }

          return {token:'triplespattern',
              triplesContext: triples}
          },
          { type: "other", description: "[53] GraphPatternNotTriples" },
          { type: "other", description: "[54] OptionalGraphPattern" },
          "OPTIONAL",
          { type: "literal", value: "OPTIONAL", description: "\"OPTIONAL\"" },
          "optional",
          { type: "literal", value: "optional", description: "\"optional\"" },
          function(v) {
              return { token: 'optionalgraphpattern',
                  value: v }
          },
          { type: "other", description: "[55] GraphGraphPattern" },
          function(g, gg) {
              for(var i=0; i<gg.patterns.length; i++) {
                  var quads = []
                  var ts = gg.patterns[i];
                  for(var j=0; j<ts.triplesContext.length; j++) {
                      var triple = ts.triplesContext[j]
                      triple.graph = g;
                  }
              }

              gg.token = 'groupgraphpattern'
              return gg;
          },
          { type: "other", description: "[56] ServiceGraphPattern" },
          "SERVICE",
          { type: "literal", value: "SERVICE", description: "\"SERVICE\"" },
          function(v, ts) {
              return {token: 'servicegraphpattern',
                  status: 'todo',
                  value: [v,ts] }
          },
          { type: "other", description: "[57] MinusGraphPattern" },
          "MINUS",
          { type: "literal", value: "MINUS", description: "\"MINUS\"" },
          "minus",
          { type: "literal", value: "minus", description: "\"minus\"" },
          function(ts) {
              return {token: 'minusgraphpattern',
                  status: 'todo',
                  value: ts}
          },
          { type: "other", description: "[58] GroupOrUnionGraphPattern" },
          "UNION",
          { type: "literal", value: "UNION", description: "\"UNION\"" },
          "union",
          { type: "literal", value: "union", description: "\"union\"" },
          function(a, b) {
              if(b.length === 0) {
                  return a;
              } else {

                  var lastToken = {token: 'graphunionpattern',
                      value: [a]};

                  for(var i=0; i<b.length; i++) {
                      if(i==b.length-1) {
                          lastToken.value.push(b[i][3]);
                      } else {
                          lastToken.value.push(b[i][3]);
                          var newToken = {token: 'graphunionpattern',
                              value: [lastToken]}

                          lastToken = newToken;
                      }
                  }

                  return lastToken;

              }
          },
          { type: "other", description: "[59] Filter" },
          "FILTER",
          { type: "literal", value: "FILTER", description: "\"FILTER\"" },
          "filter",
          { type: "literal", value: "filter", description: "\"filter\"" },
          function(c) {
              return {token: 'filter',
                  value: c}
          },
          { type: "other", description: "[60] Bind" },
          "BIND",
          { type: "literal", value: "BIND", description: "\"BIND\"" },
          "bind",
          { type: "literal", value: "bind", description: "\"bind\"" },
          function(ex, v) {
              return {token: 'bind',
                      expresision: ex,
                      as: v};
          },
          { type: "other", description: "[60] Constraint" },
          { type: "other", description: "[61] InlineData" },
          function(d) {
              return d;
          },
          { type: "other", description: "[62] DataBlock" },
          { type: "other", description: "[63] InlineDataOneVar" },
          function(v, d) {
              var result =  {
                  token: 'inlineData',
                  values: [{
                      'var': v,
                      'value': d
                  }]
              };

              return result;
          },
          { type: "other", description: "[64] InlineDataFull" },
          function(vars, vals) {
              var result = {
                  token: 'inlineData',
                  values: [],
                  todo: true
              };
              return result;
          },
          { type: "other", description: "[65] DataBlockValue" },
          { type: "other", description: "[61] FunctionCall" },
          function(i, args) {
              var fcall = {};
              fcall.token = "expression";
              fcall.expressionType = 'irireforfunction'
              fcall.iriref = i;
              fcall.args = args.value;

              return fcall;
          },
          { type: "other", description: "[62] ArgList" },
          function() {
              var args = {};
              args.token = 'args';
              args.value = [];
              return args;
          },
          ",",
          { type: "literal", value: ",", description: "\",\"" },
          function(d, e, es) {
              var cleanEx = [];

              for(var i=0; i<es.length; i++) {
                  cleanEx.push(es[i][1]);
              }
              var args = {};
              args.token = 'args';
              args.value = [e].concat(cleanEx);

              if(d!=null && d.toUpperCase()==="DISTINCT") {
                  args.distinct = true;
              } else {
                  args.distinct = false;
              }

              return args;
          },
          { type: "other", description: "[63] ExpressionList" },
          function(e, es) {
              var cleanEx = [];

              for(var i=0; i<es.length; i++) {
                  cleanEx.push(es[i][1]);
              }
              var args = {};
              args.token = 'args';
              args.value = [e].concat(cleanEx);

              return args;
          },
          { type: "other", description: "[64] ConstructTemplate" },
          function(ts) {
              return ts;
          },
          { type: "other", description: "[65] ConstructTriples" },
          function(b, bs) {
              var triples = b.triplesContext;
          var toTest = null;
          if(bs != null && typeof(bs) === 'object') {
              if(bs.length != null) {
                  if(bs[3] != null && bs[3].triplesContext!=null) {
                      triples = triples.concat(bs[3].triplesContext);
                  }
              }
          }

          return {token:'triplestemplate',
              triplesContext: triples}
          },
          { type: "other", description: "[66] TriplesSameSubject" },
          function(s, pairs) {
              var triplesContext = pairs.triplesContext;
              var subject = s;
              if(pairs.pairs) {
                  for(var i=0; i< pairs.pairs.length; i++) {
                      var pair = pairs.pairs[i];
                      var triple = null;
                      if(pair[1].length != null)
                          pair[1] = pair[1][0]
                      if(subject.token && subject.token==='triplesnodecollection') {
                          triple = {subject: subject.chainSubject[0], predicate: pair[0], object: pair[1]}
                          triplesContext.push(triple);
                          triplesContext = triplesContext.concat(subject.triplesContext);
                      } else {
                          triple = {subject: subject, predicate: pair[0], object: pair[1]}
                          triplesContext.push(triple);
                      }
                  }
              }

              var token = {};
              token.token = "triplessamesubject";
              token.triplesContext = triplesContext;
              token.chainSubject = subject;

              return token;
          },
          function(tn, pairs) {
              var triplesContext = tn.triplesContext;
              var subject = tn.chainSubject;

              if(pairs.pairs) {
                  for(var i=0; i< pairs.pairs.length; i++) {
                      var pair = pairs.pairs[i];
                      if(pair[1].length != null)
                          pair[1] = pair[1][0]

                      if(tn.token === "triplesnodecollection") {
                          for(var j=0; j<subject.length; j++) {
                              var subj = subject[j];
                              if(subj.triplesContext != null) {
                                  var triple = {subject: subj.chainSubject, predicate: pair[0], object: pair[1]}
                                  triplesContext.concat(subj.triplesContext);
                              } else {
                                  var triple = {subject: subject[j], predicate: pair[0], object: pair[1]}
                                  triplesContext.push(triple);
                              }
                          }
                      } else {
                          var triple = {subject: subject, predicate: pair[0], object: pair[1]}
                          triplesContext.push(triple);
                      }
                  }
              }

              var token = {};
              token.token = "triplessamesubject";
              token.triplesContext = triplesContext;
              token.chainSubject = subject;

              return token;
          },
          { type: "other", description: "[83] PropertyListPathNotEmpty" },
          function(v, ol, rest) {
              var token = {};
              token.token = 'propertylist';
              var triplesContext = [];
              var pairs = [];
              var test = [];

              for( var i=0; i<ol.length; i++) {

                  if(ol[i].triplesContext != null) {
                      triplesContext = triplesContext.concat(ol[i].triplesContext);
                      if(ol[i].token==='triplesnodecollection' && ol[i].chainSubject.length != null) {
                          pairs.push([v, ol[i].chainSubject[0]]);
                      } else {
                          pairs.push([v, ol[i].chainSubject]);
                      }

                  } else {
                      pairs.push([v, ol[i]])
                  }

              }


              for(var i=0; i<rest.length; i++) {
                  var tok = rest[i][3];
                  var newVerb  = tok[0];
                  var newObjsList = tok[2] || [];

                  for(var j=0; j<newObjsList.length; j++) {
                      if(newObjsList[j].triplesContext != null) {
                          triplesContext = triplesContext.concat(newObjsList[j].triplesContext);
                          pairs.push([newVerb, newObjsList[j].chainSubject]);
                      } else {
                          pairs.push([newVerb, newObjsList[j]])
                      }
                  }
              }

              token.pairs = pairs;
              token.triplesContext = triplesContext;

              return token;
          },
          { type: "other", description: "[67] PropertyListNotEmpty" },
          function(v, ol, rest) {
              var token = {};
              token.token = 'propertylist';
              var triplesContext = [];
              var pairs = [];
              var test = [];

              for( var i=0; i<ol.length; i++) {

                  if(ol[i].triplesContext != null) {
                      triplesContext = triplesContext.concat(ol[i].triplesContext);
                      if(ol[i].token==='triplesnodecollection' && ol[i].chainSubject.length != null) {
                          pairs.push([v, ol[i].chainSubject[0]]);
                      } else {
                          pairs.push([v, ol[i].chainSubject]);
                      }

                  } else {
                      pairs.push([v, ol[i]])
                  }

              }


              for(var i=0; i<rest.length; i++) {
                  var tok = rest[i][3];
                  var newVerb  = tok[0];
                  var newObjsList = tok[2] || [];

                  for(var j=0; j<newObjsList.length; j++) {
                      if(newObjsList[j].triplesContext != null) {
                          triplesContext = triplesContext.concat(newObjsList[j].triplesContext);
                          pairs.push([newVerb, newObjsList[j].chainSubject]);
                      } else {
                          pairs.push([newVerb, newObjsList[j]])
                      }
                  }
              }

              token.pairs = pairs;
              token.triplesContext = triplesContext;

              return token;

          },
          { type: "other", description: "[68] PropertyList" },
          { type: "other", description: "[86] ObjectListPath" },
          function(obj, objs) {
              var toReturn = [];

              toReturn.push(obj);

              for(var i=0; i<objs.length; i++) {
                  for(var j=0; j<objs[i].length; j++) {
                      if(typeof(objs[i][j])=="object" && objs[i][j].token != null) {
                          toReturn.push(objs[i][j]);
                      }
                  }
              }

              return toReturn;
          },
          { type: "other", description: "[69] ObjectList" },
          function(obj, objs) {

              var toReturn = [];

              toReturn.push(obj);

              for(var i=0; i<objs.length; i++) {
                  for(var j=0; j<objs[i].length; j++) {
                      if(typeof(objs[i][j])=="object" && objs[i][j].token != null) {
                          toReturn.push(objs[i][j]);
                      }
                  }
              }

              return toReturn;
          },
          { type: "other", description: "[87] ObjectPath" },
          { type: "other", description: "[70] Object" },
          { type: "other", description: "[71] Verb" },
          "a",
          { type: "literal", value: "a", description: "\"a\"" },
          function() {
              return{token: 'uri', prefix:null, suffix:null, value:"http://www.w3.org/1999/02/22-rdf-syntax-ns#type"}
          },
          { type: "other", description: "[72] TriplesSameSubjectPath" },
          function(s, pairs) {
              var triplesContext = pairs.triplesContext;
              var subject = s;
              if(pairs.pairs) {
                  for(var i=0; i< pairs.pairs.length; i++) {
                      var pair = pairs.pairs[i];
                      var triple = null;
                      if(pair[1].length != null)
                          pair[1] = pair[1][0]
                      if(subject.token && subject.token==='triplesnodecollection') {
                          triple = {subject: subject.chainSubject[0], predicate: pair[0], object: pair[1]};
                          if(triple.predicate.token === 'path' && triple.predicate.kind === 'element') {
                              triple.predicate = triple.predicate.value;
                          }
                          triplesContext.push(triple);
                          triplesContext = triplesContext.concat(subject.triplesContext);
                      } else {
                          triple = {subject: subject, predicate: pair[0], object: pair[1]}
                          if(triple.predicate.token === 'path' && triple.predicate.kind === 'element') {
                              triple.predicate = triple.predicate.value;
                          }
                          triplesContext.push(triple);
                      }
                  }
              }

              var token = {};
              token.token = "triplessamesubject";
              token.triplesContext = triplesContext;
              token.chainSubject = subject;

              return token;
          },
          function(tn, pairs) {
              var triplesContext = tn.triplesContext;
              var subject = tn.chainSubject;

              if(pairs != null && pairs.pairs != null) {
                  for(var i=0; i< pairs.pairs.length; i++) {
                      var pair = pairs.pairs[i];
                      if(pair[1].length != null)
                          pair[1] = pair[1][0]

                      if(tn.token === "triplesnodecollection") {
                          for(var j=0; j<subject.length; j++) {
                              var subj = subject[j];
                              if(subj.triplesContext != null) {
                                  var triple = {subject: subj.chainSubject, predicate: pair[0], object: pair[1]}
                                  triplesContext.concat(subj.triplesContext);
                              } else {
                                  var triple = {subject: subject[j], predicate: pair[0], object: pair[1]}
                                  triplesContext.push(triple);
                              }
                          }
                      } else {
                          var triple = {subject: subject, predicate: pair[0], object: pair[1]}
                          triplesContext.push(triple);
                      }
                  }
              }

              var token = {};
              token.token = "triplessamesubject";
              token.triplesContext = triplesContext;
              token.chainSubject = subject;

              return token;

          },
          { type: "other", description: "[73] PropertyListNotEmptyPath" },
          function(v, ol, rest) {
              token = {}
              token.token = 'propertylist';
              var triplesContext = [];
              var pairs = [];
              var test = [];

              for( var i=0; i<ol.length; i++) {

                  if(ol[i].triplesContext != null) {
                      triplesContext = triplesContext.concat(ol[i].triplesContext);
                      if(ol[i].token==='triplesnodecollection' && ol[i].chainSubject.length != null) {
                          pairs.push([v, ol[i].chainSubject[0]]);
                      } else {
                          pairs.push([v, ol[i].chainSubject]);
                      }

                  } else {
                      pairs.push([v, ol[i]])
                  }

              }


              for(var i=0; i<rest.length; i++) {
                  var tok = rest[i][3];
                  var newVerb  = tok[0];
                  var newObjsList = tok[1] || [];

                  for(var j=0; j<newObjsList.length; j++) {
                      if(newObjsList[j].triplesContext != null) {
                          triplesContext = triplesContext.concat(newObjsList[j].triplesContext);
                          pairs.push([newVerb, newObjsList[j].chainSubject]);
                      } else {
                          pairs.push([newVerb, newObjsList[j]])
                      }
                  }
              }

              token.pairs = pairs;
              token.triplesContext = triplesContext;

              return token;
          },
          { type: "other", description: "[74] PropertyListPath" },
          { type: "other", description: "[75]" },
          function(p) {
              var path = {};
              path.token = 'path';
              path.kind = 'element';
              path.value = p;

              return p;
          },
          { type: "other", description: "[76] VerbSimple" },
          { type: "other", description: "[77] Path" },
          { type: "other", description: "[78] PathAlternative" },
          "|",
          { type: "literal", value: "|", description: "\"|\"" },
          function(first, rest) {
              if(rest == null || rest.length === 0) {
                  return first;
              } else {
                  var acum = [];
                  for(var i=0; i<rest.length; i++)
                      acum.push(rest[1]);

                  var path = {};
                  path.token = 'path';
                  path.kind = 'alternative';
                  path.value = acum;

                  return path;
              }
          },
          { type: "other", description: "[79] PathSequence" },
          "/",
          { type: "literal", value: "/", description: "\"/\"" },
          function(first, rest) {
              if(rest == null || rest.length === 0) {
                  return first;
              } else {
                  var acum = [first];

                  for(var i=0; i<rest.length; i++)
                      acum.push(rest[i][1]);

                  var path = {};
                  path.token = 'path';
                  path.kind = 'sequence';

                  path.value = acum;

                  return path;
              }
          },
          { type: "other", description: "[88] PathElt" },
          function(p, mod) {
              if(p.token && p.token != 'path' && mod == '') {
              return p;
          } else if(p.token && p.token != path && mod != '') {
              var path = {};
              path.token = 'path';
              path.kind = 'element';
              path.value = p;
              path.modifier = mod;
              return path;
          } else {
              p.modifier = mod;
              return p;
          }
          },
          { type: "other", description: "[81] PathEltOrInverse" },
          "^",
          { type: "literal", value: "^", description: "\"^\"" },
          function(elt) {
              var path = {};
              path.token = 'path';
              path.kind = 'inversePath';
              path.value = elt;

              return path;
          },
          { type: "other", description: "[82] PathMod" },
          "?",
          { type: "literal", value: "?", description: "\"?\"" },
          "+",
          { type: "literal", value: "+", description: "\"+\"" },
          { type: "other", description: "[83] PathPrimary" },
          "!",
          { type: "literal", value: "!", description: "\"!\"" },
          { type: "other", description: "[85] PathOneInPropertySet" },
          { type: "other", description: "[86] Integer" },
          { type: "other", description: "[100] TriplesNodePath" },
          function(c) {
              var triplesContext = [];
              var chainSubject = [];

              var triple = null;

              // catch NIL
              /*
               if(c.length == 1 && c[0].token && c[0].token === 'nil') {
               GlobalBlankNodeCounter++;
               return  {token: "triplesnodecollection",
               triplesContext:[{subject: {token:'blank', value:("_:"+GlobalBlankNodeCounter)},
               predicate:{token:'uri', prefix:null, suffix:null, value:'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'},
               object:  {token:'blank', value:("_:"+(GlobalBlankNodeCounter+1))}}],
               chainSubject:{token:'blank', value:("_:"+GlobalBlankNodeCounter)}};

               }
               */

              // other cases
              for(var i=0; i<c.length; i++) {
                  GlobalBlankNodeCounter++;
                  //_:b0  rdf:first  1 ;
                  //rdf:rest   _:b1 .
                  var nextObject = null;
                  if(c[i].chainSubject == null && c[i].triplesContext == null) {
                      nextObject = c[i];
                  } else {
                      nextObject = c[i].chainSubject;
                      triplesContext = triplesContext.concat(c[i].triplesContext);
                  }
                  triple = {
                      subject: {token:'blank', value:("_:"+GlobalBlankNodeCounter)},
                      predicate:{token:'uri', prefix:null, suffix:null, value:'http://www.w3.org/1999/02/22-rdf-syntax-ns#first'},
                      object:nextObject
                  };

                  if(i==0) {
                      chainSubject.push(triple.subject);
                  }

                  triplesContext.push(triple);

                  if(i===(c.length-1)) {
                      triple = {subject: {token:'blank', value:("_:"+GlobalBlankNodeCounter)},
                          predicate:{token:'uri', prefix:null, suffix:null, value:'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'},
                          object:   {token:'uri', prefix:null, suffix:null, value:'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'}};
                  } else {
                      triple = {subject: {token:'blank', value:("_:"+GlobalBlankNodeCounter)},
                          predicate:{token:'uri', prefix:null, suffix:null, value:'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'},
                          object:  {token:'blank', value:("_:"+(GlobalBlankNodeCounter+1))} };
                  }

                  triplesContext.push(triple);
              }

              return {token:"triplesnodecollection", triplesContext:triplesContext, chainSubject:chainSubject};
          },
          { type: "other", description: "[87] TriplesNode" },
          function(c) {
              var triplesContext = [];
              var chainSubject = [];

              var triple = null;

              // catch NIL
              /*
               if(c.length == 1 && c[0].token && c[0].token === 'nil') {
               GlobalBlankNodeCounter++;
               return  {token: "triplesnodecollection",
               triplesContext:[{subject: {token:'blank', value:("_:"+GlobalBlankNodeCounter)},
               predicate:{token:'uri', prefix:null, suffix:null, value:'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'},
               object:  {token:'blank', value:("_:"+(GlobalBlankNodeCounter+1))}}],
               chainSubject:{token:'blank', value:("_:"+GlobalBlankNodeCounter)}};

               }
               */

              // other cases
              for(var i=0; i<c.length; i++) {
                  GlobalBlankNodeCounter++;
                  //_:b0  rdf:first  1 ;
                  //rdf:rest   _:b1 .
                  var nextObject = null;
                  if(c[i].chainSubject == null && c[i].triplesContext == null) {
                      nextObject = c[i];
                  } else {
                      nextObject = c[i].chainSubject;
                      triplesContext = triplesContext.concat(nextObject.triplesContext);
                  }
                  triple = {subject: {token:'blank', value:("_:"+GlobalBlankNodeCounter)},
                      predicate:{token:'uri', prefix:null, suffix:null, value:'http://www.w3.org/1999/02/22-rdf-syntax-ns#first'},
                      object:nextObject };

                  if(i==0) {
                      chainSubject.push(triple.subject);
                  }

                  triplesContext.push(triple);

                  if(i===(c.length-1)) {
                      triple = {subject: {token:'blank', value:("_:"+GlobalBlankNodeCounter)},
                          predicate:{token:'uri', prefix:null, suffix:null, value:'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'},
                          object:   {token:'uri', prefix:null, suffix:null, value:'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'}};
                  } else {
                      triple = {subject: {token:'blank', value:("_:"+GlobalBlankNodeCounter)},
                          predicate:{token:'uri', prefix:null, suffix:null, value:'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'},
                          object:  {token:'blank', value:("_:"+(GlobalBlankNodeCounter+1))} };
                  }

                  triplesContext.push(triple);
              }

              return {token:"triplesnodecollection", triplesContext:triplesContext, chainSubject:chainSubject};
          },
          { type: "other", description: "[101] BlankNodePropertyListPath" },
          "[",
          { type: "literal", value: "[", description: "\"[\"" },
          "]",
          { type: "literal", value: "]", description: "\"]\"" },
          function(pl) {
              GlobalBlankNodeCounter++;
              var subject = {token:'blank', value:'_:'+GlobalBlankNodeCounter};
               var newTriples =  [];

              for(var i=0; i< pl.pairs.length; i++) {
                  var pair = pl.pairs[i];
                  var triple = {}
                  triple.subject = subject;
                  triple.predicate = pair[0];
                  if(pair[1].length != null)
                      pair[1] = pair[1][0]
                  triple.object = pair[1];
                  newTriples.push(triple);
              }

              return {
                  token: 'triplesnode',
                  kind: 'blanknodepropertylist',
                  triplesContext: pl.triplesContext.concat(newTriples),
                  chainSubject: subject
              };
          },
          { type: "other", description: "[88] BlankNodePropertyList" },
          function(pl) {

              GlobalBlankNodeCounter++;
              var subject = {token:'blank', value:'_:'+GlobalBlankNodeCounter};
              var newTriples =  [];

              for(var i=0; i< pl.pairs.length; i++) {
                  var pair = pl.pairs[i];
                  var triple = {}
                  triple.subject = subject;
                  triple.predicate = pair[0];
                  if(pair[1].length != null)
                      pair[1] = pair[1][0]
                  triple.object = pair[1];
                  newTriples.push(triple);
              }

              return {
                  token: 'triplesnode',
                  kind: 'blanknodepropertylist',
                  triplesContext: pl.triplesContext.concat(newTriples),
                  chainSubject: subject
              };
          },
          { type: "other", description: "[103] CollectionPath" },
          function(gn) {
              return gn;
          },
          { type: "other", description: "[89] Collection" },
          { type: "other", description: "[105] GraphNodePath" },
          function(gn) {
              return gn[1];
          },
          { type: "other", description: "[90] GraphNode" },
          { type: "other", description: "[91] VarOrTerm" },
          { type: "other", description: "[92] VarOrIRIref" },
          { type: "other", description: "[93] Var" },
          function(v) {
              var term = {};
              term.token = 'var';
              term.value = v;
              return term;
          },
          { type: "other", description: "[94] GraphTerm" },
          { type: "other", description: "[95] Expression" },
          { type: "other", description: "[96] ConditionalOrExpression" },
          "||",
          { type: "literal", value: "||", description: "\"||\"" },
          function(v, vs) {
              if(vs.length === 0) {
                  return v;
              }

              var exp = {};
              exp.token = "expression";
              exp.expressionType = "conditionalor";
              var ops = [v];

              for(var i=0; i<vs.length; i++) {
                  ops.push(vs[i][3]);
              }

              exp.operands = ops;

              return exp;
          },
          { type: "other", description: "[97] ConditionalAndExpression" },
          "&&",
          { type: "literal", value: "&&", description: "\"&&\"" },
          function(v, vs) {
              if(vs.length === 0) {
                  return v;
              }
              var exp = {};
              exp.token = "expression";
              exp.expressionType = "conditionaland";
              var ops = [v];

              for(var i=0; i<vs.length; i++) {
                  ops.push(vs[i][3]);
              }

              exp.operands = ops;

              return exp;
          },
          { type: "other", description: "[98] ValueLogical" },
          { type: "other", description: "[99] RelationalExpression" },
          "=",
          { type: "literal", value: "=", description: "\"=\"" },
          "!=",
          { type: "literal", value: "!=", description: "\"!=\"" },
          "<",
          { type: "literal", value: "<", description: "\"<\"" },
          ">",
          { type: "literal", value: ">", description: "\">\"" },
          "<=",
          { type: "literal", value: "<=", description: "\"<=\"" },
          ">=",
          { type: "literal", value: ">=", description: "\">=\"" },
          "I",
          { type: "literal", value: "I", description: "\"I\"" },
          "i",
          { type: "literal", value: "i", description: "\"i\"" },
          "N",
          { type: "literal", value: "N", description: "\"N\"" },
          "n",
          { type: "literal", value: "n", description: "\"n\"" },
          "O",
          { type: "literal", value: "O", description: "\"O\"" },
          "o",
          { type: "literal", value: "o", description: "\"o\"" },
          "T",
          { type: "literal", value: "T", description: "\"T\"" },
          "t",
          { type: "literal", value: "t", description: "\"t\"" },
          function(op1, op2) {
              if(op2.length === 0) {
                  return op1;
              } else if(op2[0][1] === 'i' || op2[0][1] === 'I' || op2[0][1] === 'n' || op2[0][1] === 'N'){
                  var exp = {};

                  if(op2[0][1] === 'i' || op2[0][1] === 'I') {
                      var operator = "=";
                      exp.expressionType = "conditionalor"
                  } else {
                      var operator = "!=";
                      exp.expressionType = "conditionaland"
                  }
                  var lop = op1;
                  var rops = []
                  for(var opi=0; opi<op2[0].length; opi++) {
                      if(op2[0][opi].token ==="args") {
                          rops = op2[0][opi].value;
                          break;
                      }
                  }

                  exp.token = "expression";
                  exp.operands = [];
                  for(var i=0; i<rops.length; i++) {
                      var nextOperand = {};
                      nextOperand.token = "expression";
                      nextOperand.expressionType = "relationalexpression";
                      nextOperand.operator = operator;
                      nextOperand.op1 = lop;
                      nextOperand.op2 = rops[i];

                      exp.operands.push(nextOperand);
                  }
                  return exp;
              } else {
                  var exp = {};
                  exp.expressionType = "relationalexpression"
                  exp.operator = op2[0][1];
                  exp.op1 = op1;
                  exp.op2 = op2[0][3];
                  exp.token = "expression";

                  return exp;
              }
          },
          { type: "other", description: "[100] NumericExpression" },
          { type: "other", description: "[101] AdditiveExpression" },
          "-",
          { type: "literal", value: "-", description: "\"-\"" },
          function(op1, ops) {
              if(ops.length === 0) {
                  return op1;
              }

              var ex = {};
              ex.token = 'expression';
              ex.expressionType = 'additiveexpression';
              ex.summand = op1;
              ex.summands = [];

              for(var i=0; i<ops.length; i++) {
                  var summand = ops[i];
                  var sum = {};
                  if(summand.length == 4 && typeof(summand[1]) === "string") {
                      sum.operator = summand[1];
                      sum.expression = summand[3];
                  } else {
                      var subexp = {}
                      var firstFactor = sum[0];
                      var operator = sum[1][1];
                      var secondFactor = sum[1][3];
                      var operator = null;
                      if(firstFactor.value < 0) {
                          sum.operator = '-';
                          firstFactor.value = - firstFactor.value;
                      } else {
                          sum.operator = '+';
                      }
                      subexp.token = 'expression';
                      subexp.expressionType = 'multiplicativeexpression';
                      subexp.operator = firstFactor;
                      subexp.factors = [{operator: operator, expression: secondFactor}];

                      sum.expression = subexp;
                  }
                  ex.summands.push(sum);
              }

              return ex;
          },
          { type: "other", description: "[102] MultiplicativeExpression" },
          function(exp, exps) {
              if(exps.length === 0) {
                  return exp;
              }

              var ex = {};
              ex.token = 'expression';
              ex.expressionType = 'multiplicativeexpression';
              ex.factor = exp;
              ex.factors = [];
              for(var i=0; i<exps.length; i++) {
                  var factor = exps[i];
                  var fact = {};
                  fact.operator = factor[1];
                  fact.expression = factor[3];
                  ex.factors.push(fact);
              }

              return ex;
          },
          { type: "other", description: "[103] UnaryExpression" },
          function(e) {
              var ex = {};
              ex.token = 'expression';
              ex.expressionType = 'unaryexpression';
              ex.unaryexpression = "!";
              ex.expression = e;

              return ex;
          },
          function(v) {
              var ex = {};
              ex.token = 'expression';
              ex.expressionType = 'unaryexpression';
              ex.unaryexpression = "+";
              ex.expression = v;

              return ex;
          },
          function(v) {
              var ex = {};
              ex.token = 'expression';
              ex.expressionType = 'unaryexpression';
              ex.unaryexpression = "-";
              ex.expression = v;

              return ex;
          },
          { type: "other", description: "[104] PrimaryExpression" },
          function(v) {
              var ex = {};
              ex.token = 'expression';
              ex.expressionType = 'atomic';
              ex.primaryexpression = 'rdfliteral';
              ex.value = v;

              return ex;
          },
          function(v) {
              var ex = {};
              ex.token = 'expression';
              ex.expressionType = 'atomic';
              ex.primaryexpression = 'numericliteral';
              ex.value = v;

              return ex;
          },
          function(v) {
              var ex = {};
              ex.token = 'expression';
              ex.expressionType = 'atomic';
              ex.primaryexpression = 'booleanliteral';
              ex.value = v;

              return ex;
          },
          function(v) {
              var ex = {};
              ex.token = 'expression';
              ex.expressionType = 'atomic';
              ex.primaryexpression = 'var';
              ex.value = v;

              return ex;
          },
          { type: "other", description: "[105] BrackettedExpression" },
          function(e) {
              return e;
          },
          { type: "other", description: "[106] BuiltInCall" },
          "STR",
          { type: "literal", value: "STR", description: "\"STR\"" },
          "str",
          { type: "literal", value: "str", description: "\"str\"" },
          function(e) {
              var ex = {};
              ex.token = 'expression'
              ex.expressionType = 'builtincall'
              ex.builtincall = 'str'
              ex.args = [e]

              return ex;
          },
          "LANG",
          { type: "literal", value: "LANG", description: "\"LANG\"" },
          "lang",
          { type: "literal", value: "lang", description: "\"lang\"" },
          function(e) {
              var ex = {};
              ex.token = 'expression'
              ex.expressionType = 'builtincall'
              ex.builtincall = 'lang'
              ex.args = [e]

              return ex;
          },
          "LANGMATCHES",
          { type: "literal", value: "LANGMATCHES", description: "\"LANGMATCHES\"" },
          "langmatches",
          { type: "literal", value: "langmatches", description: "\"langmatches\"" },
          function(e1, e2) {
              var ex = {};
              ex.token = 'expression'
              ex.expressionType = 'builtincall'
              ex.builtincall = 'langmatches'
              ex.args = [e1,e2]

              return ex;
          },
          "DATATYPE",
          { type: "literal", value: "DATATYPE", description: "\"DATATYPE\"" },
          "datatype",
          { type: "literal", value: "datatype", description: "\"datatype\"" },
          function(e) {
              var ex = {};
              ex.token = 'expression'
              ex.expressionType = 'builtincall'
              ex.builtincall = 'datatype'
              ex.args = [e]

              return ex;
          },
          "BOUND",
          { type: "literal", value: "BOUND", description: "\"BOUND\"" },
          "bound",
          { type: "literal", value: "bound", description: "\"bound\"" },
          function(v) {
              var ex = {};
              ex.token = 'expression'
              ex.expressionType = 'builtincall'
              ex.builtincall = 'bound'
              ex.args = [v]

              return ex;
          },
          "IRI",
          { type: "literal", value: "IRI", description: "\"IRI\"" },
          "iri",
          { type: "literal", value: "iri", description: "\"iri\"" },
          function(e) {
              var ex = {};
              ex.token = 'expression';
              ex.expressionType = 'builtincall';
              ex.builtincall = 'iri'
              ex.args = [e];

              return ex;
          },
          "URI",
          { type: "literal", value: "URI", description: "\"URI\"" },
          "uri",
          { type: "literal", value: "uri", description: "\"uri\"" },
          function(e) {
              var ex = {};
              ex.token = 'expression';
              ex.expressionType = 'builtincall';
              ex.builtincall = 'uri'
              ex.args = [e];

              return ex;
          },
          "BNODE",
          { type: "literal", value: "BNODE", description: "\"BNODE\"" },
          "bnode",
          { type: "literal", value: "bnode", description: "\"bnode\"" },
          function(arg) {
              var ex = {};
              ex.token = 'expression';
              ex.expressionType = 'builtincall';
              ex.builtincall = 'bnode';
              if(arg.length === 5) {
                  ex.args = [arg[2]];
              } else {
                  ex.args = null;
              }

              return ex;
          },
          "COALESCE",
          { type: "literal", value: "COALESCE", description: "\"COALESCE\"" },
          "coalesce",
          { type: "literal", value: "coalesce", description: "\"coalesce\"" },
          function(args) {
              var ex = {};
              ex.token = 'expression';
              ex.expressionType = 'builtincall';
              ex.builtincall = 'coalesce';
              ex.args = args;

              return ex;
          },
          "IF",
          { type: "literal", value: "IF", description: "\"IF\"" },
          "if",
          { type: "literal", value: "if", description: "\"if\"" },
          function(test, trueCond, falseCond) {
              var ex = {};
              ex.token = 'expression';
              ex.expressionType = 'builtincall';
              ex.builtincall = 'if';
              ex.args = [test,trueCond,falseCond];

              return ex;
          },
          "ISLITERAL",
          { type: "literal", value: "ISLITERAL", description: "\"ISLITERAL\"" },
          "isliteral",
          { type: "literal", value: "isliteral", description: "\"isliteral\"" },
          function(arg) {
              var ex = {};
              ex.token = 'expression';
              ex.expressionType = 'builtincall';
              ex.builtincall = 'isliteral';
              ex.args = [arg];

              return ex;
          },
          "ISBLANK",
          { type: "literal", value: "ISBLANK", description: "\"ISBLANK\"" },
          "isblank",
          { type: "literal", value: "isblank", description: "\"isblank\"" },
          function(arg) {
              var ex = {};
              ex.token = 'expression';
              ex.expressionType = 'builtincall';
              ex.builtincall = 'isblank';
              ex.args = [arg];

              return ex;
          },
          "SAMETERM",
          { type: "literal", value: "SAMETERM", description: "\"SAMETERM\"" },
          "sameterm",
          { type: "literal", value: "sameterm", description: "\"sameterm\"" },
          function(e1, e2) {
              var ex = {};
              ex.token = 'expression';
              ex.expressionType = 'builtincall';
              ex.builtincall = 'sameterm';
              ex.args = [e1, e2];
              return ex;
          },
          "ISURI",
          { type: "literal", value: "ISURI", description: "\"ISURI\"" },
          "isuri",
          { type: "literal", value: "isuri", description: "\"isuri\"" },
          "ISIRI",
          { type: "literal", value: "ISIRI", description: "\"ISIRI\"" },
          "isiri",
          { type: "literal", value: "isiri", description: "\"isiri\"" },
          function(arg) {
              var ex = {};
              ex.token = 'expression';
              ex.expressionType = 'builtincall';
              ex.builtincall = 'isuri';
              ex.args = [arg];

              return ex;
          },
          "custom:",
          { type: "literal", value: "custom:", description: "\"custom:\"" },
          "CUSTOM:",
          { type: "literal", value: "CUSTOM:", description: "\"CUSTOM:\"" },
          /^[a-zA-Z0-9_]/,
          { type: "class", value: "[a-zA-Z0-9_]", description: "[a-zA-Z0-9_]" },
          function(fnname, alter, finalarg) {
              var ex = {};
              ex.token = 'expression';
              ex.expressionType = 'custom';
              ex.name = fnname.join('');
              var acum = [];
              for(var i=0; i<alter.length; i++)
                  acum.push(alter[i][1]);
              acum.push(finalarg);
              ex.args = acum;

              return ex;
          },
          { type: "other", description: "[107] RegexExpression" },
          "REGEX",
          { type: "literal", value: "REGEX", description: "\"REGEX\"" },
          "regex",
          { type: "literal", value: "regex", description: "\"regex\"" },
          function(e1, e2, eo) {
              var regex = {};
          regex.token = 'expression';
          regex.expressionType = 'regex';
          regex.text = e1;
          regex.pattern = e2;
          regex.flags = eo[2];

          return regex;
          },
          { type: "other", description: "[108] ExistsFunc" },
          "EXISTS",
          { type: "literal", value: "EXISTS", description: "\"EXISTS\"" },
          "exists",
          { type: "literal", value: "exists", description: "\"exists\"" },
          function(ggp) {
              var ex = {};
              ex.token = 'expression';
              ex.expressionType = 'builtincall';
              ex.builtincall = 'exists';
              ex.args = [ggp];

              return ex;
          },
          { type: "other", description: "[109] NotExistsFunc" },
          "NOT",
          { type: "literal", value: "NOT", description: "\"NOT\"" },
          "not",
          { type: "literal", value: "not", description: "\"not\"" },
          function(ggp) {
              var ex = {};
              ex.token = 'expression';
              ex.expressionType = 'builtincall';
              ex.builtincall = 'notexists';
              ex.args = [ggp];

              return ex;
          },
          { type: "other", description: "[110] Aggregate" },
          "COUNT",
          { type: "literal", value: "COUNT", description: "\"COUNT\"" },
          "count",
          { type: "literal", value: "count", description: "\"count\"" },
          function(d, e) {
              var exp = {};
          exp.token = 'expression';
          exp.expressionType = 'aggregate';
          exp.aggregateType = 'count';
          exp.distinct = (d != "" ? 'DISTINCT' : d);
          exp.expression = e;

          return exp;

          },
          "GROUP_CONCAT",
          { type: "literal", value: "GROUP_CONCAT", description: "\"GROUP_CONCAT\"" },
          "group_concat",
          { type: "literal", value: "group_concat", description: "\"group_concat\"" },
          "SEPARATOR",
          { type: "literal", value: "SEPARATOR", description: "\"SEPARATOR\"" },
          function(d, e, s) {
              var exp = {};
              exp.token = 'expression';
              exp.expressionType = 'aggregate';
              exp.aggregateType = 'group_concat';
              exp.distinct = (d != "" ? 'DISTINCT' : d);
              exp.expression = e;
              exp.separator = s;

              return exp;

          },
          "SUM",
          { type: "literal", value: "SUM", description: "\"SUM\"" },
          "sum",
          { type: "literal", value: "sum", description: "\"sum\"" },
          function(d, e) {
              var exp = {};
          exp.token = 'expression';
          exp.expressionType = 'aggregate';
          exp.aggregateType = 'sum';
          exp.distinct = (d != "" ? 'DISTINCT' : d);
          exp.expression = e;

          return exp;

          },
          "MIN",
          { type: "literal", value: "MIN", description: "\"MIN\"" },
          "min",
          { type: "literal", value: "min", description: "\"min\"" },
          function(d, e) {
              var exp = {};
          exp.token = 'expression';
          exp.expressionType = 'aggregate';
          exp.aggregateType = 'min';
          exp.distinct = (d != "" ? 'DISTINCT' : d);
          exp.expression = e;

          return exp;

          },
          "MAX",
          { type: "literal", value: "MAX", description: "\"MAX\"" },
          "max",
          { type: "literal", value: "max", description: "\"max\"" },
          function(d, e) {
              var exp = {};
          exp.token = 'expression'
          exp.expressionType = 'aggregate'
          exp.aggregateType = 'max'
          exp.distinct = (d != "" ? 'DISTINCT' : d);
          exp.expression = e

          return exp

          },
          "AVG",
          { type: "literal", value: "AVG", description: "\"AVG\"" },
          "avg",
          { type: "literal", value: "avg", description: "\"avg\"" },
          function(d, e) {
              var exp = {};
          exp.token = 'expression'
          exp.expressionType = 'aggregate'
          exp.aggregateType = 'avg'
          exp.distinct = (d != "" ? 'DISTINCT' : d);
          exp.expression = e

          return exp

          },
          { type: "other", description: "[117] IRIrefOrFunction" },
          function(i, args) {
              var fcall = {};
          fcall.token = "expression";
          fcall.expressionType = 'irireforfunction';
          fcall.iriref = i;
          fcall.args = args.value;

          return fcall;
          },
          { type: "other", description: "[112] RDFLiteral" },
          "^^",
          { type: "literal", value: "^^", description: "\"^^\"" },
          function(s, e) {
              if(typeof(e) === "string" && e.length > 0) {
              return {token:'literal', value:s.value, lang:e.slice(1), type:null}
          } else {
              if(e != null && typeof(e) === "object") {
                  e.shift(); // remove the '^^' char
                  return {token:'literal', value:s.value, lang:null, type:e[0] }
              } else {
                  return { token:'literal', value:s.value, lang:null, type:null }
              }
          }
          },
          { type: "other", description: "[113] NumericLiteral" },
          { type: "other", description: "[114] NumericLiteralUnsigned" },
          { type: "other", description: "[115] NumericLiteralPositive" },
          { type: "other", description: "[116] NumericLiteralNegative" },
          { type: "other", description: "[117] BooleanLiteral" },
          "TRUE",
          { type: "literal", value: "TRUE", description: "\"TRUE\"" },
          "true",
          { type: "literal", value: "true", description: "\"true\"" },
          function() {
              var lit = {};
              lit.token = "literal";
              lit.lang = null;
              lit.type = "http://www.w3.org/2001/XMLSchema#boolean";
              lit.value = true;
              return lit;
          },
          "FALSE",
          { type: "literal", value: "FALSE", description: "\"FALSE\"" },
          "false",
          { type: "literal", value: "false", description: "\"false\"" },
          function() {
              var lit = {};
              lit.token = "literal";
              lit.lang = null;
              lit.type = "http://www.w3.org/2001/XMLSchema#boolean";
              lit.value = false;
              return lit;
          },
          { type: "other", description: "[118] String" },
          function(s) { return {token:'string', value:s} },
          { type: "other", description: "[119] IRIref" },
          function(iri) { return {token: 'uri', prefix:null, suffix:null, value:iri} },
          function(p) { return p },
          { type: "other", description: "[120] PrefixedName" },
          function(p) { return {token: 'uri', prefix:p[0], suffix:p[1], value:null } },
          function(p) { return {token: 'uri', prefix:p, suffix:'', value:null } },
          { type: "other", description: "[121] BlankNode" },
          function(l) { return {token:'blank', value:l}},
          function() { GlobalBlankNodeCounter++; return {token:'blank', value:'_:'+GlobalBlankNodeCounter} },
          { type: "other", description: "[122] IRI_REF" },
          /^[^<>"{}|\^`\\]/,
          { type: "class", value: "[^<>\"{}|\\^`\\\\]", description: "[^<>\"{}|\\^`\\\\]" },
          function(iri_ref) { return iri_ref.join('') },
          { type: "other", description: "[123] PNAME_NS" },
          ":",
          { type: "literal", value: ":", description: "\":\"" },
          { type: "other", description: "[124] PNAME_LN" },
          function(p, s) { return [p, s] },
          { type: "other", description: "[125] BLANK_NODE_LABEL" },
          "_:",
          { type: "literal", value: "_:", description: "\"_:\"" },
          function(l) { return l },
          { type: "other", description: "[126] VAR1" },
          function(v) { return v },
          { type: "other", description: "[127] VAR2" },
          "$",
          { type: "literal", value: "$", description: "\"$\"" },
          { type: "other", description: "[128] LANGTAG" },
          "@",
          { type: "literal", value: "@", description: "\"@\"" },
          /^[a-zA-Z]/,
          { type: "class", value: "[a-zA-Z]", description: "[a-zA-Z]" },
          /^[a-zA-Z0-9]/,
          { type: "class", value: "[a-zA-Z0-9]", description: "[a-zA-Z0-9]" },
          function(a, b) {

              if(b.length===0) {
              return ("@"+a.join('')).toLowerCase();
              } else {
              return ("@"+a.join('')+"-"+b[0][1].join('')).toLowerCase();
              }
              },
          { type: "other", description: "[129] INTEGER" },
          /^[0-9]/,
          { type: "class", value: "[0-9]", description: "[0-9]" },
          function(d) {
              var lit = {};
              lit.token = "literal";
              lit.lang = null;
              lit.type = "http://www.w3.org/2001/XMLSchema#integer";
              lit.value = flattenString(d);
              return lit;
              },
          { type: "other", description: "[130] DECIMAL" },
          function(a, b, c) {

              var lit = {};
              lit.token = "literal";
              lit.lang = null;
              lit.type = "http://www.w3.org/2001/XMLSchema#decimal";
              lit.value = flattenString([a,b,c]);
              return lit;
              },
          function(a, b) {
              var lit = {};
              lit.token = "literal";
              lit.lang = null;
              lit.type = "http://www.w3.org/2001/XMLSchema#decimal";
              lit.value = flattenString([a,b]);
              return lit;
              },
          { type: "other", description: "[131] DOUBLE" },
          function(a, b, c, e) {
              var lit = {};
              lit.token = "literal";
              lit.lang = null;
              lit.type = "http://www.w3.org/2001/XMLSchema#double";
              lit.value = flattenString([a,b,c,e]);
              return lit;
              },
          function(a, b, c) {
              var lit = {};
              lit.token = "literal";
              lit.lang = null;
              lit.type = "http://www.w3.org/2001/XMLSchema#double";
              lit.value = flattenString([a,b,c]);
              return lit;
              },
          function(a, b) {
              var lit = {};
              lit.token = "literal";
              lit.lang = null;
              lit.type = "http://www.w3.org/2001/XMLSchema#double";
              lit.value = flattenString([a,b]);
              return lit;
              },
          { type: "other", description: "[132] INTEGER_POSITIVE" },
          function(d) { d.value = "+"+d.value; return d; },
          { type: "other", description: "[133] DECIMAL_POSITIVE" },
          function(d) { d.value = "+"+d.value; return d },
          { type: "other", description: "[134] DOUBLE_POSITIVE" },
          { type: "other", description: "[135] INTEGER_NEGATIVE" },
          function(d) { d.value = "-"+d.value; return d; },
          { type: "other", description: "[136] DECIMAL_NEGATIVE" },
          { type: "other", description: "[137] DOUBLE_NEGATIVE" },
          { type: "other", description: "[138] EXPONENT" },
          /^[eE]/,
          { type: "class", value: "[eE]", description: "[eE]" },
          /^[+\-]/,
          { type: "class", value: "[+\\-]", description: "[+\\-]" },
          function(a, b, c) { return flattenString([a,b,c]) },
          { type: "other", description: "[139] STRING_LITERAL1" },
          "'",
          { type: "literal", value: "'", description: "\"'\"" },
          /^[^'\\\n\r]/,
          { type: "class", value: "[^'\\\\\\n\\r]", description: "[^'\\\\\\n\\r]" },
          function(content) { return flattenString(content) },
          { type: "other", description: "[140] STRING_LITERAL2" },
          "\"",
          { type: "literal", value: "\"", description: "\"\\\"\"" },
          /^[^"\\\n\r]/,
          { type: "class", value: "[^\"\\\\\\n\\r]", description: "[^\"\\\\\\n\\r]" },
          { type: "other", description: "[141] STRING_LITERAL_LONG1" },
          "'''",
          { type: "literal", value: "'''", description: "\"'''\"" },
          /^[^'\\]/,
          { type: "class", value: "[^'\\\\]", description: "[^'\\\\]" },
          { type: "other", description: "[142] STRING_LITERAL_LONG2" },
          "\"\"\"",
          { type: "literal", value: "\"\"\"", description: "\"\\\"\\\"\\\"\"" },
          /^[^"\\]/,
          { type: "class", value: "[^\"\\\\]", description: "[^\"\\\\]" },
          { type: "other", description: "[143] ECHAR" },
          "\\",
          { type: "literal", value: "\\", description: "\"\\\\\"" },
          /^[tbnrf"']/,
          { type: "class", value: "[tbnrf\"']", description: "[tbnrf\"']" },
          { type: "other", description: "[144] NIL" },
          function() {

              return  {token: "triplesnodecollection",
              triplesContext:[],
              chainSubject:[{token:'uri', value:"http://www.w3.org/1999/02/22-rdf-syntax-ns#nil"}]};
              },
          { type: "other", description: "[145] WS" },
          /^[ ]/,
          { type: "class", value: "[ ]", description: "[ ]" },
          /^[\t]/,
          { type: "class", value: "[\\t]", description: "[\\t]" },
          /^[\r]/,
          { type: "class", value: "[\\r]", description: "[\\r]" },
          /^[\n]/,
          { type: "class", value: "[\\n]", description: "[\\n]" },
          { type: "other", description: " COMMENT" },
          "#",
          { type: "literal", value: "#", description: "\"#\"" },
          /^[^\n\r]/,
          { type: "class", value: "[^\\n\\r]", description: "[^\\n\\r]" },
          { type: "other", description: "[146] ANON" },
          { type: "other", description: "[147] PN_CHARS_BASE" },
          /^[A-Z]/,
          { type: "class", value: "[A-Z]", description: "[A-Z]" },
          /^[a-z]/,
          { type: "class", value: "[a-z]", description: "[a-z]" },
          /^[\xC0-\xD6]/,
          { type: "class", value: "[\\xC0-\\xD6]", description: "[\\xC0-\\xD6]" },
          /^[\xD8-\xF6]/,
          { type: "class", value: "[\\xD8-\\xF6]", description: "[\\xD8-\\xF6]" },
          /^[\xF8-\u02FF]/,
          { type: "class", value: "[\\xF8-\\u02FF]", description: "[\\xF8-\\u02FF]" },
          /^[\u0370-\u037D]/,
          { type: "class", value: "[\\u0370-\\u037D]", description: "[\\u0370-\\u037D]" },
          /^[\u037F-\u1FFF]/,
          { type: "class", value: "[\\u037F-\\u1FFF]", description: "[\\u037F-\\u1FFF]" },
          /^[\u200C-\u200D]/,
          { type: "class", value: "[\\u200C-\\u200D]", description: "[\\u200C-\\u200D]" },
          /^[\u2070-\u218F]/,
          { type: "class", value: "[\\u2070-\\u218F]", description: "[\\u2070-\\u218F]" },
          /^[\u2C00-\u2FEF]/,
          { type: "class", value: "[\\u2C00-\\u2FEF]", description: "[\\u2C00-\\u2FEF]" },
          /^[\u3001-\uD7FF]/,
          { type: "class", value: "[\\u3001-\\uD7FF]", description: "[\\u3001-\\uD7FF]" },
          /^[\uF900-\uFDCF]/,
          { type: "class", value: "[\\uF900-\\uFDCF]", description: "[\\uF900-\\uFDCF]" },
          /^[\uFDF0-\uFFFD]/,
          { type: "class", value: "[\\uFDF0-\\uFFFD]", description: "[\\uFDF0-\\uFFFD]" },
          /^[\u1000-\uEFFF]/,
          { type: "class", value: "[\\u1000-\\uEFFF]", description: "[\\u1000-\\uEFFF]" },
          { type: "other", description: "[148] PN_CHARS_U" },
          "_",
          { type: "literal", value: "_", description: "\"_\"" },
          { type: "other", description: "[149] VARNAME" },
          /^[\xB7]/,
          { type: "class", value: "[\\xB7]", description: "[\\xB7]" },
          /^[\u0300-\u036F]/,
          { type: "class", value: "[\\u0300-\\u036F]", description: "[\\u0300-\\u036F]" },
          /^[\u203F-\u2040]/,
          { type: "class", value: "[\\u203F-\\u2040]", description: "[\\u203F-\\u2040]" },
          function(init, rpart) { return init+rpart.join('') },
          { type: "other", description: "[150] PN_CHARS" },
          { type: "other", description: "[151] PN_PREFIX" },
          function(base, rest) { if(rest[rest.length-1] == '.'){
              throw new Error("Wrong PN_PREFIX, cannot finish with '.'")
              } else {
              return base + rest.join('');
              }},
          { type: "other", description: "[152] PN_LOCAL" },
          function(base, rest) {
            return base + (rest||[]).join('');
          },
          { type: "other", description: "[170] PLX" },
          { type: "other", description: "[171] PERCENT" },
          "%",
          { type: "literal", value: "%", description: "\"%\"" },
          function(h) {
            return h.join("");
          },
          { type: "other", description: "[172] HEX" },
          /^[A-F]/,
          { type: "class", value: "[A-F]", description: "[A-F]" },
          /^[a-f]/,
          { type: "class", value: "[a-f]", description: "[a-f]" },
          { type: "other", description: "[173] PN_LOCAL_ESC" },
          "~",
          { type: "literal", value: "~", description: "\"~\"" },
          "&",
          { type: "literal", value: "&", description: "\"&\"" },
          function(c) {
             return "\\"+c;
          }
        ],

        peg$bytecode = [
          peg$decode("7!"),
          peg$decode("7\"*# \"7?"),
          peg$decode("87#9*\" 3 "),
          peg$decode("8!7$+P$7'*/ \"7**) \"7+*# \"7,+4%7>+*%4#6###\"! %$## \"$\"# \"\"# \"9*\" 3!"),
          peg$decode("8!7%*# \" %+M$ &7\xC0,#&7\xC0\"+;% &7&,#&7&\"+)%4#6'#\"\" %$## \"$\"# \"\"# \"9*\" 3$"),
          peg$decode("8! &7\xC0,#&7\xC0\"+`$.)\"\"2)3**) \".+\"\"2+3,+D% &7\xC0,#&7\xC0\"+2%7\xA9+(%4$6-$! %$$# \"$## \"$\"# \"\"# \"9*\" 3("),
          peg$decode("8! &7\xC0,#&7\xC0\"+}$./\"\"2/30*) \".1\"\"2132+a% &7\xC0,#&7\xC0\"+O%7\xAA+E% &7\xC0,#&7\xC0\"+3%7\xA9+)%4&63&\"\" %$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3."),
          peg$decode("8!7)+\xA3$ &7\xC0,#&7\xC0\"+\x91% &7-,#&7-\"+% &7\xC0,#&7\xC0\"+m%71+c% &7\xC0,#&7\xC0\"+Q%72+G% &7\xC0,#&7\xC0\"+5%7<++%4)65)$(&$\"%$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 34"),
          peg$decode("8!7)+>$71+4%72+*%4#67##\"! %$## \"$\"# \"\"# \"9*\" 36"),
          peg$decode("8! &7\xC0,#&7\xC0\"+\u02DB$.9\"\"293:*) \".;\"\"2;3<+\u02BF% &7\xC0,#&7\xC0\"+\u02AD%.=\"\"2=3>*) \".?\"\"2?3@*5 \".A\"\"2A3B*) \".C\"\"2C3D*# \" %+\u0273% &7\xC0,#&7\xC0\"+\u0261% &! &7\xC0,#&7\xC0\"+?$7\x8C+5% &7\xC0,#&7\xC0\"+#%'#%$## \"$\"# \"\"# \"*\xE0 \"! &7\xC0,#&7\xC0\"+\xCD$.E\"\"2E3F+\xBD% &7\xC0,#&7\xC0\"+\xAB%7\x8E+\xA1% &7\xC0,#&7\xC0\"+\x8F%.G\"\"2G3H*) \".I\"\"2I3J+s% &7\xC0,#&7\xC0\"+a%7\x8C+W% &7\xC0,#&7\xC0\"+E%.K\"\"2K3L+5% &7\xC0,#&7\xC0\"+#%'+%$+# \"$*# \"$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"+\u0118$,\u0115&! &7\xC0,#&7\xC0\"+?$7\x8C+5% &7\xC0,#&7\xC0\"+#%'#%$## \"$\"# \"\"# \"*\xE0 \"! &7\xC0,#&7\xC0\"+\xCD$.E\"\"2E3F+\xBD% &7\xC0,#&7\xC0\"+\xAB%7\x8E+\xA1% &7\xC0,#&7\xC0\"+\x8F%.G\"\"2G3H*) \".I\"\"2I3J+s% &7\xC0,#&7\xC0\"+a%7\x8C+W% &7\xC0,#&7\xC0\"+E%.K\"\"2K3L+5% &7\xC0,#&7\xC0\"+#%'+%$+# \"$*# \"$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"\"\"\" \"*X \"! &7\xC0,#&7\xC0\"+E$.M\"\"2M3N+5% &7\xC0,#&7\xC0\"+#%'#%$## \"$\"# \"\"# \"+)%4&6O&\"\" %$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 38"),
          peg$decode("8! &7\xC0,#&7\xC0\"+\xBF$.Q\"\"2Q3R*) \".S\"\"2S3T+\xA3% &7\xC0,#&7\xC0\"+\x91%7h+\x87% &7\xC0,#&7\xC0\"+u% &7-,#&7-\"+c% &7\xC0,#&7\xC0\"+Q%71+G% &7\xC0,#&7\xC0\"+5%72++%4*6U*$&$\" %$*# \"$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*\u012D \"! &7\xC0,#&7\xC0\"+\u011A$.Q\"\"2Q3R*) \".S\"\"2S3T+\xFE% &7\xC0,#&7\xC0\"+\xEC% &7-,#&7-\"+\xDA% &7\xC0,#&7\xC0\"+\xC8%.V\"\"2V3W*) \".X\"\"2X3Y+\xAC% &7\xC0,#&7\xC0\"+\x9A%.Z\"\"2Z3[+\x8A% &7\xC0,#&7\xC0\"+x%7S*# \" %+h% &7\xC0,#&7\xC0\"+V%.\\\"\"2\\3]+F% &7\xC0,#&7\xC0\"+4%72+*%4.6^.#*$ %$.# \"$-# \"$,# \"$+# \"$*# \"$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3P"),
          peg$decode("8!.`\"\"2`3a+t$ &7\x8B+&$,#&7\x8B\"\"\" \"*) \".M\"\"2M3N+O% &7-,#&7-\"+=%71*# \" %+-%72+#%'%%$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3_"),
          peg$decode("8! &7\xC0,#&7\xC0\"+\x85$.c\"\"2c3d*) \".e\"\"2e3f+i% &7\xC0,#&7\xC0\"+W% &7-,#&7-\"+E% &7\xC0,#&7\xC0\"+3%71+)%4&6g&\"\" %$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3b"),
          peg$decode("8!.i\"\"2i3j*) \".k\"\"2k3l+\\$ &7\xC0,#&7\xC0\"+J%7.*# \"7/+:% &7\xC0,#&7\xC0\"+(%4$6m$!!%$$# \"$## \"$\"# \"\"# \"9*\" 3h"),
          peg$decode("8! &7\xC0,#&7\xC0\"+2$70+(%4\"6o\"! %$\"# \"\"# \"9*\" 3n"),
          peg$decode("8!.q\"\"2q3r*) \".s\"\"2s3t+D$ &7\xC0,#&7\xC0\"+2%70+(%4#6u#! %$## \"$\"# \"\"# \"9*\" 3p"),
          peg$decode("87\xA69*\" 3v"),
          peg$decode("8!.V\"\"2V3W*) \".X\"\"2X3Y*# \" %+V$ &7\xC0,#&7\xC0\"+D%7T+:% &7\xC0,#&7\xC0\"+(%4$6x$!!%$$# \"$## \"$\"# \"\"# \"9*\" 3w"),
          peg$decode("8!73*# \" %+Z$75*# \" %+J%77*# \" %+:%79*# \" %+*%4$6z$##! %$$# \"$## \"$\"# \"\"# \"9*\" 3y"),
          peg$decode("8!.|\"\"2|3}*) \".~\"\"2~3+\x81$ &7\xC0,#&7\xC0\"+o%.\x80\"\"2\x803\x81*) \".\x82\"\"2\x823\x83+S% &7\xC0,#&7\xC0\"+A% &74+&$,#&74\"\"\" \"+(%4%6\x84%! %$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3{"),
          peg$decode("8! &7\xC0,#&7\xC0\"+D$7\x99+:% &7\xC0,#&7\xC0\"+(%4#6\x86#!!%$## \"$\"# \"\"# \"*\u016B \"! &7\xC0,#&7\xC0\"+D$7e+:% &7\xC0,#&7\xC0\"+(%4#6\x87#!!%$## \"$\"# \"\"# \"*\u0131 \"! &7\xC0,#&7\xC0\"+\xE4$.E\"\"2E3F+\xD4% &7\xC0,#&7\xC0\"+\xC2%7\x8E+\xB8% &7\xC0,#&7\xC0\"+\xA6%!.G\"\"2G3H*) \".I\"\"2I3J+?$ &7\xC0,#&7\xC0\"+-%7\x8C+#%'#%$## \"$\"# \"\"# \"*# \" %+]% &7\xC0,#&7\xC0\"+K%.K\"\"2K3L+;% &7\xC0,#&7\xC0\"+)%4)6\x88)\"%#%$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*W \"! &7\xC0,#&7\xC0\"+D$7\x8C+:% &7\xC0,#&7\xC0\"+(%4#6\x89#!!%$## \"$\"# \"\"# \"9*\" 3\x85"),
          peg$decode("8!.\x8B\"\"2\x8B3\x8C+<$ &76+&$,#&76\"\"\" \"+#%'\"%$\"# \"\"# \"9*\" 3\x8A"),
          peg$decode("87_9*\" 3\x8D"),
          peg$decode("8!.\x8F\"\"2\x8F3\x90*) \".\x91\"\"2\x913\x92+\x93$ &7\xC0,#&7\xC0\"+\x81%.\x80\"\"2\x803\x81*) \".\x82\"\"2\x823\x83+e% &7\xC0,#&7\xC0\"+S% &78+&$,#&78\"\"\" \"+:% &7\xC0,#&7\xC0\"+(%4&6\x93&!!%$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\x8E"),
          peg$decode("8!.\x95\"\"2\x953\x96*A \".\x97\"\"2\x973\x98*5 \".\x99\"\"2\x993\x9A*) \".\x9B\"\"2\x9B3\x9C+W$ &7\xC0,#&7\xC0\"+E%7\x98+;% &7\xC0,#&7\xC0\"+)%4$6\x9D$\"#!%$$# \"$## \"$\"# \"\"# \"*K \"!7_*# \"7\x8C+:$ &7\xC0,#&7\xC0\"+(%4\"6\x9E\"!!%$\"# \"\"# \"9*\" 3\x94"),
          peg$decode("8!!7:+3$7;*# \" %+#%'\"%$\"# \"\"# \"*> \"!7;+3$7:*# \" %+#%'\"%$\"# \"\"# \"+' 4!6\xA0!! %9*\" 3\x9F"),
          peg$decode("8!.\xA2\"\"2\xA23\xA3*) \".\xA4\"\"2\xA43\xA5+V$ &7\xC0,#&7\xC0\"+D%7\xB0+:% &7\xC0,#&7\xC0\"+(%4$6\xA6$!!%$$# \"$## \"$\"# \"\"# \"9*\" 3\xA1"),
          peg$decode("8!.\xA8\"\"2\xA83\xA9*) \".\xAA\"\"2\xAA3\xAB+V$ &7\xC0,#&7\xC0\"+D%7\xB0+:% &7\xC0,#&7\xC0\"+(%4$6\xAC$!!%$$# \"$## \"$\"# \"\"# \"9*\" 3\xA7"),
          peg$decode("8!.\xAE\"\"2\xAE3\xAF+\xE7$ &7\x8C,#&7\x8C\"+\xD5%.Z\"\"2Z3[+\xC5% &!.E\"\"2E3F+L$ &7=+&$,#&7=\"\"\" \"+3%.K\"\"2K3L+#%'#%$## \"$\"# \"\"# \"*# \"7\xBF,c&!.E\"\"2E3F+L$ &7=+&$,#&7=\"\"\" \"+3%.K\"\"2K3L+#%'#%$## \"$\"# \"\"# \"*# \"7\xBF\"+3%.\\\"\"2\\3]+#%'%%$%# \"$$# \"$## \"$\"# \"\"# \"*# \" %9*\" 3\xAD"),
          peg$decode("87\xA6*; \"7\x9F*5 \"7\xA0*/ \"7\xA4*) \".\xB1\"\"2\xB13\xB29*\" 3\xB0"),
          peg$decode("8!!.\xB4\"\"2\xB43\xB5*) \".\xB6\"\"2\xB63\xB7+-$7a+#%'\"%$\"# \"\"# \"*# \" %+' 4!6\xB8!! %9*\" 3\xB3"),
          peg$decode("87@9*\" 3\xB9"),
          peg$decode("8!7$+\x9B$ &7\xC0,#&7\xC0\"+\x89%7A+%! &7\xC0,#&7\xC0\"+U$.\xBB\"\"2\xBB3\xBC+E% &7\xC0,#&7\xC0\"+3%7@*# \" %+#%'$%$$# \"$## \"$\"# \"\"# \"*# \" %+*%4$6\xBD$##! %$$# \"$## \"$\"# \"\"# \"9*\" 3\xBA"),
          peg$decode("87B*G \"7C*A \"7D*; \"7E*5 \"7F*/ \"7G*) \"7H*# \"7I9*\" 3\xBE"),
          peg$decode("8!.\xC0\"\"2\xC03\xC1*) \".\xC2\"\"2\xC23\xC3+\xA0$ &7\xC0,#&7\xC0\"+\x8E%7\xA6+\x84% &7\xC0,#&7\xC0\"+r%!.\xC4\"\"2\xC43\xC5*) \".\xC6\"\"2\xC63\xC7+?$ &7\xC0,#&7\xC0\"+-%7M+#%'#%$## \"$\"# \"\"# \"*# \" %+)%4%6\xC8%\"\" %$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\xBF"),
          peg$decode("8!.\xCA\"\"2\xCA3\xCB*) \".\xCC\"\"2\xCC3\xCD+x$ &7\xC0,#&7\xC0\"+f%.\xCE\"\"2\xCE3\xCF*) \".\xD0\"\"2\xD03\xD1*# \" %+D% &7\xC0,#&7\xC0\"+2%7N+(%4%6\xD2%! %$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\xC9"),
          peg$decode("8!.\xD4\"\"2\xD43\xD5*) \".\xD6\"\"2\xD63\xD7+x$ &7\xC0,#&7\xC0\"+f%.\xCE\"\"2\xCE3\xCF*) \".\xD0\"\"2\xD03\xD1*# \" %+D% &7\xC0,#&7\xC0\"+2%7N+(%4%6\xD8%! %$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\xD3"),
          peg$decode("8!.\xDA\"\"2\xDA3\xDB*) \".\xDC\"\"2\xDC3\xDD+x$ &7\xC0,#&7\xC0\"+f%.\xCE\"\"2\xCE3\xCF*) \".\xD0\"\"2\xD03\xD1*# \" %+D% &7\xC0,#&7\xC0\"+2%7M+(%4%6\xDE%! %$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\xD9"),
          peg$decode("8!.\xE0\"\"2\xE03\xE1*) \".\xE2\"\"2\xE23\xE3+r$ &7\xC0,#&7\xC0\"+`%.\xE4\"\"2\xE43\xE5*) \".\xE6\"\"2\xE63\xE7+D% &7\xC0,#&7\xC0\"+2%7P+(%4%6\xE8%! %$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\xDF"),
          peg$decode("8!.\xEA\"\"2\xEA3\xEB*) \".\xEC\"\"2\xEC3\xED+`$ &7\xC0,#&7\xC0\"+N%.\xE4\"\"2\xE43\xE5*) \".\xE6\"\"2\xE63\xE7+2%7P+(%4$6\xEE$! %$$# \"$## \"$\"# \"\"# \"9*\" 3\xE9"),
          peg$decode("8!.\xEA\"\"2\xEA3\xEB*) \".\xEC\"\"2\xEC3\xED+r$ &7\xC0,#&7\xC0\"+`%.V\"\"2V3W*) \".X\"\"2X3Y+D% &7\xC0,#&7\xC0\"+2%7T+(%4%6\xF0%! %$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\xEF"),
          peg$decode("8!!.\xF2\"\"2\xF23\xF3*) \".\xF4\"\"2\xF43\xF5+?$ &7\xC0,#&7\xC0\"+-%7\xA6+#%'#%$## \"$\"# \"\"# \"*# \" %+\xFA$ &7\xC0,#&7\xC0\"+\xE8%!7J+E$ &7\xC0,#&7\xC0\"+3%7K*# \" %+#%'#%$## \"$\"# \"\"# \"*# \"7K+\xAB% &7\xC0,#&7\xC0\"+\x99% &7L,#&7L\"+\x87% &7\xC0,#&7\xC0\"+u%.V\"\"2V3W*) \".X\"\"2X3Y+Y% &7\xC0,#&7\xC0\"+G%7T+=% &7\xC0,#&7\xC0\"++%4*6\xF6*$)'%!%$*# \"$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\xF1"),
          peg$decode("8!.\xEA\"\"2\xEA3\xEB*) \".\xEC\"\"2\xEC3\xED+2$7O+(%4\"6\xF8\"! %$\"# \"\"# \"9*\" 3\xF7"),
          peg$decode("8!.\xE0\"\"2\xE03\xE1*) \".\xE2\"\"2\xE23\xE3+2$7O+(%4\"6\xF8\"! %$\"# \"\"# \"9*\" 3\xF9"),
          peg$decode("8! &7\xC0,#&7\xC0\"+\x9F$.\xFB\"\"2\xFB3\xFC*) \".\xFD\"\"2\xFD3\xFE+\x83% &7\xC0,#&7\xC0\"+q%7\xA6*\\ \"!.q\"\"2q3r*) \".s\"\"2s3t+?$ &7\xC0,#&7\xC0\"+-%7\xA6+#%'#%$## \"$\"# \"\"# \"+(%4$6\xFF$! %$$# \"$## \"$\"# \"\"# \"9*\" 3\xFA"),
          peg$decode("8!.\u0101\"\"2\u01013\u0102*) \".\u0103\"\"2\u01033\u0104+D$ &7\xC0,#&7\xC0\"+2%7\xA6+(%4#6\u0105#! %$## \"$\"# \"\"# \"9*\" 3\u0100"),
          peg$decode("8!7M+' 4!6x!! %*\x86 \"!.\u0107\"\"2\u01073\u0108*) \".\u0109\"\"2\u01093\u010A+& 4!6\u010B! %*c \"!.q\"\"2q3r*) \".s\"\"2s3t+& 4!6\u010C! %*@ \"!.\u010D\"\"2\u010D3\u010E*) \".\u010F\"\"2\u010F3\u0110+& 4!6\u0111! %9*\" 3\u0106"),
          peg$decode("8! &7\xC0,#&7\xC0\"+\x88$.Z\"\"2Z3[+x% &7\xC0,#&7\xC0\"+f%7Q+\\% &7\xC0,#&7\xC0\"+J%.\\\"\"2\\3]+:% &7\xC0,#&7\xC0\"+(%4'6\u0113'!#%$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\u0112"),
          peg$decode("8! &7\xC0,#&7\xC0\"+\x88$.Z\"\"2Z3[+x% &7\xC0,#&7\xC0\"+f%7Q+\\% &7\xC0,#&7\xC0\"+J%.\\\"\"2\\3]+:% &7\xC0,#&7\xC0\"+(%4'6\u0113'!#%$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\u0114"),
          peg$decode("8!7S*# \" %+\x9D$ &!7R+I$.\u0116\"\"2\u01163\u0117*# \" %+3%7S*# \" %+#%'#%$## \"$\"# \"\"# \",T&!7R+I$.\u0116\"\"2\u01163\u0117*# \" %+3%7S*# \" %+#%'#%$## \"$\"# \"\"# \"\"+)%4\"6\u0118\"\"! %$\"# \"\"# \"9*\" 3\u0115"),
          peg$decode("8! &7\xC0,#&7\xC0\"+\xD9$.\u0101\"\"2\u01013\u0102*) \".\u0103\"\"2\u01033\u0104+\xBD% &7\xC0,#&7\xC0\"+\xAB%7\x8B+\xA1% &7\xC0,#&7\xC0\"+\x8F%.Z\"\"2Z3[+% &7\xC0,#&7\xC0\"+m%7S*# \" %+]% &7\xC0,#&7\xC0\"+K%.\\\"\"2\\3]+;% &7\xC0,#&7\xC0\"+)%4+6\u011A+\"'#%$+# \"$*# \"$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\u0119"),
          peg$decode("8!7j+~$! &7\xC0,#&7\xC0\"+U$.\u0116\"\"2\u01163\u0117+E% &7\xC0,#&7\xC0\"+3%7S*# \" %+#%'$%$$# \"$## \"$\"# \"\"# \"*# \" %+)%4\"6\u011C\"\"! %$\"# \"\"# \"9*\" 3\u011B"),
          peg$decode("8!.Z\"\"2Z3[+f$ &7\xC0,#&7\xC0\"+T%7(+J% &7\xC0,#&7\xC0\"+8%.\\\"\"2\\3]+(%4%6\u011E%!\"%$%# \"$$# \"$## \"$\"# \"\"# \"*w \"!.Z\"\"2Z3[+f$ &7\xC0,#&7\xC0\"+T%7U+J% &7\xC0,#&7\xC0\"+8%.\\\"\"2\\3]+(%4%6\u011E%!\"%$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\u011D"),
          peg$decode("8!7V*# \" %+\xF7$ &7\xC0,#&7\xC0\"+\xE5% &!7W+m$ &7\xC0,#&7\xC0\"+[%.\u0116\"\"2\u01163\u0117*# \" %+E% &7\xC0,#&7\xC0\"+3%7V*# \" %+#%'%%$%# \"$$# \"$## \"$\"# \"\"# \",x&!7W+m$ &7\xC0,#&7\xC0\"+[%.\u0116\"\"2\u01163\u0117*# \" %+E% &7\xC0,#&7\xC0\"+3%7V*# \" %+#%'%%$%# \"$$# \"$## \"$\"# \"\"# \"\"+)%4#6\u0120#\"\" %$## \"$\"# \"\"# \"9*\" 3\u011F"),
          peg$decode("8!7s+l$! &7\xC0,#&7\xC0\"+C$.\u0116\"\"2\u01163\u0117+3%7V*# \" %+#%'#%$## \"$\"# \"\"# \"*# \" %+)%4\"6\u0122\"\"! %$\"# \"\"# \"9*\" 3\u0121"),
          peg$decode("87\\*G \"7X*A \"7[*; \"7Y*5 \"7Z*/ \"7]*) \"7^*# \"7`9*\" 3\u0123"),
          peg$decode("8! &7\xC0,#&7\xC0\"+`$.\u0125\"\"2\u01253\u0126*) \".\u0127\"\"2\u01273\u0128+D% &7\xC0,#&7\xC0\"+2%7T+(%4$6\u0129$! %$$# \"$## \"$\"# \"\"# \"9*\" 3\u0124"),
          peg$decode("8! &7\xC0,#&7\xC0\"+}$.\u0101\"\"2\u01013\u0102*) \".\u0103\"\"2\u01033\u0104+a% &7\xC0,#&7\xC0\"+O%7\x8B+E% &7\xC0,#&7\xC0\"+3%7T+)%4&6\u012B&\"\" %$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\u012A"),
          peg$decode("8!.\u012D\"\"2\u012D3\u012E+=$7\x8B+3%7T+)%4#6\u012F#\"! %$## \"$\"# \"\"# \"9*\" 3\u012C"),
          peg$decode("8!.\u0131\"\"2\u01313\u0132*) \".\u0133\"\"2\u01333\u0134+D$ &7\xC0,#&7\xC0\"+2%7T+(%4#6\u0135#! %$## \"$\"# \"\"# \"9*\" 3\u0130"),
          peg$decode("8!7T+\xD1$ &! &7\xC0,#&7\xC0\"+[$.\u0137\"\"2\u01373\u0138*) \".\u0139\"\"2\u01393\u013A+?% &7\xC0,#&7\xC0\"+-%7T+#%'$%$$# \"$## \"$\"# \"\"# \",n&! &7\xC0,#&7\xC0\"+[$.\u0137\"\"2\u01373\u0138*) \".\u0139\"\"2\u01393\u013A+?% &7\xC0,#&7\xC0\"+-%7T+#%'$%$$# \"$## \"$\"# \"\"# \"\"+)%4\"6\u013B\"\"! %$\"# \"\"# \"9*\" 3\u0136"),
          peg$decode("8! &7\xC0,#&7\xC0\"+`$.\u013D\"\"2\u013D3\u013E*) \".\u013F\"\"2\u013F3\u0140+D% &7\xC0,#&7\xC0\"+2%7_+(%4$6\u0141$! %$$# \"$## \"$\"# \"\"# \"9*\" 3\u013C"),
          peg$decode("8! &7\xC0,#&7\xC0\"+\xEF$.\u0143\"\"2\u01433\u0144*) \".\u0145\"\"2\u01453\u0146+\xD3% &7\xC0,#&7\xC0\"+\xC1%.E\"\"2E3F+\xB1% &7\xC0,#&7\xC0\"+\x9F%7\x8E+\x95% &7\xC0,#&7\xC0\"+\x83%.I\"\"2I3J*) \".G\"\"2G3H+g% &7\xC0,#&7\xC0\"+U%7\x8C+K% &7\xC0,#&7\xC0\"+9%.K\"\"2K3L+)%4,6\u0147,\"&\"%$,# \"$+# \"$*# \"$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\u0142"),
          peg$decode("87\x98*) \"7\x99*# \"7e9*\" 3\u0148"),
          peg$decode("8! &7\xC0,#&7\xC0\"+`$.\xB4\"\"2\xB43\xB5*) \".\xB6\"\"2\xB63\xB7+D% &7\xC0,#&7\xC0\"+2%7a+(%4$6\u014A$! %$$# \"$## \"$\"# \"\"# \"9*\" 3\u0149"),
          peg$decode("87b*# \"7c9*\" 3\u014B"),
          peg$decode("8! &7\xC0,#&7\xC0\"+\x89$7\x8C+% &7\xC0,#&7\xC0\"+m%.Z\"\"2Z3[+]% &7\xC0,#&7\xC0\"+K% &7d,#&7d\"+9%.\\\"\"2\\3]+)%4'6\u014D'\"%!%$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\u014C"),
          peg$decode("8! &7\xC0,#&7\xC0\"+\u01FA$7\xBF*z \"!.E\"\"2E3F+i$ &7\xC0,#&7\xC0\"+W% &7\x8C,#&7\x8C\"+E% &7\xC0,#&7\xC0\"+3%.K\"\"2K3L+#%'%%$%# \"$$# \"$## \"$\"# \"\"# \"+\u0193% &7\xC0,#&7\xC0\"+\u0181%.Z\"\"2Z3[+\u0171% &7\xC0,#&7\xC0\"+\u015F% &! &7\xC0,#&7\xC0\"+\x8B$.E\"\"2E3F+{% &7\xC0,#&7\xC0\"+i% &7d,#&7d\"+W% &7\xC0,#&7\xC0\"+E%.K\"\"2K3L+5% &7\xC0,#&7\xC0\"+#%''%$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*# \"7\xBF,\xA4&! &7\xC0,#&7\xC0\"+\x8B$.E\"\"2E3F+{% &7\xC0,#&7\xC0\"+i% &7d,#&7d\"+W% &7\xC0,#&7\xC0\"+E%.K\"\"2K3L+5% &7\xC0,#&7\xC0\"+#%''%$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*# \"7\xBF\"+K% &7\xC0,#&7\xC0\"+9%.\\\"\"2\\3]+)%4(6\u014F(\"&\"%$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\u014E"),
          peg$decode("8! &7\xC0,#&7\xC0\"+b$7\xA9*; \"7\x9F*5 \"7\xA0*/ \"7\xA4*) \".\xB1\"\"2\xB13\xB2+:% &7\xC0,#&7\xC0\"+(%4#6\x89#!!%$## \"$\"# \"\"# \"9*\" 3\u0150"),
          peg$decode("8!7\xA6+3$7f+)%4\"6\u0152\"\"! %$\"# \"\"# \"9*\" 3\u0151"),
          peg$decode("8!7\xBF+& 4!6\u0154! %*\xBF \"!.E\"\"2E3F+\xAE$.=\"\"2=3>*) \".?\"\"2?3@*# \" %+\x8C%7\x8E+\x82% &!.\u0155\"\"2\u01553\u0156+-$7\x8E+#%'\"%$\"# \"\"# \",>&!.\u0155\"\"2\u01553\u0156+-$7\x8E+#%'\"%$\"# \"\"# \"\"+:%.K\"\"2K3L+*%4%6\u0157%##\"!%$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\u0153"),
          peg$decode("8!7\xBF+& 4!6\u0154! %*\xAE \"!.E\"\"2E3F+\x9D$7\xA6*# \"7\x8E+\x8D% &!.\u0155\"\"2\u01553\u0156+3$7\xA6*# \"7\x8E+#%'\"%$\"# \"\"# \",D&!.\u0155\"\"2\u01553\u0156+3$7\xA6*# \"7\x8E+#%'\"%$\"# \"\"# \"\"+9%.K\"\"2K3L+)%4$6\u0159$\"\"!%$$# \"$## \"$\"# \"\"# \"9*\" 3\u0158"),
          peg$decode("8!.Z\"\"2Z3[+l$ &7\xC0,#&7\xC0\"+Z%7i*# \" %+J% &7\xC0,#&7\xC0\"+8%.\\\"\"2\\3]+(%4%6\u015B%!\"%$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\u015A"),
          peg$decode("8!7j+~$! &7\xC0,#&7\xC0\"+U$.\u0116\"\"2\u01163\u0117+E% &7\xC0,#&7\xC0\"+3%7i*# \" %+#%'$%$$# \"$## \"$\"# \"\"# \"*# \" %+)%4\"6\u015D\"\"! %$\"# \"\"# \"9*\" 3\u015C"),
          peg$decode("8! &7\xC0,#&7\xC0\"+O$7\x8A+E% &7\xC0,#&7\xC0\"+3%7l+)%4$6\u015F$\"\" %$$# \"$## \"$\"# \"\"# \"*b \"! &7\xC0,#&7\xC0\"+O$7\x83+E% &7\xC0,#&7\xC0\"+3%7m+)%4$6\u0160$\"\" %$$# \"$## \"$\"# \"\"# \"9*\" 3\u015E"),
          peg$decode("8!7v*# \"7w+\u013C$ &7\xC0,#&7\xC0\"+\u012A%7n+\u0120% &! &7\xC0,#&7\xC0\"+\x82$.\xBB\"\"2\xBB3\xBC+r% &7\xC0,#&7\xC0\"+`%!7v*# \"7w+?$ &7\xC0,#&7\xC0\"+-%7o+#%'#%$## \"$\"# \"\"# \"*# \" %+#%'$%$$# \"$## \"$\"# \"\"# \",\x95&! &7\xC0,#&7\xC0\"+\x82$.\xBB\"\"2\xBB3\xBC+r% &7\xC0,#&7\xC0\"+`%!7v*# \"7w+?$ &7\xC0,#&7\xC0\"+-%7o+#%'#%$## \"$\"# \"\"# \"*# \" %+#%'$%$$# \"$## \"$\"# \"\"# \"\"+*%4$6\u0162$##! %$$# \"$## \"$\"# \"\"# \"9*\" 3\u0161"),
          peg$decode("8!7r+\u0130$ &7\xC0,#&7\xC0\"+\u011E%7o+\u0114% &! &7\xC0,#&7\xC0\"+|$.\xBB\"\"2\xBB3\xBC+l% &7\xC0,#&7\xC0\"+Z%!7r+?$ &7\xC0,#&7\xC0\"+-%7o+#%'#%$## \"$\"# \"\"# \"*# \" %+#%'$%$$# \"$## \"$\"# \"\"# \",\x8F&! &7\xC0,#&7\xC0\"+|$.\xBB\"\"2\xBB3\xBC+l% &7\xC0,#&7\xC0\"+Z%!7r+?$ &7\xC0,#&7\xC0\"+-%7o+#%'#%$## \"$\"# \"\"# \"*# \" %+#%'$%$$# \"$## \"$\"# \"\"# \"\"+*%4$6\u0164$##! %$$# \"$## \"$\"# \"\"# \"9*\" 3\u0163"),
          peg$decode("87l*# \" %9*\" 3\u0165"),
          peg$decode("8!7p+\xA7$ &7\xC0,#&7\xC0\"+\x95% &!.\u0155\"\"2\u01553\u0156+?$ &7\xC0,#&7\xC0\"+-%7p+#%'#%$## \"$\"# \"\"# \",P&!.\u0155\"\"2\u01553\u0156+?$ &7\xC0,#&7\xC0\"+-%7p+#%'#%$## \"$\"# \"\"# \"\"+)%4#6\u0167#\"\" %$## \"$\"# \"\"# \"9*\" 3\u0166"),
          peg$decode("8!7q+\xA7$ &7\xC0,#&7\xC0\"+\x95% &!.\u0155\"\"2\u01553\u0156+?$ &7\xC0,#&7\xC0\"+-%7q+#%'#%$## \"$\"# \"\"# \",P&!.\u0155\"\"2\u01553\u0156+?$ &7\xC0,#&7\xC0\"+-%7q+#%'#%$## \"$\"# \"\"# \"\"+)%4#6\u0169#\"\" %$## \"$\"# \"\"# \"9*\" 3\u0168"),
          peg$decode("87\x889*\" 3\u016A"),
          peg$decode("87\x899*\" 3\u016B"),
          peg$decode("87\x8B*4 \"!.\u016D\"\"2\u016D3\u016E+& 4!6\u016F! %9*\" 3\u016C"),
          peg$decode("8! &7\xC0,#&7\xC0\"+O$7\x8A+E% &7\xC0,#&7\xC0\"+3%7t+)%4$6\u0171$\"\" %$$# \"$## \"$\"# \"\"# \"*b \"! &7\xC0,#&7\xC0\"+O$7\x82+E% &7\xC0,#&7\xC0\"+3%7u+)%4$6\u0172$\"\" %$$# \"$## \"$\"# \"\"# \"9*\" 3\u0170"),
          peg$decode("8!7v*# \"7w+\u0118$ &7\xC0,#&7\xC0\"+\u0106%7n+\xFC% &! &7\xC0,#&7\xC0\"+p$.\xBB\"\"2\xBB3\xBC+`% &7\xC0,#&7\xC0\"+N%!7v*# \"7w+-$7o+#%'\"%$\"# \"\"# \"*# \" %+#%'$%$$# \"$## \"$\"# \"\"# \",\x83&! &7\xC0,#&7\xC0\"+p$.\xBB\"\"2\xBB3\xBC+`% &7\xC0,#&7\xC0\"+N%!7v*# \"7w+-$7o+#%'\"%$\"# \"\"# \"*# \" %+#%'$%$$# \"$## \"$\"# \"\"# \"\"+*%4$6\u0174$##! %$$# \"$## \"$\"# \"\"# \"9*\" 3\u0173"),
          peg$decode("87k*# \" %9*\" 3\u0175"),
          peg$decode("8!7x+' 4!6\u0177!! %9*\" 3\u0176"),
          peg$decode("87\x8C9*\" 3\u0178"),
          peg$decode("87y9*\" 3\u0179"),
          peg$decode("8!7z+q$ &!.\u017B\"\"2\u017B3\u017C+-$7z+#%'\"%$\"# \"\"# \",>&!.\u017B\"\"2\u017B3\u017C+-$7z+#%'\"%$\"# \"\"# \"\"+)%4\"6\u017D\"\"! %$\"# \"\"# \"9*\" 3\u017A"),
          peg$decode("8!7|+q$ &!.\u017F\"\"2\u017F3\u0180+-$7|+#%'\"%$\"# \"\"# \",>&!.\u017F\"\"2\u017F3\u0180+-$7|+#%'\"%$\"# \"\"# \"\"+)%4\"6\u0181\"\"! %$\"# \"\"# \"9*\" 3\u017E"),
          peg$decode("8!7~+9$7}*# \" %+)%4\"6\u0183\"\"! %$\"# \"\"# \"9*\" 3\u0182"),
          peg$decode("87{*C \"!.\u0185\"\"2\u01853\u0186+2$7{+(%4\"6\u0187\"! %$\"# \"\"# \"9*\" 3\u0184"),
          peg$decode("8.M\"\"2M3N*\xEA \".\u0189\"\"2\u01893\u018A*\xDE \".\u018B\"\"2\u018B3\u018C*\xD2 \"!.Z\"\"2Z3[+\xC1$!7\x81+{$!.\u0155\"\"2\u01553\u0156+T$.\\\"\"2\\3]*> \"!7\x81+3$.\\\"\"2\\3]+#%'\"%$\"# \"\"# \"+#%'\"%$\"# \"\"# \"*) \".\\\"\"2\\3]+#%'\"%$\"# \"\"# \"*N \"!.\u0155\"\"2\u01553\u0156+=$7\x81+3%.\\\"\"2\\3]+#%'#%$## \"$\"# \"\"# \"+#%'\"%$\"# \"\"# \"9*\" 3\u0188"),
          peg$decode("87\xA6*\x8B \"!.\u016D\"\"2\u016D3\u016E+& 4!6\u016F! %*t \"!.\u018E\"\"2\u018E3\u018F+-$7+#%'\"%$\"# \"\"# \"*S \"!.E\"\"2E3F+B$7x+8%.K\"\"2K3L+(%4#6\u011E#!!%$## \"$\"# \"\"# \"9*\" 3\u018D"),
          peg$decode("7\x80*\xA7 \"!.E\"\"2E3F+\x96$!7\x80+k$ &!.\u017B\"\"2\u017B3\u017C+-$7\x80+#%'\"%$\"# \"\"# \",>&!.\u017B\"\"2\u017B3\u017C+-$7\x80+#%'\"%$\"# \"\"# \"\"+#%'\"%$\"# \"\"# \"*# \" %+3%.K\"\"2K3L+#%'#%$## \"$\"# \"\"# \""),
          peg$decode("87\xA6*V \".\u016D\"\"2\u016D3\u016E*J \"!.\u0185\"\"2\u01853\u0186+9$7\xA6*) \".\u016D\"\"2\u016D3\u016E+#%'\"%$\"# \"\"# \"9*\" 3\u0190"),
          peg$decode("87\xB09*\" 3\u0191"),
          peg$decode("8!7\x86+' 4!6\u0193!! %*# \"7\x849*\" 3\u0192"),
          peg$decode("8!7\x87+' 4!6\u0195!! %*# \"7\x859*\" 3\u0194"),
          peg$decode("8! &7\xC0,#&7\xC0\"+v$.\u0197\"\"2\u01973\u0198+f% &7\xC0,#&7\xC0\"+T%7t+J%.\u0199\"\"2\u01993\u019A+:% &7\xC0,#&7\xC0\"+(%4&6\u019B&!\"%$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\u0196"),
          peg$decode("8! &7\xC0,#&7\xC0\"+\x88$.\u0197\"\"2\u01973\u0198+x% &7\xC0,#&7\xC0\"+f%7l+\\% &7\xC0,#&7\xC0\"+J%.\u0199\"\"2\u01993\u019A+:% &7\xC0,#&7\xC0\"+(%4'6\u019D'!#%$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\u019C"),
          peg$decode("8! &7\xC0,#&7\xC0\"+\x97$.E\"\"2E3F+\x87% &7\xC0,#&7\xC0\"+u% &7\x88+&$,#&7\x88\"\"\" \"+\\% &7\xC0,#&7\xC0\"+J%.K\"\"2K3L+:% &7\xC0,#&7\xC0\"+(%4'6\u019F'!#%$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\u019E"),
          peg$decode("8! &7\xC0,#&7\xC0\"+\x97$.E\"\"2E3F+\x87% &7\xC0,#&7\xC0\"+u% &7\x89+&$,#&7\x89\"\"\" \"+\\% &7\xC0,#&7\xC0\"+J%.K\"\"2K3L+:% &7\xC0,#&7\xC0\"+(%4'6\u019F'!#%$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\u01A0"),
          peg$decode("8!! &7\xC0,#&7\xC0\"+?$7\x8A+5% &7\xC0,#&7\xC0\"+#%'#%$## \"$\"# \"\"# \"*R \"! &7\xC0,#&7\xC0\"+?$7\x82+5% &7\xC0,#&7\xC0\"+#%'#%$## \"$\"# \"\"# \"+' 4!6\u01A2!! %9*\" 3\u01A1"),
          peg$decode("8!! &7\xC0,#&7\xC0\"+?$7\x8A+5% &7\xC0,#&7\xC0\"+#%'#%$## \"$\"# \"\"# \"*R \"! &7\xC0,#&7\xC0\"+?$7\x83+5% &7\xC0,#&7\xC0\"+#%'#%$## \"$\"# \"\"# \"+' 4!6\u01A2!! %9*\" 3\u01A3"),
          peg$decode("87\x8C*# \"7\x8D9*\" 3\u01A4"),
          peg$decode("87\x8C*# \"7\xA69*\" 3\u01A5"),
          peg$decode("8! &7\xC0,#&7\xC0\"+J$7\xAD*# \"7\xAE+:% &7\xC0,#&7\xC0\"+(%4#6\u01A7#!!%$## \"$\"# \"\"# \"9*\" 3\u01A6"),
          peg$decode("87\xA6*; \"7\x9F*5 \"7\xA0*/ \"7\xA4*) \"7\xA8*# \"7\xBF9*\" 3\u01A8"),
          peg$decode("87\x8F9*\" 3\u01A9"),
          peg$decode("8!7\x90+\xB9$ &! &7\xC0,#&7\xC0\"+O$.\u01AB\"\"2\u01AB3\u01AC+?% &7\xC0,#&7\xC0\"+-%7\x90+#%'$%$$# \"$## \"$\"# \"\"# \",b&! &7\xC0,#&7\xC0\"+O$.\u01AB\"\"2\u01AB3\u01AC+?% &7\xC0,#&7\xC0\"+-%7\x90+#%'$%$$# \"$## \"$\"# \"\"# \"\"+)%4\"6\u01AD\"\"! %$\"# \"\"# \"9*\" 3\u01AA"),
          peg$decode("8!7\x91+\xB9$ &! &7\xC0,#&7\xC0\"+O$.\u01AF\"\"2\u01AF3\u01B0+?% &7\xC0,#&7\xC0\"+-%7\x91+#%'$%$$# \"$## \"$\"# \"\"# \",b&! &7\xC0,#&7\xC0\"+O$.\u01AF\"\"2\u01AF3\u01B0+?% &7\xC0,#&7\xC0\"+-%7\x91+#%'$%$$# \"$## \"$\"# \"\"# \"\"+)%4\"6\u01B1\"\"! %$\"# \"\"# \"9*\" 3\u01AE"),
          peg$decode("87\x929*\" 3\u01B2"),
          peg$decode("8!7\x93+\u05EB$ &! &7\xC0,#&7\xC0\"+O$.\u01B4\"\"2\u01B43\u01B5+?% &7\xC0,#&7\xC0\"+-%7\x93+#%'$%$$# \"$## \"$\"# \"\"# \"*\u02B6 \"! &7\xC0,#&7\xC0\"+O$.\u01B6\"\"2\u01B63\u01B7+?% &7\xC0,#&7\xC0\"+-%7\x93+#%'$%$$# \"$## \"$\"# \"\"# \"*\u0271 \"! &7\xC0,#&7\xC0\"+O$.\u01B8\"\"2\u01B83\u01B9+?% &7\xC0,#&7\xC0\"+-%7\x93+#%'$%$$# \"$## \"$\"# \"\"# \"*\u022C \"! &7\xC0,#&7\xC0\"+O$.\u01BA\"\"2\u01BA3\u01BB+?% &7\xC0,#&7\xC0\"+-%7\x93+#%'$%$$# \"$## \"$\"# \"\"# \"*\u01E7 \"! &7\xC0,#&7\xC0\"+O$.\u01BC\"\"2\u01BC3\u01BD+?% &7\xC0,#&7\xC0\"+-%7\x93+#%'$%$$# \"$## \"$\"# \"\"# \"*\u01A2 \"! &7\xC0,#&7\xC0\"+O$.\u01BE\"\"2\u01BE3\u01BF+?% &7\xC0,#&7\xC0\"+-%7\x93+#%'$%$$# \"$## \"$\"# \"\"# \"*\u015D \"! &7\xC0,#&7\xC0\"+w$.\u01C0\"\"2\u01C03\u01C1*) \".\u01C2\"\"2\u01C23\u01C3+[%.\u01C4\"\"2\u01C43\u01C5*) \".\u01C6\"\"2\u01C63\u01C7+?% &7\xC0,#&7\xC0\"+-%7g+#%'%%$%# \"$$# \"$## \"$\"# \"\"# \"*\xF0 \"! &7\xC0,#&7\xC0\"+\xDD$.\u01C4\"\"2\u01C43\u01C5*) \".\u01C6\"\"2\u01C63\u01C7+\xC1%.\u01C8\"\"2\u01C83\u01C9*) \".\u01CA\"\"2\u01CA3\u01CB+\xA5%.\u01CC\"\"2\u01CC3\u01CD*) \".\u01CE\"\"2\u01CE3\u01CF+\x89% &7\xC0,#&7\xC0\"+w%.\u01C0\"\"2\u01C03\u01C1*) \".\u01C2\"\"2\u01C23\u01C3+[%.\u01C4\"\"2\u01C43\u01C5*) \".\u01C6\"\"2\u01C63\u01C7+?% &7\xC0,#&7\xC0\"+-%7g+#%')%$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \",\u02FB&! &7\xC0,#&7\xC0\"+O$.\u01B4\"\"2\u01B43\u01B5+?% &7\xC0,#&7\xC0\"+-%7\x93+#%'$%$$# \"$## \"$\"# \"\"# \"*\u02B6 \"! &7\xC0,#&7\xC0\"+O$.\u01B6\"\"2\u01B63\u01B7+?% &7\xC0,#&7\xC0\"+-%7\x93+#%'$%$$# \"$## \"$\"# \"\"# \"*\u0271 \"! &7\xC0,#&7\xC0\"+O$.\u01B8\"\"2\u01B83\u01B9+?% &7\xC0,#&7\xC0\"+-%7\x93+#%'$%$$# \"$## \"$\"# \"\"# \"*\u022C \"! &7\xC0,#&7\xC0\"+O$.\u01BA\"\"2\u01BA3\u01BB+?% &7\xC0,#&7\xC0\"+-%7\x93+#%'$%$$# \"$## \"$\"# \"\"# \"*\u01E7 \"! &7\xC0,#&7\xC0\"+O$.\u01BC\"\"2\u01BC3\u01BD+?% &7\xC0,#&7\xC0\"+-%7\x93+#%'$%$$# \"$## \"$\"# \"\"# \"*\u01A2 \"! &7\xC0,#&7\xC0\"+O$.\u01BE\"\"2\u01BE3\u01BF+?% &7\xC0,#&7\xC0\"+-%7\x93+#%'$%$$# \"$## \"$\"# \"\"# \"*\u015D \"! &7\xC0,#&7\xC0\"+w$.\u01C0\"\"2\u01C03\u01C1*) \".\u01C2\"\"2\u01C23\u01C3+[%.\u01C4\"\"2\u01C43\u01C5*) \".\u01C6\"\"2\u01C63\u01C7+?% &7\xC0,#&7\xC0\"+-%7g+#%'%%$%# \"$$# \"$## \"$\"# \"\"# \"*\xF0 \"! &7\xC0,#&7\xC0\"+\xDD$.\u01C4\"\"2\u01C43\u01C5*) \".\u01C6\"\"2\u01C63\u01C7+\xC1%.\u01C8\"\"2\u01C83\u01C9*) \".\u01CA\"\"2\u01CA3\u01CB+\xA5%.\u01CC\"\"2\u01CC3\u01CD*) \".\u01CE\"\"2\u01CE3\u01CF+\x89% &7\xC0,#&7\xC0\"+w%.\u01C0\"\"2\u01C03\u01C1*) \".\u01C2\"\"2\u01C23\u01C3+[%.\u01C4\"\"2\u01C43\u01C5*) \".\u01C6\"\"2\u01C63\u01C7+?% &7\xC0,#&7\xC0\"+-%7g+#%')%$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"\"+)%4\"6\u01D0\"\"! %$\"# \"\"# \"9*\" 3\u01B3"),
          peg$decode("87\x949*\" 3\u01D1"),
          peg$decode("8!7\x95+\u0299$ &! &7\xC0,#&7\xC0\"+O$.\u018B\"\"2\u018B3\u018C+?% &7\xC0,#&7\xC0\"+-%7\x95+#%'$%$$# \"$## \"$\"# \"\"# \"*\u010D \"! &7\xC0,#&7\xC0\"+O$.\u01D3\"\"2\u01D33\u01D4+?% &7\xC0,#&7\xC0\"+-%7\x95+#%'$%$$# \"$## \"$\"# \"\"# \"*\xC8 \"!7\xA3*# \"7\xA3+\xB7$! &7\xC0,#&7\xC0\"+O$.M\"\"2M3N+?% &7\xC0,#&7\xC0\"+-%7\x96+#%'$%$$# \"$## \"$\"# \"\"# \"*b \"! &7\xC0,#&7\xC0\"+O$.\u017F\"\"2\u017F3\u0180+?% &7\xC0,#&7\xC0\"+-%7\x96+#%'$%$$# \"$## \"$\"# \"\"# \"*# \" %+#%'\"%$\"# \"\"# \",\u0152&! &7\xC0,#&7\xC0\"+O$.\u018B\"\"2\u018B3\u018C+?% &7\xC0,#&7\xC0\"+-%7\x95+#%'$%$$# \"$## \"$\"# \"\"# \"*\u010D \"! &7\xC0,#&7\xC0\"+O$.\u01D3\"\"2\u01D33\u01D4+?% &7\xC0,#&7\xC0\"+-%7\x95+#%'$%$$# \"$## \"$\"# \"\"# \"*\xC8 \"!7\xA3*# \"7\xA3+\xB7$! &7\xC0,#&7\xC0\"+O$.M\"\"2M3N+?% &7\xC0,#&7\xC0\"+-%7\x96+#%'$%$$# \"$## \"$\"# \"\"# \"*b \"! &7\xC0,#&7\xC0\"+O$.\u017F\"\"2\u017F3\u0180+?% &7\xC0,#&7\xC0\"+-%7\x96+#%'$%$$# \"$## \"$\"# \"\"# \"*# \" %+#%'\"%$\"# \"\"# \"\"+)%4\"6\u01D5\"\"! %$\"# \"\"# \"9*\" 3\u01D2"),
          peg$decode("8!7\x96+\u0143$ &! &7\xC0,#&7\xC0\"+O$.M\"\"2M3N+?% &7\xC0,#&7\xC0\"+-%7\x96+#%'$%$$# \"$## \"$\"# \"\"# \"*b \"! &7\xC0,#&7\xC0\"+O$.\u017F\"\"2\u017F3\u0180+?% &7\xC0,#&7\xC0\"+-%7\x96+#%'$%$$# \"$## \"$\"# \"\"# \",\xA7&! &7\xC0,#&7\xC0\"+O$.M\"\"2M3N+?% &7\xC0,#&7\xC0\"+-%7\x96+#%'$%$$# \"$## \"$\"# \"\"# \"*b \"! &7\xC0,#&7\xC0\"+O$.\u017F\"\"2\u017F3\u0180+?% &7\xC0,#&7\xC0\"+-%7\x96+#%'$%$$# \"$## \"$\"# \"\"# \"\"+)%4\"6\u01D7\"\"! %$\"# \"\"# \"9*\" 3\u01D6"),
          peg$decode("8!.\u018E\"\"2\u018E3\u018F+D$ &7\xC0,#&7\xC0\"+2%7\x97+(%4#6\u01D9#! %$## \"$\"# \"\"# \"*\x93 \"!.\u018B\"\"2\u018B3\u018C+D$ &7\xC0,#&7\xC0\"+2%7\x97+(%4#6\u01DA#! %$## \"$\"# \"\"# \"*[ \"!.\u01D3\"\"2\u01D33\u01D4+D$ &7\xC0,#&7\xC0\"+2%7\x97+(%4#6\u01DB#! %$## \"$\"# \"\"# \"*# \"7\x979*\" 3\u01D8"),
          peg$decode("87\x98*w \"7\x99*q \"7\x9E*k \"!7\x9F+' 4!6\u01DD!! %*Y \"!7\xA0+' 4!6\u01DE!! %*G \"!7\xA4+' 4!6\u01DF!! %*5 \"7\x9D*/ \"!7\x8C+' 4!6\u01E0!! %9*\" 3\u01DC"),
          peg$decode("8!.E\"\"2E3F+f$ &7\xC0,#&7\xC0\"+T%7\x8E+J% &7\xC0,#&7\xC0\"+8%.K\"\"2K3L+(%4%6\u01E2%!\"%$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\u01E1"),
          peg$decode("8!.\u01E4\"\"2\u01E43\u01E5*) \".\u01E6\"\"2\u01E63\u01E7+\x88$ &7\xC0,#&7\xC0\"+v%.E\"\"2E3F+f% &7\xC0,#&7\xC0\"+T%7\x8E+J% &7\xC0,#&7\xC0\"+8%.K\"\"2K3L+(%4'6\u01E8'!\"%$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*\u0913 \"!.\u01E9\"\"2\u01E93\u01EA*) \".\u01EB\"\"2\u01EB3\u01EC+\x88$ &7\xC0,#&7\xC0\"+v%.E\"\"2E3F+f% &7\xC0,#&7\xC0\"+T%7\x8E+J% &7\xC0,#&7\xC0\"+8%.K\"\"2K3L+(%4'6\u01ED'!\"%$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*\u088B \"!.\u01EE\"\"2\u01EE3\u01EF*) \".\u01F0\"\"2\u01F03\u01F1+\xC7$ &7\xC0,#&7\xC0\"+\xB5%.E\"\"2E3F+\xA5% &7\xC0,#&7\xC0\"+\x93%7\x8E+\x89% &7\xC0,#&7\xC0\"+w%.\u0155\"\"2\u01553\u0156+g% &7\xC0,#&7\xC0\"+U%7\x8E+K% &7\xC0,#&7\xC0\"+9%.K\"\"2K3L+)%4+6\u01F2+\"&\"%$+# \"$*# \"$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*\u07C4 \"!.\u01F3\"\"2\u01F33\u01F4*) \".\u01F5\"\"2\u01F53\u01F6+\x88$ &7\xC0,#&7\xC0\"+v%.E\"\"2E3F+f% &7\xC0,#&7\xC0\"+T%7\x8E+J% &7\xC0,#&7\xC0\"+8%.K\"\"2K3L+(%4'6\u01F7'!\"%$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*\u073C \"!.\u01F8\"\"2\u01F83\u01F9*) \".\u01FA\"\"2\u01FA3\u01FB+\x88$ &7\xC0,#&7\xC0\"+v%.E\"\"2E3F+f% &7\xC0,#&7\xC0\"+T%7\x8C+J% &7\xC0,#&7\xC0\"+8%.K\"\"2K3L+(%4'6\u01FC'!\"%$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*\u06B4 \"!.\u01FD\"\"2\u01FD3\u01FE*) \".\u01FF\"\"2\u01FF3\u0200+\x88$ &7\xC0,#&7\xC0\"+v%.E\"\"2E3F+f% &7\xC0,#&7\xC0\"+T%7\x8E+J% &7\xC0,#&7\xC0\"+8%.K\"\"2K3L+(%4'6\u0201'!\"%$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*\u062C \"!.\u0202\"\"2\u02023\u0203*) \".\u0204\"\"2\u02043\u0205+\x88$ &7\xC0,#&7\xC0\"+v%.E\"\"2E3F+f% &7\xC0,#&7\xC0\"+T%7\x8E+J% &7\xC0,#&7\xC0\"+8%.K\"\"2K3L+(%4'6\u0206'!\"%$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*\u05A4 \"!.\u0207\"\"2\u02073\u0208*) \".\u0209\"\"2\u02093\u020A+\x99$ &7\xC0,#&7\xC0\"+\x87%!.E\"\"2E3F+a$ &7\xC0,#&7\xC0\"+O%7\x8E+E% &7\xC0,#&7\xC0\"+3%.K\"\"2K3L+#%'%%$%# \"$$# \"$## \"$\"# \"\"# \"*# \"7\xBF+(%4#6\u020B#! %$## \"$\"# \"\"# \"*\u050B \"!.\u020C\"\"2\u020C3\u020D*) \".\u020E\"\"2\u020E3\u020F+D$ &7\xC0,#&7\xC0\"+2%7g+(%4#6\u0210#! %$## \"$\"# \"\"# \"*\u04C7 \"!.\u0211\"\"2\u02113\u0212*) \".\u0213\"\"2\u02133\u0214+\u0106$ &7\xC0,#&7\xC0\"+\xF4%.E\"\"2E3F+\xE4% &7\xC0,#&7\xC0\"+\xD2%7\x8E+\xC8% &7\xC0,#&7\xC0\"+\xB6%.\u0155\"\"2\u01553\u0156+\xA6% &7\xC0,#&7\xC0\"+\x94%7\x8E+\x8A% &7\xC0,#&7\xC0\"+x%.\u0155\"\"2\u01553\u0156+h% &7\xC0,#&7\xC0\"+V%7\x8E+L% &7\xC0,#&7\xC0\"+:%.K\"\"2K3L+*%4/6\u0215/#*&\"%$/# \"$.# \"$-# \"$,# \"$+# \"$*# \"$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*\u03C1 \"!.\u0216\"\"2\u02163\u0217*) \".\u0218\"\"2\u02183\u0219+\x88$ &7\xC0,#&7\xC0\"+v%.E\"\"2E3F+f% &7\xC0,#&7\xC0\"+T%7\x8E+J% &7\xC0,#&7\xC0\"+8%.K\"\"2K3L+(%4'6\u021A'!\"%$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*\u0339 \"!.\u021B\"\"2\u021B3\u021C*) \".\u021D\"\"2\u021D3\u021E+\x88$ &7\xC0,#&7\xC0\"+v%.E\"\"2E3F+f% &7\xC0,#&7\xC0\"+T%7\x8E+J% &7\xC0,#&7\xC0\"+8%.K\"\"2K3L+(%4'6\u021F'!\"%$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*\u02B1 \"!.\u0220\"\"2\u02203\u0221*) \".\u0222\"\"2\u02223\u0223+\xC7$ &7\xC0,#&7\xC0\"+\xB5%.E\"\"2E3F+\xA5% &7\xC0,#&7\xC0\"+\x93%7\x8E+\x89% &7\xC0,#&7\xC0\"+w%.\u0155\"\"2\u01553\u0156+g% &7\xC0,#&7\xC0\"+U%7\x8E+K% &7\xC0,#&7\xC0\"+9%.K\"\"2K3L+)%4+6\u0224+\"&\"%$+# \"$*# \"$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*\u01EA \"!.\u0225\"\"2\u02253\u0226*A \".\u0227\"\"2\u02273\u0228*5 \".\u0229\"\"2\u02293\u022A*) \".\u022B\"\"2\u022B3\u022C+\x88$ &7\xC0,#&7\xC0\"+v%.E\"\"2E3F+f% &7\xC0,#&7\xC0\"+T%7\x8E+J% &7\xC0,#&7\xC0\"+8%.K\"\"2K3L+(%4'6\u022D'!\"%$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*\u014A \"!.\u022E\"\"2\u022E3\u022F*) \".\u0230\"\"2\u02303\u0231+\u011B$ &0\u0232\"\"1!3\u0233+,$,)&0\u0232\"\"1!3\u0233\"\"\" \"+\xF6% &7\xC0,#&7\xC0\"+\xE4%.E\"\"2E3F+\xD4% &! &7\xC0,#&7\xC0\"+=$7\x8E+3%.\u0155\"\"2\u01553\u0156+#%'#%$## \"$\"# \"\"# \",P&! &7\xC0,#&7\xC0\"+=$7\x8E+3%.\u0155\"\"2\u01553\u0156+#%'#%$## \"$\"# \"\"# \"\"+h% &7\xC0,#&7\xC0\"+V%7\x8E+L% &7\xC0,#&7\xC0\"+:%.K\"\"2K3L+*%4)6\u0234)#'$\"%$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*/ \"7\x9A*) \"7\x9B*# \"7\x9C9*\" 3\u01E3"),
          peg$decode("8!.\u0236\"\"2\u02363\u0237*) \".\u0238\"\"2\u02383\u0239+\u0117$ &7\xC0,#&7\xC0\"+\u0105%.E\"\"2E3F+\xF5% &7\xC0,#&7\xC0\"+\xE3%7\x8E+\xD9% &7\xC0,#&7\xC0\"+\xC7%.\u0155\"\"2\u01553\u0156+\xB7% &7\xC0,#&7\xC0\"+\xA5%7\x8E+\x9B% &7\xC0,#&7\xC0\"+\x89%!.\u0155\"\"2\u01553\u0156+?$ &7\xC0,#&7\xC0\"+-%7\x8E+#%'#%$## \"$\"# \"\"# \"*# \" %+L% &7\xC0,#&7\xC0\"+:%.K\"\"2K3L+*%4-6\u023A-#($\"%$-# \"$,# \"$+# \"$*# \"$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\u0235"),
          peg$decode("8!.\u023C\"\"2\u023C3\u023D*) \".\u023E\"\"2\u023E3\u023F+D$ &7\xC0,#&7\xC0\"+2%7T+(%4#6\u0240#! %$## \"$\"# \"\"# \"9*\" 3\u023B"),
          peg$decode("8!.\u0242\"\"2\u02423\u0243*) \".\u0244\"\"2\u02443\u0245+r$ &7\xC0,#&7\xC0\"+`%.\u023C\"\"2\u023C3\u023D*) \".\u023E\"\"2\u023E3\u023F+D% &7\xC0,#&7\xC0\"+2%7T+(%4%6\u0246%! %$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\u0241"),
          peg$decode("8!.\u0248\"\"2\u02483\u0249*) \".\u024A\"\"2\u024A3\u024B+\xDB$ &7\xC0,#&7\xC0\"+\xC9%.E\"\"2E3F+\xB9% &7\xC0,#&7\xC0\"+\xA7%.=\"\"2=3>*) \".?\"\"2?3@*# \" %+\x85% &7\xC0,#&7\xC0\"+s%.M\"\"2M3N*# \"7\x8E+]% &7\xC0,#&7\xC0\"+K%.K\"\"2K3L+;% &7\xC0,#&7\xC0\"+)%4*6\u024C*\"%#%$*# \"$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*\u04AA \"!.\u024D\"\"2\u024D3\u024E*) \".\u024F\"\"2\u024F3\u0250+\u0151$ &7\xC0,#&7\xC0\"+\u013F%.E\"\"2E3F+\u012F% &7\xC0,#&7\xC0\"+\u011D%.=\"\"2=3>*) \".?\"\"2?3@*# \" %+\xFB% &7\xC0,#&7\xC0\"+\xE9%7\x8E+\xDF%!.\xBB\"\"2\xBB3\xBC+\x95$ &7\xC0,#&7\xC0\"+\x83%.\u0251\"\"2\u02513\u0252+s% &7\xC0,#&7\xC0\"+a%.\u01B4\"\"2\u01B43\u01B5+Q% &7\xC0,#&7\xC0\"+?%7\xA5+5% &7\xC0,#&7\xC0\"+#%'(%$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*# \" %+L%.K\"\"2K3L+<% &7\xC0,#&7\xC0\"+*%4*6\u0253*#%#\"%$*# \"$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*\u0359 \"!.\u0254\"\"2\u02543\u0255*) \".\u0256\"\"2\u02563\u0257+\xCF$ &7\xC0,#&7\xC0\"+\xBD%.E\"\"2E3F+\xAD% &7\xC0,#&7\xC0\"+\x9B%.=\"\"2=3>*) \".?\"\"2?3@*# \" %+y% &7\xC0,#&7\xC0\"+g%7\x8E+]% &7\xC0,#&7\xC0\"+K%.K\"\"2K3L+;% &7\xC0,#&7\xC0\"+)%4*6\u0258*\"%#%$*# \"$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*\u028A \"!.\u0259\"\"2\u02593\u025A*) \".\u025B\"\"2\u025B3\u025C+\xCF$ &7\xC0,#&7\xC0\"+\xBD%.E\"\"2E3F+\xAD% &7\xC0,#&7\xC0\"+\x9B%.=\"\"2=3>*) \".?\"\"2?3@*# \" %+y% &7\xC0,#&7\xC0\"+g%7\x8E+]% &7\xC0,#&7\xC0\"+K%.K\"\"2K3L+;% &7\xC0,#&7\xC0\"+)%4*6\u025D*\"%#%$*# \"$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*\u01BB \"!.\u025E\"\"2\u025E3\u025F*) \".\u0260\"\"2\u02603\u0261+\xCF$ &7\xC0,#&7\xC0\"+\xBD%.E\"\"2E3F+\xAD% &7\xC0,#&7\xC0\"+\x9B%.=\"\"2=3>*) \".?\"\"2?3@*# \" %+y% &7\xC0,#&7\xC0\"+g%7\x8E+]% &7\xC0,#&7\xC0\"+K%.K\"\"2K3L+;% &7\xC0,#&7\xC0\"+)%4*6\u0262*\"%#%$*# \"$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"*\xEC \"!.\u0263\"\"2\u02633\u0264*) \".\u0265\"\"2\u02653\u0266+\xCF$ &7\xC0,#&7\xC0\"+\xBD%.E\"\"2E3F+\xAD% &7\xC0,#&7\xC0\"+\x9B%.=\"\"2=3>*) \".?\"\"2?3@*# \" %+y% &7\xC0,#&7\xC0\"+g%7\x8E+]% &7\xC0,#&7\xC0\"+K%.K\"\"2K3L+;% &7\xC0,#&7\xC0\"+)%4*6\u0267*\"%#%$*# \"$)# \"$(# \"$'# \"$&# \"$%# \"$$# \"$## \"$\"# \"\"# \"9*\" 3\u0247"),
          peg$decode("8!7\xA6+9$7f*# \" %+)%4\"6\u0269\"\"! %$\"# \"\"# \"9*\" 3\u0268"),
          peg$decode("8!7\xA5+Z$7\xAF*> \"!.\u026B\"\"2\u026B3\u026C+-$7\xA6+#%'\"%$\"# \"\"# \"*# \" %+)%4\"6\u026D\"\"! %$\"# \"\"# \"9*\" 3\u026A"),
          peg$decode("87\xA1*) \"7\xA2*# \"7\xA39*\" 3\u026E"),
          peg$decode("87\xB2*) \"7\xB1*# \"7\xB09*\" 3\u026F"),
          peg$decode("87\xB5*) \"7\xB4*# \"7\xB39*\" 3\u0270"),
          peg$decode("87\xB8*) \"7\xB7*# \"7\xB69*\" 3\u0271"),
          peg$decode("8!.\u0273\"\"2\u02733\u0274*) \".\u0275\"\"2\u02753\u0276+& 4!6\u0277! %*@ \"!.\u0278\"\"2\u02783\u0279*) \".\u027A\"\"2\u027A3\u027B+& 4!6\u027C! %9*\" 3\u0272"),
          peg$decode("8!7\xBC+' 4!6\u027E!! %*S \"!7\xBD+' 4!6\u027E!! %*A \"!7\xBA+' 4!6\u027E!! %*/ \"!7\xBB+' 4!6\u027E!! %9*\" 3\u027D"),
          peg$decode("8!7\xA9+' 4!6\u0280!! %*/ \"!7\xA7+' 4!6\u0281!! %9*\" 3\u027F"),
          peg$decode("8!7\xAB+' 4!6\u0283!! %*/ \"!7\xAA+' 4!6\u0284!! %9*\" 3\u0282"),
          peg$decode("8!7\xAC+' 4!6\u0286!! %*. \"!7\xC2+& 4!6\u0287! %9*\" 3\u0285"),
          peg$decode("8!.\u01B8\"\"2\u01B83\u01B9+V$ &0\u0289\"\"1!3\u028A,)&0\u0289\"\"1!3\u028A\"+8%.\u01BA\"\"2\u01BA3\u01BB+(%4#6\u028B#!!%$## \"$\"# \"\"# \"9*\" 3\u0288"),
          peg$decode("8!7\xC7*# \" %+8$.\u028D\"\"2\u028D3\u028E+(%4\"6\u0281\"!!%$\"# \"\"# \"9*\" 3\u028C"),
          peg$decode("8!7\xAA+3$7\xC8+)%4\"6\u0290\"\"! %$\"# \"\"# \"9*\" 3\u028F"),
          peg$decode("8!.\u0292\"\"2\u02923\u0293+2$7\xC8+(%4\"6\u0294\"! %$\"# \"\"# \"9*\" 3\u0291"),
          peg$decode("8!.\u0189\"\"2\u01893\u018A+2$7\xC5+(%4\"6\u0296\"! %$\"# \"\"# \"9*\" 3\u0295"),
          peg$decode("8!.\u0298\"\"2\u02983\u0299+2$7\xC5+(%4\"6\u0296\"! %$\"# \"\"# \"9*\" 3\u0297"),
          peg$decode("8!.\u029B\"\"2\u029B3\u029C+\xCC$ &0\u029D\"\"1!3\u029E+,$,)&0\u029D\"\"1!3\u029E\"\"\" \"+\xA7% &!.\u01D3\"\"2\u01D33\u01D4+H$ &0\u029F\"\"1!3\u02A0+,$,)&0\u029F\"\"1!3\u02A0\"\"\" \"+#%'\"%$\"# \"\"# \",Y&!.\u01D3\"\"2\u01D33\u01D4+H$ &0\u029F\"\"1!3\u02A0+,$,)&0\u029F\"\"1!3\u02A0\"\"\" \"+#%'\"%$\"# \"\"# \"\"+)%4#6\u02A1#\"! %$## \"$\"# \"\"# \"9*\" 3\u029A"),
          peg$decode("8! &0\u02A3\"\"1!3\u02A4+,$,)&0\u02A3\"\"1!3\u02A4\"\"\" \"+' 4!6\u02A5!! %9*\" 3\u02A2"),
          peg$decode("8! &0\u02A3\"\"1!3\u02A4+,$,)&0\u02A3\"\"1!3\u02A4\"\"\" \"+X$.\u0116\"\"2\u01163\u0117+H% &0\u02A3\"\"1!3\u02A4,)&0\u02A3\"\"1!3\u02A4\"+*%4#6\u02A7##\"! %$## \"$\"# \"\"# \"*_ \"!.\u0116\"\"2\u01163\u0117+N$ &0\u02A3\"\"1!3\u02A4+,$,)&0\u02A3\"\"1!3\u02A4\"\"\" \"+)%4\"6\u02A8\"\"! %$\"# \"\"# \"9*\" 3\u02A6"),
          peg$decode("8! &0\u02A3\"\"1!3\u02A4+,$,)&0\u02A3\"\"1!3\u02A4\"\"\" \"+c$.\u0116\"\"2\u01163\u0117+S% &0\u02A3\"\"1!3\u02A4,)&0\u02A3\"\"1!3\u02A4\"+5%7\xB9++%4$6\u02AA$$#\"! %$$# \"$## \"$\"# \"\"# \"*\xA6 \"!.\u0116\"\"2\u01163\u0117+Y$ &0\u02A3\"\"1!3\u02A4+,$,)&0\u02A3\"\"1!3\u02A4\"\"\" \"+4%7\xB9+*%4#6\u02AB##\"! %$## \"$\"# \"\"# \"*Y \"! &0\u02A3\"\"1!3\u02A4+,$,)&0\u02A3\"\"1!3\u02A4\"\"\" \"+3$7\xB9+)%4\"6\u02AC\"\"! %$\"# \"\"# \"9*\" 3\u02A9"),
          peg$decode("8!.\u018B\"\"2\u018B3\u018C+2$7\xB0+(%4\"6\u02AE\"! %$\"# \"\"# \"9*\" 3\u02AD"),
          peg$decode("8!.\u018B\"\"2\u018B3\u018C+2$7\xB1+(%4\"6\u02B0\"! %$\"# \"\"# \"9*\" 3\u02AF"),
          peg$decode("8!.\u018B\"\"2\u018B3\u018C+2$7\xB2+(%4\"6\u02B0\"! %$\"# \"\"# \"9*\" 3\u02B1"),
          peg$decode("8!.\u01D3\"\"2\u01D33\u01D4+2$7\xB0+(%4\"6\u02B3\"! %$\"# \"\"# \"9*\" 3\u02B2"),
          peg$decode("8!.\u01D3\"\"2\u01D33\u01D4+2$7\xB1+(%4\"6\u02B3\"! %$\"# \"\"# \"9*\" 3\u02B4"),
          peg$decode("8!.\u01D3\"\"2\u01D33\u01D4+2$7\xB2+(%4\"6\u02B3\"! %$\"# \"\"# \"9*\" 3\u02B5"),
          peg$decode("8!0\u02B7\"\"1!3\u02B8+e$0\u02B9\"\"1!3\u02BA*# \" %+O% &0\u02A3\"\"1!3\u02A4+,$,)&0\u02A3\"\"1!3\u02A4\"\"\" \"+*%4#6\u02BB##\"! %$## \"$\"# \"\"# \"9*\" 3\u02B6"),
          peg$decode("8!.\u02BD\"\"2\u02BD3\u02BE+b$ &0\u02BF\"\"1!3\u02C0*# \"7\xBE,/&0\u02BF\"\"1!3\u02C0*# \"7\xBE\"+8%.\u02BD\"\"2\u02BD3\u02BE+(%4#6\u02C1#!!%$## \"$\"# \"\"# \"9*\" 3\u02BC"),
          peg$decode("8!.\u02C3\"\"2\u02C33\u02C4+b$ &0\u02C5\"\"1!3\u02C6*# \"7\xBE,/&0\u02C5\"\"1!3\u02C6*# \"7\xBE\"+8%.\u02C3\"\"2\u02C33\u02C4+(%4#6\u02C1#!!%$## \"$\"# \"\"# \"9*\" 3\u02C2"),
          peg$decode("8!.\u02C8\"\"2\u02C83\u02C9+b$ &0\u02CA\"\"1!3\u02CB*# \"7\xBE,/&0\u02CA\"\"1!3\u02CB*# \"7\xBE\"+8%.\u02C8\"\"2\u02C83\u02C9+(%4#6\u02C1#!!%$## \"$\"# \"\"# \"9*\" 3\u02C7"),
          peg$decode("8!.\u02CD\"\"2\u02CD3\u02CE+b$ &0\u02CF\"\"1!3\u02D0*# \"7\xBE,/&0\u02CF\"\"1!3\u02D0*# \"7\xBE\"+8%.\u02CD\"\"2\u02CD3\u02CE+(%4#6\u02C1#!!%$## \"$\"# \"\"# \"9*\" 3\u02CC"),
          peg$decode("8!.\u02D2\"\"2\u02D23\u02D3+3$0\u02D4\"\"1!3\u02D5+#%'\"%$\"# \"\"# \"9*\" 3\u02D1"),
          peg$decode("8!.E\"\"2E3F+I$ &7\xC0,#&7\xC0\"+7%.K\"\"2K3L+'%4#6\u02D7# %$## \"$\"# \"\"# \"9*\" 3\u02D6"),
          peg$decode("80\u02D9\"\"1!3\u02DA*G \"0\u02DB\"\"1!3\u02DC*; \"0\u02DD\"\"1!3\u02DE*/ \"0\u02DF\"\"1!3\u02E0*# \"7\xC19*\" 3\u02D8"),
          peg$decode("8!.\u02E2\"\"2\u02E23\u02E3+A$ &0\u02E4\"\"1!3\u02E5,)&0\u02E4\"\"1!3\u02E5\"+#%'\"%$\"# \"\"# \"9*\" 3\u02E1"),
          peg$decode("8!.\u0197\"\"2\u01973\u0198+E$ &7\xC0,#&7\xC0\"+3%.\u0199\"\"2\u01993\u019A+#%'#%$## \"$\"# \"\"# \"9*\" 3\u02E6"),
          peg$decode("80\u02E8\"\"1!3\u02E9*\xB9 \"0\u02EA\"\"1!3\u02EB*\xAD \"0\u02EC\"\"1!3\u02ED*\xA1 \"0\u02EE\"\"1!3\u02EF*\x95 \"0\u02F0\"\"1!3\u02F1*\x89 \"0\u02F2\"\"1!3\u02F3*} \"0\u02F4\"\"1!3\u02F5*q \"0\u02F6\"\"1!3\u02F7*e \"0\u02F8\"\"1!3\u02F9*Y \"0\u02FA\"\"1!3\u02FB*M \"0\u02FC\"\"1!3\u02FD*A \"0\u02FE\"\"1!3\u02FF*5 \"0\u0300\"\"1!3\u0301*) \"0\u0302\"\"1!3\u03039*\" 3\u02E7"),
          peg$decode("87\xC3*) \".\u0305\"\"2\u03053\u03069*\" 3\u0304"),
          peg$decode("8!7\xC4*) \"0\u02A3\"\"1!3\u02A4+\x9B$ &7\xC4*M \"0\u02A3\"\"1!3\u02A4*A \"0\u0308\"\"1!3\u0309*5 \"0\u030A\"\"1!3\u030B*) \"0\u030C\"\"1!3\u030D,S&7\xC4*M \"0\u02A3\"\"1!3\u02A4*A \"0\u0308\"\"1!3\u0309*5 \"0\u030A\"\"1!3\u030B*) \"0\u030C\"\"1!3\u030D\"+)%4\"6\u030E\"\"! %$\"# \"\"# \"9*\" 3\u0307"),
          peg$decode("87\xC4*Y \".\u01D3\"\"2\u01D33\u01D4*M \"0\u02A3\"\"1!3\u02A4*A \"0\u0308\"\"1!3\u0309*5 \"0\u030A\"\"1!3\u030B*) \"0\u030C\"\"1!3\u030D9*\" 3\u030F"),
          peg$decode("8!7\xC3+S$ &7\xC6*) \".\u0116\"\"2\u01163\u0117,/&7\xC6*) \".\u0116\"\"2\u01163\u0117\"+)%4\"6\u0311\"\"! %$\"# \"\"# \"9*\" 3\u0310"),
          peg$decode("8!7\xC4*; \"0\u02A3\"\"1!3\u02A4*/ \".\u028D\"\"2\u028D3\u028E*# \"7\xC9+w$ &7\xC6*; \".\u0116\"\"2\u01163\u0117*/ \".\u028D\"\"2\u028D3\u028E*# \"7\xC9,A&7\xC6*; \".\u0116\"\"2\u01163\u0117*/ \".\u028D\"\"2\u028D3\u028E*# \"7\xC9\"+)%4\"6\u0313\"\"! %$\"# \"\"# \"9*\" 3\u0312"),
          peg$decode("87\xCA*# \"7\xCC9*\" 3\u0314"),
          peg$decode("8!!.\u0316\"\"2\u03163\u0317+7$7\xCB+-%7\xCB+#%'#%$## \"$\"# \"\"# \"+' 4!6\u0318!! %9*\" 3\u0315"),
          peg$decode("80\u02A3\"\"1!3\u02A4*5 \"0\u031A\"\"1!3\u031B*) \"0\u031C\"\"1!3\u031D9*\" 3\u0319"),
          peg$decode("8!.\u02D2\"\"2\u02D23\u02D3+\u0128$.\u0305\"\"2\u03053\u0306*\u010D \".\u031F\"\"2\u031F3\u0320*\u0101 \".\u0116\"\"2\u01163\u0117*\xF5 \".\u01D3\"\"2\u01D33\u01D4*\xE9 \".\u018E\"\"2\u018E3\u018F*\xDD \".\u0298\"\"2\u02983\u0299*\xD1 \".\u0321\"\"2\u03213\u0322*\xC5 \".\u02BD\"\"2\u02BD3\u02BE*\xB9 \".E\"\"2E3F*\xAD \".K\"\"2K3L*\xA1 \".M\"\"2M3N*\x95 \".\u018B\"\"2\u018B3\u018C*\x89 \".\u0155\"\"2\u01553\u0156*} \".\xBB\"\"2\xBB3\xBC*q \".\u028D\"\"2\u028D3\u028E*e \".\u01B4\"\"2\u01B43\u01B5*Y \".\u017F\"\"2\u017F3\u0180*M \".\u0189\"\"2\u01893\u018A*A \".\u02E2\"\"2\u02E23\u02E3*5 \".\u029B\"\"2\u029B3\u029C*) \".\u0316\"\"2\u03163\u0317+(%4\"6\u0323\"! %$\"# \"\"# \"9*\" 3\u031E")
        ],

        peg$currPos          = 0,
        peg$reportedPos      = 0,
        peg$cachedPos        = 0,
        peg$cachedPosDetails = { line: 1, column: 1, seenCR: false },
        peg$maxFailPos       = 0,
        peg$maxFailExpected  = [],
        peg$silentFails      = 0,

        peg$result;

    if ("startRule" in options) {
      if (!(options.startRule in peg$startRuleIndices)) {
        throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
      }

      peg$startRuleIndex = peg$startRuleIndices[options.startRule];
    }

    function text() {
      return input.substring(peg$reportedPos, peg$currPos);
    }

    function offset() {
      return peg$reportedPos;
    }

    function line() {
      return peg$computePosDetails(peg$reportedPos).line;
    }

    function column() {
      return peg$computePosDetails(peg$reportedPos).column;
    }

    function expected(description) {
      throw peg$buildException(
        null,
        [{ type: "other", description: description }],
        peg$reportedPos
      );
    }

    function error(message) {
      throw peg$buildException(message, null, peg$reportedPos);
    }

    function peg$computePosDetails(pos) {
      function advance(details, startPos, endPos) {
        var p, ch;

        for (p = startPos; p < endPos; p++) {
          ch = input.charAt(p);
          if (ch === "\n") {
            if (!details.seenCR) { details.line++; }
            details.column = 1;
            details.seenCR = false;
          } else if (ch === "\r" || ch === "\u2028" || ch === "\u2029") {
            details.line++;
            details.column = 1;
            details.seenCR = true;
          } else {
            details.column++;
            details.seenCR = false;
          }
        }
      }

      if (peg$cachedPos !== pos) {
        if (peg$cachedPos > pos) {
          peg$cachedPos = 0;
          peg$cachedPosDetails = { line: 1, column: 1, seenCR: false };
        }
        advance(peg$cachedPosDetails, peg$cachedPos, pos);
        peg$cachedPos = pos;
      }

      return peg$cachedPosDetails;
    }

    function peg$fail(expected) {
      if (peg$currPos < peg$maxFailPos) { return; }

      if (peg$currPos > peg$maxFailPos) {
        peg$maxFailPos = peg$currPos;
        peg$maxFailExpected = [];
      }

      peg$maxFailExpected.push(expected);
    }

    function peg$buildException(message, expected, pos) {
      function cleanupExpected(expected) {
        var i = 1;

        expected.sort(function(a, b) {
          if (a.description < b.description) {
            return -1;
          } else if (a.description > b.description) {
            return 1;
          } else {
            return 0;
          }
        });

        while (i < expected.length) {
          if (expected[i - 1] === expected[i]) {
            expected.splice(i, 1);
          } else {
            i++;
          }
        }
      }

      function buildMessage(expected, found) {
        function stringEscape(s) {
          function hex(ch) { return ch.charCodeAt(0).toString(16).toUpperCase(); }

          return s
            .replace(/\\/g,   '\\\\')
            .replace(/"/g,    '\\"')
            .replace(/\x08/g, '\\b')
            .replace(/\t/g,   '\\t')
            .replace(/\n/g,   '\\n')
            .replace(/\f/g,   '\\f')
            .replace(/\r/g,   '\\r')
            .replace(/[\x00-\x07\x0B\x0E\x0F]/g, function(ch) { return '\\x0' + hex(ch); })
            .replace(/[\x10-\x1F\x80-\xFF]/g,    function(ch) { return '\\x'  + hex(ch); })
            .replace(/[\u0180-\u0FFF]/g,         function(ch) { return '\\u0' + hex(ch); })
            .replace(/[\u1080-\uFFFF]/g,         function(ch) { return '\\u'  + hex(ch); });
        }

        var expectedDescs = new Array(expected.length),
            expectedDesc, foundDesc, i;

        for (i = 0; i < expected.length; i++) {
          expectedDescs[i] = expected[i].description;
        }

        expectedDesc = expected.length > 1
          ? expectedDescs.slice(0, -1).join(", ")
              + " or "
              + expectedDescs[expected.length - 1]
          : expectedDescs[0];

        foundDesc = found ? "\"" + stringEscape(found) + "\"" : "end of input";

        return "Expected " + expectedDesc + " but " + foundDesc + " found.";
      }

      var posDetails = peg$computePosDetails(pos),
          found      = pos < input.length ? input.charAt(pos) : null;

      if (expected !== null) {
        cleanupExpected(expected);
      }

      return new SyntaxError(
        message !== null ? message : buildMessage(expected, found),
        expected,
        found,
        pos,
        posDetails.line,
        posDetails.column
      );
    }

    function peg$decode(s) {
      var bc = new Array(s.length), i;

      for (i = 0; i < s.length; i++) {
        bc[i] = s.charCodeAt(i) - 32;
      }

      return bc;
    }

    function peg$parseRule(index) {
      var bc    = peg$bytecode[index],
          ip    = 0,
          ips   = [],
          end   = bc.length,
          ends  = [],
          stack = [],
          params, i;

      function protect(object) {
        return Object.prototype.toString.apply(object) === "[object Array]" ? [] : object;
      }

      while (true) {
        while (ip < end) {
          switch (bc[ip]) {
            case 0:
              stack.push(protect(peg$consts[bc[ip + 1]]));
              ip += 2;
              break;

            case 1:
              stack.push(peg$currPos);
              ip++;
              break;

            case 2:
              stack.pop();
              ip++;
              break;

            case 3:
              peg$currPos = stack.pop();
              ip++;
              break;

            case 4:
              stack.length -= bc[ip + 1];
              ip += 2;
              break;

            case 5:
              stack.splice(-2, 1);
              ip++;
              break;

            case 6:
              stack[stack.length - 2].push(stack.pop());
              ip++;
              break;

            case 7:
              stack.push(stack.splice(stack.length - bc[ip + 1], bc[ip + 1]));
              ip += 2;
              break;

            case 8:
              stack.pop();
              stack.push(input.substring(stack[stack.length - 1], peg$currPos));
              ip++;
              break;

            case 9:
              ends.push(end);
              ips.push(ip + 3 + bc[ip + 1] + bc[ip + 2]);

              if (stack[stack.length - 1]) {
                end = ip + 3 + bc[ip + 1];
                ip += 3;
              } else {
                end = ip + 3 + bc[ip + 1] + bc[ip + 2];
                ip += 3 + bc[ip + 1];
              }

              break;

            case 10:
              ends.push(end);
              ips.push(ip + 3 + bc[ip + 1] + bc[ip + 2]);

              if (stack[stack.length - 1] === peg$FAILED) {
                end = ip + 3 + bc[ip + 1];
                ip += 3;
              } else {
                end = ip + 3 + bc[ip + 1] + bc[ip + 2];
                ip += 3 + bc[ip + 1];
              }

              break;

            case 11:
              ends.push(end);
              ips.push(ip + 3 + bc[ip + 1] + bc[ip + 2]);

              if (stack[stack.length - 1] !== peg$FAILED) {
                end = ip + 3 + bc[ip + 1];
                ip += 3;
              } else {
                end = ip + 3 + bc[ip + 1] + bc[ip + 2];
                ip += 3 + bc[ip + 1];
              }

              break;

            case 12:
              if (stack[stack.length - 1] !== peg$FAILED) {
                ends.push(end);
                ips.push(ip);

                end = ip + 2 + bc[ip + 1];
                ip += 2;
              } else {
                ip += 2 + bc[ip + 1];
              }

              break;

            case 13:
              ends.push(end);
              ips.push(ip + 3 + bc[ip + 1] + bc[ip + 2]);

              if (input.length > peg$currPos) {
                end = ip + 3 + bc[ip + 1];
                ip += 3;
              } else {
                end = ip + 3 + bc[ip + 1] + bc[ip + 2];
                ip += 3 + bc[ip + 1];
              }

              break;

            case 14:
              ends.push(end);
              ips.push(ip + 4 + bc[ip + 2] + bc[ip + 3]);

              if (input.substr(peg$currPos, peg$consts[bc[ip + 1]].length) === peg$consts[bc[ip + 1]]) {
                end = ip + 4 + bc[ip + 2];
                ip += 4;
              } else {
                end = ip + 4 + bc[ip + 2] + bc[ip + 3];
                ip += 4 + bc[ip + 2];
              }

              break;

            case 15:
              ends.push(end);
              ips.push(ip + 4 + bc[ip + 2] + bc[ip + 3]);

              if (input.substr(peg$currPos, peg$consts[bc[ip + 1]].length).toLowerCase() === peg$consts[bc[ip + 1]]) {
                end = ip + 4 + bc[ip + 2];
                ip += 4;
              } else {
                end = ip + 4 + bc[ip + 2] + bc[ip + 3];
                ip += 4 + bc[ip + 2];
              }

              break;

            case 16:
              ends.push(end);
              ips.push(ip + 4 + bc[ip + 2] + bc[ip + 3]);

              if (peg$consts[bc[ip + 1]].test(input.charAt(peg$currPos))) {
                end = ip + 4 + bc[ip + 2];
                ip += 4;
              } else {
                end = ip + 4 + bc[ip + 2] + bc[ip + 3];
                ip += 4 + bc[ip + 2];
              }

              break;

            case 17:
              stack.push(input.substr(peg$currPos, bc[ip + 1]));
              peg$currPos += bc[ip + 1];
              ip += 2;
              break;

            case 18:
              stack.push(peg$consts[bc[ip + 1]]);
              peg$currPos += peg$consts[bc[ip + 1]].length;
              ip += 2;
              break;

            case 19:
              stack.push(peg$FAILED);
              if (peg$silentFails === 0) {
                peg$fail(peg$consts[bc[ip + 1]]);
              }
              ip += 2;
              break;

            case 20:
              peg$reportedPos = stack[stack.length - 1 - bc[ip + 1]];
              ip += 2;
              break;

            case 21:
              peg$reportedPos = peg$currPos;
              ip++;
              break;

            case 22:
              params = bc.slice(ip + 4, ip + 4 + bc[ip + 3]);
              for (i = 0; i < bc[ip + 3]; i++) {
                params[i] = stack[stack.length - 1 - params[i]];
              }

              stack.splice(
                stack.length - bc[ip + 2],
                bc[ip + 2],
                peg$consts[bc[ip + 1]].apply(null, params)
              );

              ip += 4 + bc[ip + 3];
              break;

            case 23:
              stack.push(peg$parseRule(bc[ip + 1]));
              ip += 2;
              break;

            case 24:
              peg$silentFails++;
              ip++;
              break;

            case 25:
              peg$silentFails--;
              ip++;
              break;

            default:
              throw new Error("Invalid opcode: " + bc[ip] + ".");
          }
        }

        if (ends.length > 0) {
          end = ends.pop();
          ip = ips.pop();
        } else {
          break;
        }
      }

      return stack[0];
    }


        var flattenString = function(arrs) {
            var acum ="";
            for(var i=0; i< arrs.length; i++) {
              if(typeof(arrs[i])==='string') {
                acum = acum + arrs[i];
              } else {
                acum = acum + arrs[i].join('');
              }
            }

            return acum;
        }


        var GlobalBlankNodeCounter = 0;

        var prefixes = {};

        var registerPrefix = function(prefix, uri) {
            prefixes[prefix] = uri;
        }

        var registerDefaultPrefix = function(uri) {
            prefixes[null] = uri;
        }

        var arrayToString = function(array) {
            var tmp = "";
            if(array == null)
              return null;

            for(var i=0; i<array.length; i++) {
                tmp = tmp + array[i];
            }

            return tmp.toUpperCase();
        }


    peg$result = peg$parseRule(peg$startRuleIndex);

    if (peg$result !== peg$FAILED && peg$currPos === input.length) {
      return peg$result;
    } else {
      if (peg$result !== peg$FAILED && peg$currPos < input.length) {
        peg$fail({ type: "end", description: "end of input" });
      }

      throw peg$buildException(null, peg$maxFailExpected, peg$maxFailPos);
    }
  }

  return {
    SyntaxError: SyntaxError,
    parse:       parse
  };
})()
},{}],45:[function(_dereq_,module,exports){
var Tree = _dereq_('./btree').Tree;
var utils = _dereq_('./utils');
var async = utils;
var InMemoryLexicon = _dereq_('./lexicon').Lexicon;

/**
 * Temporal implementation of the lexicon
 */


Lexicon = function(callback, dbName){
    var that = this;

    utils.registerIndexedDB(that);

    this.defaultGraphOid = 0;
    this.defaultGraphUri = "https://github.com/antoniogarrote/rdfstore-js#default_graph";
    this.defaultGraphUriTerm = {"token":"uri","prefix":null,"suffix":null,"value":this.defaultGraphUri};
    this.oidCounter = 1;

    that.dbName = dbName || "rdfstorejs";
    var request = that.indexedDB.open(this.dbName+"_lexicon", 1);
    request.onerror = function(event) {
        callback(null,new Error("Error opening IndexedDB: " + event.target.errorCode));
    };
    request.onsuccess = function(event) {
        that.db = event.target.result;
        callback(that);
    };
    request.onupgradeneeded = function(event) {
        that.db = event.target.result;

        // graphs
        var graphStore = that.db.createObjectStore('knownGraphs', { keyPath: 'oid'});
        graphStore.createIndex("uriToken","uriToken",{unique: true});
        // uris mapping
        var uriStore = that.db.createObjectStore('uris', { keyPath: 'id', autoIncrement : true });
        uriStore.createIndex("uri","uri",{unique: true});
        // blanks mapping
        var blankStore = that.db.createObjectStore('blanks', { keyPath: 'id', autoIncrement : true });
        blankStore.createIndex("label","label",{unique: true});
        // literals mapping
        var literalStore = that.db.createObjectStore('literals', { keyPath: 'id', autoIncrement : true });
        literalStore.createIndex("literal","literal",{unique: true});

        //setTimeout(function(){ callback(that); },0);
    };

};

/**
 * Registers a new graph in the lexicon list of known graphs.
 * @param oid
 * @param uriToken
 * @param callback
 */
Lexicon.prototype.registerGraph = function(oid, uriToken, callback){
    if(oid != this.defaultGraphOid) {
        var transaction = this.db.transaction(['knownGraphs'], 'readwrite');
        transaction.onerror = function (event) {
            callback(null, new Error(event.target.statusCode));
        };
        var objectStore = transaction.objectStore('knownGraphs');
        var request = objectStore.add({oid: oid, uriToken: uriToken});
        request.onsuccess = function (event) {
            callback(true);
        };
    } else {
        callback();
    }
};

/**
 * Returns the list of known graphs OIDs or URIs.
 * @param returnUris
 * @param callback
 */
Lexicon.prototype.registeredGraphs = function(returnUris, callback) {
    var graphs = [];
    var objectStore = this.db.transaction(['knownGraphs'],'readwrite').objectStore("knownGraphs");

    var request = objectStore.openCursor();
    request.onsuccess = function(event) {
        var cursor = event.target.result;
        if(cursor) {
            if(returnUris === true) {
                graphs.push(cursor.value.uriToken);
            } else {
                graphs.push(cursor.value.oid);
            }
            cursor.continue();
        } else {
            callback(graphs);
        }
    };
    request.onerror = function(event) {
        callback(null,new Error("Error retrieving data from the cursor: " + event.target.errorCode));
    };
};

/**
 * Registers a URI in the lexicon. It returns the allocated OID for the URI.
 * As a side effect it increases the cost counter for that URI if it is already registered.
 * @param uri
 * @param callback
 * @returns URI's OID.
 */
Lexicon.prototype.registerUri = function(uri, callback) {
    var that = this;
    if(uri === this.defaultGraphUri) {
        callback(this.defaultGraphOid);
    } else{
        var objectStore = that.db.transaction(["uris"],"readwrite").objectStore("uris");
        var request = objectStore.index("uri").get(uri);
        request.onsuccess = function(event) {
            var uriData = event.target.result;
            if(uriData) {
                // found in index -> update
                uriData.counter++;
                var oid = uriData.id;
                var requestUpdate = objectStore.put(uriData);
                requestUpdate.onsuccess =function (event) {
                    callback(oid);
                };
                requestUpdate.onerror = function (event) {
                    callback(null, new Error("Error updating the URI data" + event.target.errorCode));
                };
            } else {
                // not found -> create
                var requestAdd = objectStore.add({uri: uri, counter:0});
                requestAdd.onsuccess = function(event){
                    callback(event.target.result);
                };
                requestAdd.onerror = function(event){
                    callback(null, new Error("Error inserting the URI data"+event.target.errorCode));
                };
            }
        };
        request.onerror = function(event) {
            callback(null, new Error("Error retrieving the URI data"+event.target.errorCode));
        };
    }
};

/**
 * Returns the OID associated to the URI.
 * If the URI hasn't been  associated in the lexicon, -1 is returned.
 * @param uri
 * @param callback
 */
Lexicon.prototype.resolveUri = function(uri,callback) {
    if(uri === this.defaultGraphUri) {
        callback(this.defaultGraphOid);
    } else {
        var objectStore = this.db.transaction(["uris"]).objectStore("uris");
        var request = objectStore.index("uri").get(uri);
        request.onsuccess = function(event) {
            if(event.target.result != null)
                callback(event.target.result.id);
            else
                callback(-1);
        };
        request.onerror = function(event) {
            callback(null, new Error("Error retrieving uri data "+event.target.errorCode));
        }
    }
};

/**
 * Returns the cost associated to the URI.
 * If the URI hasn't been associated in the lexicon, -1 is returned.
 * @param uri
 * @returns {*}
 */
Lexicon.prototype.resolveUriCost = function(uri, callback) {
    if(uri === this.defaultGraphUri) {
        callback(0);
    } else {
        var objectStore = that.db.transaction(["uris"]).objectStore("uris");
        var request = objectStore.index("uri").get(uri);
        request.onsuccess = function(event) {
            if(event.target.result != null)
                callback(event.target.result.cost);
            else
                callback(-1);
        };
        request.onerror = function(event) {
            callback(null, new Error("Error retrieving uri data "+event.target.errorCode));
        };
    }
};

/**
 * Register a new blank node in the lexicon.
 * @param label
 * @returns {string}
 */
Lexicon.prototype.registerBlank = function(callback) {
    var oidStr = guid();
    var that = this;

    var objectStore = that.db.transaction(["blanks"],"readwrite").objectStore("blanks");
    var requestAdd = objectStore.add({label: oidStr, counter:0});
    requestAdd.onsuccess = function(event){
        callback(event.target.result);
    };
    requestAdd.onerror = function(event){
        callback(null, new Error("Error inserting the URI data"+event.target.errorCode));
    };
};

/**
 * Resolves a blank node OID
 * @param oid
 * @param callback
 */
//Lexicon.prototype.resolveBlank = function(oid,callback) {
//    var that = this;
//    var objectStore = that.db.transaction(["blanks"]).objectStore("blanks");
//    var request = objectStore.get(oid);
//    request.onsuccess = function(event) {
//        if(event.target.result != null)
//            callback(event.target.result.id);
//        else {
//            // we register it if it doesn't exist
//        }
//    };
//    request.onerror = function(event) {
//        callback(null, new Error("Error retrieving blank data "+event.target.errorCode));
//    }
//
//    this.oidBlanks.search(label, function(oidData){
//        if(oidData != null) {
//            callback(oidData);
//        } else {
//            // ??
//            var oid = that.oidCounter;
//            this.oidCounter++;
//            callback(""+oid);
//            //
//        }
//    });
//};

/**
 * Blank nodes don't have an associated cost.
 * @param label
 * @param callback
 * @returns {number}
 */
Lexicon.prototype.resolveBlankCost = function(label, callback) {
    callback(0);
};

/**
 * Registers a new literal in the index.
 * @param literal
 * @param callback
 * @returns the OID of the newly registered literal
 */
Lexicon.prototype.registerLiteral = function(literal, callback) {
    var that = this;

    var objectStore = that.db.transaction(["literals"],"readwrite").objectStore("literals");
    var request = objectStore.index("literal").get(literal);
    request.onsuccess = function(event) {
        var literalData = event.target.result;
        if(literalData) {
            // found in index -> update
            literalData.counter++;
            var oid = literalData.id;
            var requestUpdate = objectStore.put(literalData);
            requestUpdate.onsuccess =function (event) {
                callback(oid);
            };
            requestUpdate.onerror = function (event) {
                callback(null, new Error("Error updating the literal data" + event.target.errorCode));
            };
        } else {
            // not found -> create
            var requestAdd = objectStore.add({literal: literal, counter:0});
            requestAdd.onsuccess = function(event){
                callback(event.target.result);
            };
            requestAdd.onerror =function(event){
                callback(null, new Error("Error inserting the literal data"+event.target.errorCode));
            };
        }
    };
    request.onerror = function(event) {
        callback(null, new Error("Error retrieving the literal data"+event.target.errorCode));
    };
};

/**
 * Returns the OID of the resolved literal or -1 if no literal is found.
 * @param literal
 * @param callback
 */
Lexicon.prototype.resolveLiteral = function (literal,callback) {
    var objectStore = that.db.transaction(["literals"]).objectStore("literals");
    var request = objectStore.index("literal").get(literal);
    request.onsuccess = function(event) {
        if(event.target.result != null)
            callback(event.target.result.id);
        else
            callback(-1);
    };
    request.onerror = function(event) {
        callback(null, new Error("Error retrieving literal data "+event.target.errorCode));
    }
};

/**
 * Returns the cost associated to the literal or -1 if no literal is found.
 * @param literal
 * @param callback
 */
Lexicon.prototype.resolveLiteralCost = function (literal,callback) {
    var objectStore = that.db.transaction(["literals"]).objectStore("literals");
    var request = objectStore.index("literal").get(literal);
    request.onsuccess = function(event) {
        if(event.target.result != null)
            callback(event.target.result.cost);
        else
            callback(-1);
    };
    request.onerror = function(event) {
        callback(null, new Error("Error retrieving literal data "+event.target.errorCode));
    };
};


/**
 * Transforms a literal string into a token object.
 * @param literalString
 * @returns A token object with the parsed literal.
 */
Lexicon.prototype.parseLiteral = function(literalString) {
    return InMemoryLexicon.prototype.parseLiteral(literalString);
};

/**
 * Parses a literal URI string into a token object
 * @param uriString
 * @returns A token object with the parsed URI.
 */
Lexicon.prototype.parseUri = function(uriString) {
    return InMemoryLexicon.prototype.parseUri(uriString);
};

/**
 * Retrieves a token containing the URI, literal or blank node associated
 * to the provided OID.
 * If no value is found, null is returned.
 * @param oid
 * @param callback
 * @returns parsed token or null if not found.
 */
Lexicon.prototype.retrieve = function(oid, callback) {
    var that = this;

    if(oid === this.defaultGraphOid) {
        callback({
            token: "uri",
            value:this.defaultGraphUri,
            prefix: null,
            suffix: null,
            defaultGraph: true
        });
    } else {
        var transaction = that.db.transaction(["uris","literals","blanks"]);
        async.seq(function(found,k){
            var request = transaction.objectStore("uris").get(oid);
            request.onsuccess = function(event) {
                if(event.target.result != null)
                    k(null, that.parseUri(event.target.result.uri));
                else
                    k(null,null)
            };
            request.onerror = function(event) {
                k(new Error("Error searching in URIs data "+event.target.errorCode));
            };
        }, function(found,k){
            if(found == null) {
                var request = transaction.objectStore("literals").get(oid);
                request.onsuccess = function(event) {
                    if(event.target.result != null)
                        k(null, that.parseLiteral(event.target.result.literal));
                    else
                        k(null,null)
                };
                request.onerror = function(event) {
                    k(new Error("Error searching in Literals data "+event.target.errorCode));
                };
            } else {
                k(null,found);
            }
        }, function(found,k){
            if(found == null) {
                var request = transaction.objectStore("blanks").get(oid);
                request.onsuccess = function(event) {
                    if(event.target.result != null) {
                        var label = "_:" + event.target.result.id;
                        k(null, that.parseLiteral({token: "blank", value: label}));
                    } else
                        k(null,null)
                };
                request.onerror = function(event) {
                    k(new Error("Error searching in blanks data "+event.target.errorCode));
                };
            } else {
                k(null,found);
            }
        })(null,function(err,found){
            if(err)
                callback(null,err);
            else
                callback(found);
        });
    }
};

/**
 * Empties the lexicon and restarts the counters.
 * @param callback
 */
Lexicon.prototype.clear = function(callback) {
    var that = this;
    this.defaultGraphOid = 0;
    this.defaultGraphUri = "https://github.com/antoniogarrote/rdfstore-js#default_graph";
    this.defaultGraphUriTerm = {"token":"uri","prefix":null,"suffix":null,"value":this.defaultGraphUri};
    var transaction = that.db.transaction(["uris","literals","blanks"],"readwrite"), request;

    async.seq(function(k){
        request = transaction.objectStore("uris").clear();
        request.onsuccess = function(){ k(); };
        request.onerror = function(){ k(); };
    }, function(k){
        request = transaction.objectStore("literals").clear();
        request.onsuccess = function(){ k(); };
        request.onerror = function(){ k(); };
    }, function(k){
        request = transaction.objectStore("blanks").clear();
        request.onsuccess = function(){ k(); };
        request.onerror = function(){ k(); };
    })(function(){
        if(callback != null)
            callback();
    });
};

/**
 * Removes the values associated to the subject, predicate, object and graph
 * values of the provided quad.
 * @param quad
 * @param key
 * @param callback
 */
Lexicon.prototype.unregister = function (quad, key, callback) {
    var that = this;
    async.seq(function(k){
        that._unregisterTerm(quad.subject.token, key.subject,k);
    }, function(k){
        that._unregisterTerm(quad.predicate.token, key.predicate,k);
    }, function(k){
        that._unregisterTerm(quad.object.token, key.object, k);
    }, function(k){
        if (quad.graph != null) {
            that._unregisterTerm(quad.graph.token, key.graph, k);
        } else {
            k();
        }
    })(function(){
        callback(true);
    });
};

/**
 * Unregisters a value, either URI, literal or blank.
 * @param kind
 * @param oid
 * @param callback
 * @private
 */
Lexicon.prototype._unregisterTerm = function (kind, oid, callback) {
    var that = this;
    var transaction = that.db.transaction(["uris","literals","blanks", "knownGraphs"],"readwrite"), request;
    if (kind === 'uri') {
        if (oid != this.defaultGraphOid) {
            var removeKnownGraphs = function() {
                var request = transaction.objectStore("knownGraphs").delete(oid);
                request.onsuccess = function() { callback(); };
                //request.onerror = function(){ callback(); };
            };
            var request = transaction.objectStore("uris").delete(oid);
            request.onsuccess = removeKnownGraphs();
            //request.onerror = removeKnownGraphs();
        } else {
            callback();
        }
    } else if (kind === 'literal') {
        var request = transaction.objectStore("literals").delete(oid);
        request.onsuccess = function() { callback(); };
        //request.onerror = function() { callback(); };

    } else if (kind === 'blank') {
        var request = transaction.objectStore("blanks").delete(oid);
        request.onsuccess = function() { callback(); };
        //request.onerror = function() { callback(); };
    } else {
        callback();
    }
};

module.exports = {
    Lexicon: Lexicon
};
},{"./btree":38,"./lexicon":42,"./utils":55}],46:[function(_dereq_,module,exports){

// imports
var utils = _dereq_('./utils');
var _ = utils;
var async = utils;

/*
 * "perfect" indices for RDF indexing
 *
 * SPOG (?, ?, ?, ?), (s, ?, ?, ?), (s, p, ?, ?), (s, p, o, ?), (s, p, o, g)
 * GP   (?, ?, ?, g), (?, p, ?, g)
 * OGS  (?, ?, o, ?), (?, ?, o, g), (s, ?, o, g)
 * POG  (?, p, ?, ?), (?, p, o, ?), (?, p, o, g)
 * GSP  (s, ?, ?, g), (s, p, ?, g)
 * OS   (s, ?, o, ?)
 *
 * @param configuration['dbName'] Name for the IndexedDB
 * @return The newly created backend.
 */
QuadBackend = function (configuration, callback) {
    var that = this;

    if (arguments !== 0) {

        utils.registerIndexedDB(that);

        this.indexMap = {};
        this.indices = ['SPOG', 'GP', 'OGS', 'POG', 'GSP', 'OS'];
        this.componentOrders = {
            SPOG:['subject', 'predicate', 'object', 'graph'],
            GP:['graph', 'predicate', 'subject', 'object'],
            OGS:['object', 'graph', 'subject', 'predicate'],
            POG:['predicate', 'object', 'graph', 'subject'],
            GSP:['graph', 'subject', 'predicate', 'object'],
            OS:['object', 'subject', 'predicate', 'graph']
        };

        that.dbName = configuration['name'] || "rdfstorejs";
        var request = that.indexedDB.open(this.dbName+"_db", 1);
        request.onerror = function(event) {
            callback(null,new Error("Error opening IndexedDB: " + event.target.errorCode));
        };
        request.onsuccess = function(event) {
            that.db = event.target.result;
            callback(that);
        };
        request.onupgradeneeded = function(event) {
            var db = event.target.result;
            var objectStore = db.createObjectStore(that.dbName, { keyPath: 'SPOG'});
            _.each(that.indices, function(index){
                if(index !== 'SPOG') {
                    objectStore.createIndex(index,index,{unique: false});
                }
            });
        };
    }
};


QuadBackend.prototype.index = function (quad, callback) {
    var that = this;
    _.each(this.indices, function(index){
        quad[index] = that._genMinIndexKey(quad, index);
    });

    var transaction = that.db.transaction([that.dbName],"readwrite");
    transaction.oncomplete = function(event) {
        //callback(true)
    };
    transaction.onerror = function(event) {
        callback(null, new Error(event.target.statusCode));
    };
    var objectStore = transaction.objectStore(that.dbName);
    var request = objectStore.add(quad);
    request.onsuccess = function(event) {
        callback(true)
    };
};

QuadBackend.prototype.range = function (pattern, callback) {
    var that = this;
    var objectStore = that.db.transaction([that.dbName]).objectStore(that.dbName);
    var indexKey = this._indexForPattern(pattern);
    var minIndexKeyValue = this._genMinIndexKey(pattern,indexKey);
    var maxIndexKeyValue = this._genMaxIndexKey(pattern,indexKey);
    var keyRange = that.IDBKeyRange.bound(minIndexKeyValue, maxIndexKeyValue, false, false);
    var quads = [];
    var cursorSource;

    if(indexKey === 'SPOG') {
        cursorSource = objectStore;
    } else {
        cursorSource = objectStore.index(indexKey);
    }

    cursorSource.openCursor(keyRange).onsuccess = function(event) {
        var cursor = event.target.result;
        if (cursor) {
            quads.push(cursor.value);
            cursor.continue();
        } else {
            callback(quads);
        }
    }
};

QuadBackend.prototype.search = function (quad, callback) {
    var that = this;
    var objectStore = that.db.transaction([that.dbName]).objectStore(that.dbName);
    var indexKey = this._genMinIndexKey(quad, 'SPOG');
    var request = objectStore.get(indexKey);
    request.onerror = function(event) {
        callback(null, new Error(event.target.statusCode));
    };
    request.onsuccess = function(event) {
        callback(event.target.result != null);
    };
};


QuadBackend.prototype.delete = function (quad, callback) {
    var that = this;
    var indexKey = that._genMinIndexKey(quad, 'SPOG');
    var request = that.db.transaction([that.dbName], "readwrite")
        .objectStore(that.dbName)
        .delete(indexKey);
    request.onsuccess = function() {
        callback(true);
    };
    request.onerror = function(event) {
        callback(null, new Error(event.target.statusCode));
    };
};

QuadBackend.prototype._genMinIndexKey = function(quad,index) {
    var indexComponents = this.componentOrders[index];
    return _.map(indexComponents, function(component){
        if(typeof(quad[component]) === 'string' || quad[component] == null) {
            return "-1";
        } else {
            return ""+quad[component];
        }
    }).join('.');
};

QuadBackend.prototype._genMaxIndexKey = function(quad,index) {
    var indexComponents = this.componentOrders[index];
    var acum = [];
    var foundFirstMissing = false;
    for(var i=0; i<indexComponents.length; i++){
        var component = indexComponents[i];
        var componentValue= quad[component];
        if(typeof(componentValue) === 'string') {
            if (foundFirstMissing === false) {
                    foundFirstMissing = true;
                if (i - 1 >= 0) {
                    acum[i - 1] = acum[i - 1] + 1
                }
            }
            acum[i] = -1;
        } else {
            acum[i] = componentValue;
        }
    }
    return _.map(acum, function(componentValue){
        return ""+componentValue
    }).join('.');
};


QuadBackend.prototype._indexForPattern = function (pattern) {
    var indexKey = pattern.indexKey;

    for (var i = 0; i < this.indices.length; i++) {
        var index = this.indices[i];
        var indexComponents = this.componentOrders[index];
        for (var j = 0; j < indexComponents.length; j++) {
            if (_.include(indexKey, indexComponents[j]) === false) {
                break;
            }
            if (j == indexKey.length - 1) {
                return index;
            }
        }
    }

    return 'SPOG'; // If no other match, we return the more generic index
};


QuadBackend.prototype.clear = function(callback) {
    var that = this;
    var transaction = that.db.transaction([that.dbName],"readwrite"), request;
    request = transaction.objectStore(that.dbName).clear();
    request.onsuccess = function(){ callback(); };
    request.onerror = function(){ callback(); };
};

module.exports.QuadBackend = QuadBackend;

},{"./utils":55}],47:[function(_dereq_,module,exports){

// imports
var QuadIndex = _dereq_("./quad_index").QuadIndex;
var async = _dereq_('./utils');
var _ = _dereq_('./utils');

/*
 * "perfect" indices for RDF indexing
 *
 * SPOG (?, ?, ?, ?), (s, ?, ?, ?), (s, p, ?, ?), (s, p, o, ?), (s, p, o, g)
 * GP   (?, ?, ?, g), (?, p, ?, g)
 * OGS  (?, ?, o, ?), (?, ?, o, g), (s, ?, o, g)
 * POG  (?, p, ?, ?), (?, p, o, ?), (?, p, o, g)
 * GSP  (s, ?, ?, g), (s, p, ?, g)
 * OS   (s, ?, o, ?)
 *
 * @param configuration['treeOrder'] Tree order for the indices that are going to be created
 * @return The newly created backend.
 */
QuadBackend = function (configuration, callback) {
    if (arguments !== 0) {
        this.indexMap = {};
        this.treeOrder = configuration['treeOrder'];
        this.indices = ['SPOG', 'GP', 'OGS', 'POG', 'GSP', 'OS'];
        this.componentOrders = {
            SPOG:['subject', 'predicate', 'object', 'graph'],
            GP:['graph', 'predicate', 'subject', 'object'],
            OGS:['object', 'graph', 'subject', 'predicate'],
            POG:['predicate', 'object', 'graph', 'subject'],
            GSP:['graph', 'subject', 'predicate', 'object'],
            OS:['object', 'subject', 'predicate', 'graph']
        };
        var that = this;
        var i = 0;

        async.eachSeries(this.indices,function(indexKey,k){
            new QuadIndex({
                    order:that.treeOrder,
                    componentOrder:that.componentOrders[indexKey]
                },function (tree) {
                that.indexMap[indexKey] = tree;
                k();
            });
        },function(){
            callback(that);
        });
    }
};


QuadBackend.prototype._indexForPattern = function (pattern) {
    var indexKey = pattern.indexKey;

    for (var i = 0; i < this.indices.length; i++) {
        var index = this.indices[i];
        var indexComponents = this.componentOrders[index];
        for (var j = 0; j < indexComponents.length; j++) {
            if (_.include(indexKey, indexComponents[j]) === false) {
                break;
            }
            if (j == indexKey.length - 1) {
                return index;
            }
        }
    }

    return 'SPOG'; // If no other match, we return the more generic index
};


QuadBackend.prototype.index = function (quad, callback) {
    var that = this;
    async.eachSeries(this.indices, function(indexKey,k){
        var index = that.indexMap[indexKey];
        index.insert(quad, function(){
            k();
        })
    },function(){
        callback(that);
    });
};

QuadBackend.prototype.range = function (pattern, callback) {
    var indexKey = this._indexForPattern(pattern);
    var index = this.indexMap[indexKey];
    index.range(pattern, function (quads) {
        callback(quads);
    });
};

QuadBackend.prototype.search = function (quad, callback) {
    var index = this.indexMap['SPOG'];

    index.search(quad, function (result) {
        callback(result != null);
    });
};


QuadBackend.prototype.delete = function (quad, callback) {
    var that = this;

    async.eachSeries(this.indices, function(indexKey,k){
        var index = that.indexMap[indexKey];
        index.delete(quad, function(){
            k();
        })
    },function(){
        callback(that);
    });
};

QuadBackend.prototype.clear = function(callback) {
    var that = this;
    async.eachSeries(this.indices,function(indexKey,k){
        new QuadIndex({
            order:that.treeOrder,
            componentOrder:that.componentOrders[indexKey]
        },function (tree) {
            that.indexMap[indexKey] = tree;
            k();
        });
    },function(){
        callback(that);
    });
};

module.exports.QuadBackend = QuadBackend;

},{"./quad_index":48,"./utils":55}],48:[function(_dereq_,module,exports){
var BaseTree = _dereq_("./btree").Tree;
var _ = _dereq_('./utils');
var async = _dereq_('./utils');

/**
 * NodeKey
 *
 * Implements the interface of BinarySearchTree.Node
 *
 * A Tree node augmented with BPlusTree
 * node structures
 */
NodeKey = function(components, order) {
    this.subject = components.subject;
    this.predicate = components.predicate;
    this.object = components.object;
    this.graph = components.graph;
    this.order = order;
};

/**
 * Makes it possible to compare two keys, returning -1,0,1
 * depending on the relative position of the keys.
 * @param keyPattern
 * @returns {number}
 */
NodeKey.prototype.comparator = function(keyPattern) {
    for(var i=0; i<this.order.length; i++) {
        var component = this.order[i];
        if(keyPattern[component] == null) {
            return 0;
        } else {
            if(this[component] < keyPattern[component] ) {
                return -1
            } else if(this[component] > keyPattern[component]) {
                return 1
            }
        }
    }

    return 0;
};

/**
 * Pattern
 *
 * A pattern with some variable components
 */
Pattern = function (components) {
    this.subject = components.subject;
    this.predicate = components.predicate;
    this.object = components.object;
    this.graph = components.graph;
    this.indexKey = [];

    this.keyComponents = {};

    var order = [];
    var indiferent = [];
    var that = this;

    // components must have been already normalized and
    // inserted in the lexicon.
    // OIDs retrieved from the lexicon *are* numbers so
    // they can be told apart from variables (strings)
    _.forEach(['subject', 'predicate', 'object', 'graph'], function(component){
        if (typeof(that[component]) === 'string') {
            indiferent.push(component);
            that.keyComponents[component] = null;
        } else {
            order.push(component);
            that.keyComponents[component] = that[component];
            that.indexKey.push(component);
        }

    });

    this.order = order.concat(indiferent);
    this.key = new NodeKey(this.keyComponents, this.order);
};


/**
 * An index for quads built on top of a BTree implementation.
 *
 * @param params
 * @param callback
 * @constructor
 */
QuadIndex = function (params, callback) {
    if (arguments != 0) {
        this.componentOrder = params.componentOrder;

        BaseTree.call(this, params.order, function (tree) {

            // For exact matches. Used by search.
            tree.comparator = function (a, b) {
                for (var i = 0; i < tree.componentOrder.length; i++) {
                    var component = tree.componentOrder[i];

                    var vala = a[component];
                    var valb = b[component];

                    if (vala < valb) {
                        return -1;
                    } else if (vala > valb) {
                        return 1;
                    }
                }

                return 0;
            };

            // For range matches.
            tree.rangeComparator = function (a, b) {
                for (var i = 0; i < tree.componentOrder.length; i++) {
                    var component = tree.componentOrder[i];
                    if (b[component] == null || a[component] == null) {
                        return 0;
                    } else {
                        if (a[component] < b[component]) {
                            return -1
                        } else if (a[component] > b[component]) {
                            return 1
                        }
                    }
                }

                return 0;
            };

            callback(tree);
        });
    }
};

QuadIndex.prototype = _.create(BaseTree.prototype, {'constructor':BaseTree});


/**
 * Insert a quad with subject,predicate,object,graph values into the index.
 * @param quad
 * @param callback
 */
QuadIndex.prototype.insert = function(quad, callback) {
    BaseTree.prototype.insert.call(this, quad, null, function(result){
        callback(result);
    });
};

/**
 * Searches for a quad value in the index returning true if it matches a key.
 * @param quad
 * @param callback
 */
QuadIndex.prototype.search = function(quad, callback) {
    BaseTree.prototype.search.call(this, quad, function(result){
        callback(result);
    }, true); // true -> check exists : hack only present in the inMemoryAsyncBTree implementation
};

/**
 * Traverse the inde accumulating the keys matching a provided pattern.
 *
 * @param pattern A subject,predicate,object,graph pattern, containing values and variables.
 * @param callback
 */
QuadIndex.prototype.range = function (pattern, callback) {
    this._rangeTraverse(this, this.root, pattern, callback);
};

QuadIndex.prototype._rangeTraverse = function(tree,node, pattern, callback) {
    var patternKey  = pattern.key;
    var acum = [];
    var pendingNodes = [node];

    async.whilst(function(){
        return pendingNodes.length > 0;
    }, function(k){
        // next node to process
        var node = pendingNodes.shift();
        var idxMin = 0;

        // move forward in the lower keys not matching the pattern.
        while(idxMin < node.numberActives && tree.rangeComparator(node.keys[idxMin].key,patternKey) === -1) {
            idxMin++;
        }

        // we found a matching or bigger key

        if(node.isLeaf === true) { // the node is a leaf node -> has no nodes to push, only keys to accumulate

            var idxMax = idxMin;

            // we keep on accumulating matching keys in this leaf
            while(idxMax < node.numberActives && tree.rangeComparator(node.keys[idxMax].key,patternKey) === 0) {
                acum.push(node.keys[idxMax].key);
                idxMax++;
            }

            // next iteration
            k();

        } else { // the node is not a leaf, push potentially matching nodes requiring processing.
            tree._diskRead(node.children[idxMin], function(childNode){

                // pushing the found node
                pendingNodes.push(childNode);
                var idxMax = idxMin;

                async.whilst(function(){
                    // keep pushing nodes while the key for that nod ematches the pattern
                    return (idxMax < node.numberActives && tree.rangeComparator(node.keys[idxMax].key,patternKey) === 0);

                },function(kk){

                    acum.push(node.keys[idxMax].key);
                    idxMax++;
                    tree._diskRead(node.children[idxMax], function(childNode){
                        pendingNodes.push(childNode);
                        kk();
                    })

                },function(){
                    k();
                });
            });
        }
    }, function(){
        callback(acum);
    });
};

module.exports = {
    QuadIndex: QuadIndex,
    Pattern: Pattern,
    NodeKey: NodeKey
};


},{"./btree":38,"./utils":55}],49:[function(_dereq_,module,exports){
//imports
var AbstractQueryTree = _dereq_("./abstract_query_tree").AbstractQueryTree;
var NonSupportedSparqlFeatureError = _dereq_("./abstract_query_tree").NonSupportedSparqlFeatureError;
var Utils = _dereq_("./utils");
var QuadIndex = _dereq_("./quad_index");
var QueryPlan = _dereq_("./query_plan").QueryPlan;
var QueryFilters = _dereq_("./query_filters").QueryFilters;
var RDFModel = _dereq_("./rdf_model");
var RDFLoader = _dereq_("./rdf_loader").RDFLoader;
var Callbacks = _dereq_("./graph_callbacks").CallbacksBackend;
var async = _dereq_('./utils');
var _ = _dereq_('./utils');

QueryEngine = function(params) {
    if(arguments.length != 0) {
        this.backend = params.backend;
        this.lexicon = params.lexicon;
        // batch loads should generate events?
        this.eventsOnBatchLoad = (params.eventsOnBatchLoad || false);
        // list of namespaces that will be automatically added to every query
        this.defaultPrefixes = {};
        this.abstractQueryTree = new AbstractQueryTree();
        this.rdfLoader = new RDFLoader(params['communication']);
        this.callbacksBackend = new Callbacks(this);
        this.customFns = params.customFns || {};
    }
};

QueryEngine.prototype.setCustomFunctions = function(customFns) {
    this.customFns = customFns;
};

// Utils
QueryEngine.prototype.registerNsInEnvironment = function(prologue, env) {
    var prefixes = [];
    if(prologue != null && prologue.prefixes != null) {
        prefixes =prologue.prefixes;
    }
    var toSave = {};

    // adding default prefixes;
    for(var p in this.defaultPrefixes) {
        toSave[p] = this.defaultPrefixes[p];
    }

    for(var i=0; i<prefixes.length; i++) {
        var prefix = prefixes[i];
        if(prefix.token === "prefix") {
            toSave[prefix.prefix] = prefix.local;
        }
    }

    env.namespaces = toSave;
    if(prologue!=null && prologue.base && typeof(prologue.base) === 'object') {
        env.base = prologue.base.value;
    } else {
        env.base = null;
    }
};

QueryEngine.prototype.applyModifier = function(modifier, projectedBindings) {
    if(modifier == "DISTINCT") {
        var map = {};
        var result = [];
        for(var i=0; i<projectedBindings.length; i++) {
            var bindings = projectedBindings[i];
            var key = "";

            // if no projection variables hash is passed, all the bound
            // variable in the current bindings will be used.
            for(var p in (bindings)) {
                // hashing the object
                var obj = bindings[p];
                if(obj == null) {
                    key = key+p+'null';
                } else if(obj.token == 'literal') {
                    if(obj.value != null) {
                        key = key + obj.value;
                    }
                    if(obj.lang != null) {
                        key = key + obj.lang;
                    }
                    if(obj.type != null) {
                        key = key + obj.type;
                    }
                } else if(obj.value) {
                    key  = key + p + obj.value;
                } else {
                    key = key + p + obj;
                }
            }

            if(map[key] == null) {
                // this will preserve the order in projectedBindings
                result.push(bindings);
                map[key] = true;
            }
        }
        return result;
    } else {
        return projectedBindings;
    }
};

QueryEngine.prototype.applyLimitOffset = function(offset, limit, bindings) {
    if(limit == null && offset == null) {
        return bindings;
    }

    if (offset == null) {
        offset = 0;
    }

    if(limit == null) {
        limit = bindings.length;
    } else {
        limit = offset + limit;
    }

    return bindings.slice(offset, limit);
};


QueryEngine.prototype.applySingleOrderBy = function(orderFilters, modifiedBindings, dataset, outEnv, callback) {
    var acum = [];
    var that = this;
    async.eachSeries(orderFilters, function(orderFilter,k){
        QueryFilters.collect(orderFilter.expression, [modifiedBindings], dataset, outEnv, that, function(results) {
            acum.push(results[0].value);
            k()
        });
    }, function(){
        callback({binding:modifiedBindings, value:acum})
    });
};

QueryEngine.prototype.applyOrderBy = function(order, modifiedBindings, dataset, outEnv, callback) {
    var that = this;
    var acum = [];
    if(order != null && order.length > 0) {
        async.eachSeries(modifiedBindings, function(bindings,k){
            that.applySingleOrderBy(order, bindings, dataset, outEnv, function(results){
                acum.push(results);
                k();
            });
        }, function(){
            acum.sort(function(a,b){
                return that.compareFilteredBindings(a, b, order, outEnv);
            });

            var toReturn = [];
            for(var i=0; i<acum.length; i++) {
                toReturn.push(acum[i].binding);
            }

            callback(toReturn);
        });

    } else {
        callback(modifiedBindings);
    }
};

QueryEngine.prototype.compareFilteredBindings = function(a, b, order, env) {
    var found = false;
    var i = 0;
    while(!found) {
        if(i==a.value.length) {
            return 0;
        }
        var direction = order[i].direction;
        var filterResult;

        // unbound first
        if(a.value[i] == null && b.value[i] == null) {
            i++;
            continue;
        }else if(a.value[i] == null) {
            filterResult = {value: false};
        } else if(b.value[i] == null) {
            filterResult = {value: true};
        } else

        // blanks
        if(a.value[i].token === 'blank' && b.value[i].token === 'blank') {
            i++;
            continue;
        } else if(a.value[i].token === 'blank') {
            filterResult = {value: false};
        } else if(b.value[i].token === 'blank') {
            filterResult = {value: true};
        } else

        // uris
        if(a.value[i].token === 'uri' && b.value[i].token === 'uri') {
            if(QueryFilters.runEqualityFunction(a.value[i], b.value[i], [], this, env).value == true) {
                i++;
                continue;
            } else {
                filterResult = QueryFilters.runTotalGtFunction(a.value[i], b.value[i], []);
            }
        } else if(a.value[i].token === 'uri') {
            filterResult = {value: false};
        } else if(b.value[i].token === 'uri') {
            filterResult = {value: true};
        } else

        // simple literals
        if(a.value[i].token === 'literal' && b.value[i].token === 'literal' && a.value[i].type == null && b.value[i].type == null) {
            if(QueryFilters.runEqualityFunction(a.value[i], b.value[i], [], this, env).value == true) {
                i++;
                continue;
            } else {
                filterResult = QueryFilters.runTotalGtFunction(a.value[i], b.value[i], []);
            }
        } else if(a.value[i].token === 'literal' && a.value[i].type == null) {
            filterResult = {value: false};
        } else if(b.value[i].token === 'literal' && b.value[i].type == null) {
            filterResult = {value: true};
        } else

        // literals
        if(QueryFilters.runEqualityFunction(a.value[i], b.value[i], [], this, env).value == true) {
            i++;
            continue;
        } else {
            filterResult = QueryFilters.runTotalGtFunction(a.value[i], b.value[i], []);
        }


        // choose value for comparison based on the direction
        if(filterResult.value == true) {
            if(direction === "ASC") {
                return 1;
            } else {
                return -1;
            }
        } else {
            if(direction === "ASC") {
                return -1;
            } else {
                return 1;
            }
        }
    }
};

QueryEngine.prototype.removeDefaultGraphBindings = function(bindingsList, dataset) {
    var onlyDefaultDatasets = [];
    var namedDatasetsMap = {};
    for(var i=0; i<dataset.named.length; i++) {
        namedDatasetsMap[dataset.named[i].oid] = true;
    }
    for(i=0; i<dataset.implicit.length; i++) {
        if(namedDatasetsMap[dataset.implicit[i].oid] == null) {
            onlyDefaultDatasets.push(dataset.implicit[i].oid);
        }
    }
    var acum = [];
    for(i=0; i<bindingsList.length; i++) {
        var bindings = bindingsList[i];
        var foundDefaultGraph = false;
        for(var p in bindings) {
            for(var j=0; j<namedDatasetsMap.length; j++) {
                if(bindings[p] === namedDatasetsMap[j]) {
                    foundDefaultGraph = true;
                    break;
                }
            }
            if(foundDefaultGraph) {
                break;
            }
        }
        if(!foundDefaultGraph) {
            acum.push(bindings);
        }
    }

    return acum;
};


QueryEngine.prototype.aggregateBindings = function(projection, bindingsGroup, dataset, env, callback) {
    this.copyDenormalizedBindings(bindingsGroup, env.outCache, function(denormBindings){
        var aggregatedBindings = {};
        for(var i=0; i<projection.length; i++) {
            var aggregatedValue = QueryFilters.runAggregator(projection[i], denormBindings, this, dataset, env);
            if(projection[i].alias) {
                aggregatedBindings[projection[i].alias.value] = aggregatedValue;
            } else {
                aggregatedBindings[projection[i].value.value] = aggregatedValue;
            }
        }
        callback(aggregatedBindings);
    });
};


QueryEngine.prototype.projectBindings = function(projection, results, dataset) {
    if(projection[0].kind === '*') {
        return results;
    } else {
        var projectedResults = [];

        for(var i=0; i<results.length; i++) {
            var currentResult = results[i];
            var currentProjected = {};
            var shouldAdd = true;

            for(var j=0; j< projection.length; j++) {
                if(projection[j].token == 'variable' && projection[j].kind != 'aliased') {
                    currentProjected[projection[j].value.value] = currentResult[projection[j].value.value];
                } else if(projection[j].token == 'variable' && projection[j].kind == 'aliased') {
                    var ebv = QueryFilters.runFilter(projection[j].expression, currentResult, this, dataset, {blanks:{}, outCache:{}});
                    if(QueryFilters.isEbvError(ebv)) {
                        shouldAdd = false;
                        break;
                    } else {
                        currentProjected[projection[j].alias.value] = ebv;
                    }
                }
            }

            if(shouldAdd === true) {
                projectedResults.push(currentProjected);
            }

        }

        return projectedResults;
    }
};

QueryEngine.prototype.resolveNsInEnvironment = function(prefix, env) {
    var namespaces = env.namespaces;
    return namespaces[prefix];
};

QueryEngine.prototype.normalizeTerm = function(term, env, shouldIndex, callback) {
    if(term.token === 'uri') {
        var uri = Utils.lexicalFormBaseUri(term, env);
        if(uri == null) {
            callback(null);
        } else {
            if(shouldIndex) {
                this.lexicon.registerUri(uri,callback);
            } else {
                this.lexicon.resolveUri(uri,callback);
            }
        }

    } else if(term.token === 'literal') {
        var lexicalFormLiteral = Utils.lexicalFormLiteral(term, env);
        if(shouldIndex) {
            this.lexicon.registerLiteral(lexicalFormLiteral,callback);
        } else {
            this.lexicon.resolveLiteral(lexicalFormLiteral,callback);
        }
    } else if(term.token === 'blank') {
        var label = term.value;
        var oid = env.blanks[label];
        if( oid != null) {
            callback(oid);
        } else {
            if(shouldIndex) {
                this.lexicon.registerBlank(function(oid){
                    env.blanks[label] = oid;
                    callback(oid);
                });
            } else {
                // should never get here...
                // is resolveBlank useful?
                this.lexicon.resolveBlank(function(oid) {
                    env.blanks[label] = oid;
                    callback(oid);
                });
            }
        }
    } else if(term.token === 'var') {
        callback(term.value);
    } else {
        callback(null);
    }
};

QueryEngine.prototype.normalizeDatasets = function(datasets, outerEnv, callback) {
    var that = this;
    async.eachSeries(datasets, function(dataset, k){
        if(dataset.value === that.lexicon.defaultGraphUri) {
            dataset.oid = that.lexicon.defaultGraphOid;
            k();
        } else {
            that.normalizeTerm(dataset, outerEnv, false, function(oid){
                if(oid != null) {
                    dataset.oid = oid;
                }
                k();
            });
        }
    }, function(){
        callback(true);
    });
};

QueryEngine.prototype.normalizeQuad = function(quad, queryEnv, shouldIndex, callback) {
    var subject    = null;
    var predicate  = null;
    var object     = null;
    var graph      = null;
    var that = this;
    var error = false;

    async.seq(function(k){
        if(quad.graph == null || quad.graph.value === that.lexicon.defaultGraphUri) {
            graph = 0; // default graph
            k();
        } else {
            var graphUriValue = Utils.lexicalFormBaseUri(quad.graph, queryEnv);
            that.normalizeTerm(quad.graph, queryEnv, shouldIndex, function(oid){
                if(oid != null) {
                    graph = oid;
                    if(shouldIndex === true && quad.graph.token!='var') {
                        that.lexicon.registerGraph(oid, graphUriValue, function(){
                            k();
                        });
                    } else {
                        k();
                    }
                } else {
                    error = true;
                    k();
                }
            });
        }

    }, function(k){
        if(error === false) {
            that.normalizeTerm(quad.subject, queryEnv, shouldIndex, function(oid){
                if(oid!=null) {
                    subject = oid;
                    k();
                } else {
                    error = true;
                    k();
                }
            });
        } else {
            k();
        }
    },function(k){
        if(error === false) {
            that.normalizeTerm(quad.predicate, queryEnv, shouldIndex, function(oid){
                if(oid!=null) {
                    predicate = oid;
                    k();
                } else {
                    error = true;
                    k();
                }
            });
        } else {
            k();
        }
    },function(k){
        if(error === false) {
            that.normalizeTerm(quad.object, queryEnv, shouldIndex, function(oid){
                if(oid!=null) {
                    object = oid;
                    k();
                } else {
                    error = true;
                    k();
                }
            });
        } else {
            k();
        }
    })(function(){
        if(error === true){
            callback(null);
        } else {
            callback({
                subject:subject,
                predicate:predicate,
                object:object,
                graph:graph
            });
        }
    });
};

QueryEngine.prototype.denormalizeBindingsList = function(bindingsList, env, callback) {
    var that = this;
    var denormList = [];

    async.eachSeries(bindingsList, function(bindings, k){
        that.denormalizeBindings(bindings, env, function(denorm){
            denormList.push(denorm);
            k();
        });
    },function(){
        callback(denormList);
    });
};

/**
 * Receives a bindings map (var -> oid) and an out cache (oid -> value)
 * returns a bindings map (var -> value) storing in cache all the missing values for oids
 *
 * This is required just to save lookups when final results are generated.
 */
QueryEngine.prototype.copyDenormalizedBindings = function(bindingsList, out, callback) {
    var that = this;
    var denormList = [];
    async.eachSeries(bindingsList, function(bindings, k){
        var denorm = {};
        var variables = _.keys(bindings);
        async.eachSeries(variables, function(variable, kk){
            var oid = bindings[variable];
            if(oid == null) {
                // this can be null, e.g. union different variables (check SPARQL recommendation examples UNION)
                denorm[variable] = null;
                kk();
            } else if(typeof(oid) === 'object') {
                // the binding is already denormalized, this can happen for example because the value of the
                // binding is the result of the aggregation of other bindings in a GROUP clause
                denorm[variable] = oid;
                kk();
            } else {
                var inOut = out[oid];
                if(inOut!= null) {
                    denorm[variable] = inOut;
                    kk();
                } else {
                    that.lexicon.retrieve(oid, function(val){
                        out[oid] = val;
                        denorm[variable] = val;
                        kk();
                    });
                }
            }
        },function(){
            denormList.push(denorm);
            k();
        });
    }, function(){
        callback(denormList);
    });
};

QueryEngine.prototype.denormalizeBindings = function(bindings, env, callback) {
    var variables = _.keys(bindings);
    var envOut = env.outCache;
    var that = this;
    async.eachSeries(variables, function(variable, k){
        var oid = bindings[variable];
        if(oid == null) {
            // this can be null, e.g. union different variables (check SPARQL recommendation examples UNION)
            bindings[variable] = null;
            k();
        } else {
            if(envOut[oid] != null) {
                bindings[variable] = envOut[oid];
                k();
            } else {
                that.lexicon.retrieve(oid, function(val){
                    bindings[variable] = val;
                    if(val.token === 'blank')
                        env.blanks[val.value] = oid;
                    k();
                });
            }
        }
    }, function(){
        callback(bindings);
    });
};

// Queries execution

QueryEngine.prototype.execute = function(queryString, callback, defaultDataset, namedDataset){
    //try{
        queryString = Utils.normalizeUnicodeLiterals(queryString);
        var syntaxTree = this.abstractQueryTree.parseQueryString(queryString);
        if(syntaxTree == null) {
            callback(false,"Error parsing query string");
        } else {
            if(syntaxTree.token === 'query' && syntaxTree.kind == 'update')  {
                this.callbacksBackend.startGraphModification();
                var that = this;
                this.executeUpdate(syntaxTree, function(err, result){
                    if(that.lexicon.updateAfterWrite)
                        that.lexicon.updateAfterWrite();

                    if(err) {
                        that.callbacksBackend.cancelGraphModification();
                        callback(err, result);
                    } else {
                        that.callbacksBackend.endGraphModification(function(){
                            callback(err, result);
                        });
                    }
                });
            } else if(syntaxTree.token === 'query' && syntaxTree.kind == 'query') {
                this.executeQuery(syntaxTree, callback, defaultDataset, namedDataset);
            }
        }
    //} catch(e) {
    //    callback(e);
    //}
};

// Retrieval queries

QueryEngine.prototype.executeQuery = function(syntaxTree, callback, defaultDataset, namedDataset) {
    var prologue = syntaxTree.prologue;
    var units = syntaxTree.units;
    var that = this;

    // environment for the operation -> base ns, declared ns, etc.
    var queryEnv = {blanks:{}, outCache:{}};
    this.registerNsInEnvironment(prologue, queryEnv);

    // retrieval queries can only have 1 executable unit
    var aqt = that.abstractQueryTree.parseExecutableUnit(units[0]);

    // can be anything else but a select???
    if(aqt.kind === 'select') {
        this.executeSelect(aqt, queryEnv, defaultDataset, namedDataset, function(err, result){
            if(err == null) {
                if(typeof(result) === 'object' && result.denorm === true) {
                    callback(null, result['bindings']);
                } else {
                    that.denormalizeBindingsList(result, queryEnv, function(result){
                        callback(null, result);
                    });
                }
            } else {
                callback(err);
            }
        });
    } else if(aqt.kind === 'ask') {
        aqt.projection = [{"token": "variable", "kind": "*"}];
        this.executeSelect(aqt, queryEnv, defaultDataset, namedDataset, function(err, result){
            if(err == null) {
                if(result.length>0) {
                    callback(null, true);
                } else {
                    callback(null, false);
                }
            } else {
                callback(err);
            }
        });
    } else if(aqt.kind === 'construct') {
        aqt.projection = [{"token": "variable", "kind": "*"}];
        that = this;
        this.executeSelect(aqt, queryEnv, defaultDataset, namedDataset, function(err, result){
            if(err == null) {

                that.denormalizeBindingsList(result, queryEnv, function(result){
                    if(result != null) {
                        var graph = new RDFModel.Graph();

                        // CONSTRUCT WHERE {} case
                        if(aqt.template == null) {
                            aqt.template = {triplesContext: aqt.pattern};
                        }
                        var blankIdCounter = 1;
                        var toClear = [];
                        for(var i=0; i<result.length; i++) {
                            var bindings = result[i];
                            for(var j=0; j<toClear.length; j++)
                                delete toClear[j].valuetmp;

                            for(var j=0; j<aqt.template.triplesContext.length; j++) {
                                // fresh IDs for blank nodes in the construct template
                                var components = ['subject', 'predicate', 'object'];
                                var tripleTemplate = aqt.template.triplesContext[j];
                                for(var p=0; p<components.length; p++) {
                                    var component = components[p];
                                    if(tripleTemplate[component].token === 'blank') {
                                        if(tripleTemplate[component].valuetmp && tripleTemplate[component].valuetmp != null) {
                                        } else {
                                            var blankId = "_:b"+blankIdCounter;
                                            blankIdCounter++;
                                            tripleTemplate[component].valuetmp = blankId;
                                            toClear.push(tripleTemplate[component]);
                                        }
                                    }
                                }
                                var s = RDFModel.buildRDFResource(tripleTemplate.subject,bindings,that,queryEnv);
                                var p = RDFModel.buildRDFResource(tripleTemplate.predicate,bindings,that,queryEnv);
                                var o = RDFModel.buildRDFResource(tripleTemplate.object,bindings,that,queryEnv);
                                if(s!=null && p!=null && o!=null) {
                                    var triple = new RDFModel.Triple(s,p,o);
                                    graph.add(triple);
                                    //} else {
                                    //    return callback(false, "Error creating output graph")
                                }
                            }
                            }
                        callback(null,graph);
                    } else {
                        callback(new Error("Error denormalizing bindings."));
                    }
                });
            } else {
                callback(err);
            }
        });
    }
};


// Select queries

QueryEngine.prototype.executeSelect = function(unit, env, defaultDataset, namedDataset, callback) {
    if(unit.kind === "select" || unit.kind === "ask" || unit.kind === "construct" || unit.kind === "modify") {
        var projection = unit.projection;
        var dataset    = unit.dataset;
        var modifier   = unit.modifier;
        var limit      = unit.limit;
        var offset     = unit.offset;
        var order      = unit.order;
        var that = this;

        if(defaultDataset != null || namedDataset != null) {
            dataset.implicit = defaultDataset || [];
            dataset.named   = namedDataset || [];
        }

        if(dataset.implicit != null && dataset.implicit.length === 0 && dataset.named !=null && dataset.named.length === 0) {
            // We add the default graph to the default merged graph
            dataset.implicit.push(this.lexicon.defaultGraphUriTerm);
        }


        that.normalizeDatasets(dataset.implicit.concat(dataset.named), env, function(){
            try {
                that.executeSelectUnit(projection, dataset, unit.pattern, env, function (result) {
                    if (result != null) {
                        // detect single group
                        if (unit.group != null && unit.group === "") {
                            var foundUniqueGroup = false;
                            for (var i = 0; i < unit.projection.length; i++) {
                                if (unit.projection[i].expression != null && unit.projection[i].expression.expressionType === 'aggregate') {
                                    foundUniqueGroup = true;
                                    break;
                                }
                            }
                            if (foundUniqueGroup === true) {
                                unit.group = 'singleGroup';
                            }
                        }
                        if (unit.group && unit.group != "") {
                            if (that.checkGroupSemantics(unit.group, projection)) {
                                that.groupSolution(result, unit.group, dataset, env, function(groupedBindings){
                                    var aggregatedBindings = [];
                                    async.eachSeries(groupedBindings, function(groupedBindingsGroup, k){
                                        that.aggregateBindings(projection, groupedBindingsGroup, dataset, env, function(resultingBindings){
                                            aggregatedBindings.push(resultingBindings);
                                            k();
                                        });
                                    }, function(){
                                        callback(null, {'bindings': aggregatedBindings, 'denorm': true});
                                    });
                                });
                            } else {
                                callback(new Error("Incompatible Group and Projection variables"));
                            }
                        } else {
                            that.applyOrderBy(order, result, dataset, env, function(orderedBindings){
                                var projectedBindings = that.projectBindings(projection, orderedBindings, dataset);
                                var modifiedBindings = that.applyModifier(modifier, projectedBindings);
                                var limitedBindings = that.applyLimitOffset(offset, limit, modifiedBindings);
                                var filteredBindings = that.removeDefaultGraphBindings(limitedBindings, dataset);

                                callback(null, filteredBindings);
                            });
                        }

                    } else { // fail selectUnit
                        callback(new Error("Error executing SELECT query."));
                    }
                });
            } catch(e) {
                console.log(e);
                callback(e);
            }
        });
    } else {
        callback(new Error("Cannot execute " + unit.kind + " query as a select query"));
    }
};


QueryEngine.prototype.groupSolution = function(bindings, group, dataset, queryEnv, callback){
    var order = [];
    var filteredBindings = [];
    var initialized = false;
    var that = this;
    if(group === 'singleGroup') {
        callback([bindings]);
    } else {
        async.eachSeries(bindings, function(currentBindings,k){
            var mustAddBindings = true;

            /**
             * In this loop, we iterate through all the group clauses and transform the current bindings
             * according to the group by clauses.
             * If it is the first iteration we also save in a different array the order for the
             * grouped variables that will be used later to build the final groups
             */
            async.eachSeries(group, function(currentOrderClause, kk){
                var orderVariable = null;

                if(currentOrderClause.token === 'var') {
                    orderVariable = currentOrderClause.value;

                    if(initialized == false) {
                        order.push(orderVariable);
                    }
                    kk();
                } else if(currentOrderClause.token === 'aliased_expression') {
                    orderVariable = currentOrderClause.alias.value;
                    if(initialized == false) {
                        order.push(orderVariable);
                    }

                    if(currentOrderClause.expression.primaryexpression === 'var') {
                        currentBindings[currentOrderClause.alias.value] = currentBindings[currentOrderClause.expression.value.value];
                    } else {
                        var denormBindings = that.copyDenormalizedBindings([currentBindings], queryEnv.outCache);
                        var filterResultEbv = QueryFilters.runFilter(currentOrderClause.expression, denormBindings[0], that, dataset, queryEnv);
                        if(!QueryFilters.isEbvError(filterResultEbv)) {
                            if(filterResultEbv.value != null) {
                                filterResultEbv.value = ""+filterResultEbv.value;
                            }
                            currentBindings[currentOrderClause.alias.value]= filterResultEbv;
                        } else {
                            mustAddBindings = false;
                        }
                    }
                    kk();
                } else {
                    // In this case, we create an additional variable in the binding to hold the group variable value
                    that.copyDenormalizedBindings([currentBindings], queryEnv.outCache, function(denormBindings){
                        var filterResultEbv = QueryFilters.runFilter(currentOrderClause, denormBindings[0], that, queryEnv);
                        if(!QueryFilters.isEbvError(filterResultEbv)) {
                            currentBindings["groupCondition"+env._i] = filterResultEbv;
                            orderVariable = "groupCondition"+env._i;
                            if(initialized == false) {
                                order.push(orderVariable);
                            }

                        } else {
                            mustAddBindings = false;
                        }
                        kk();
                    });
                }
            }, function(){
                if(initialized == false) {
                    initialized = true;
                }
                if(mustAddBindings === true) {
                    filteredBindings.push(currentBindings);
                }
                k();
            });
        }, function(){
            /**
             * After processing all the bindings, we build the group using the
             * information stored about the order of the group variables.
             */
            var dups = {};
            var groupMap = {};
            var groupCounter = 0;
            for(var i=0; i<filteredBindings.length; i++) {
                var currentTransformedBinding = filteredBindings[i];
                var key = "";
                for(var j=0; j<order.length; j++) {
                    var maybeObject = currentTransformedBinding[order[j]];
                    if(typeof(maybeObject) === 'object') {
                        key = key + maybeObject.value;
                    } else {
                        key = key + maybeObject;
                    }
                }

                if(dups[key] == null) {
                    //currentTransformedBinding["__group__"] = groupCounter;
                    groupMap[key] = groupCounter;
                    dups[key] = [currentTransformedBinding];
                    //groupCounter++
                } else {
                    //currentTransformedBinding["__group__"] = dups[key][0]["__group__"];
                    dups[key].push(currentTransformedBinding);
                }
            }

            // The final result is an array of arrays with all the groups
            var groups = [];

            for(var k in dups) {
                groups.push(dups[k]);
            }

            callback(groups);
        });
    }
};


/**
 * Here, all the constructions of the SPARQL algebra are handled
 */
QueryEngine.prototype.executeSelectUnit = function(projection, dataset, pattern, env, callback) {
    if(pattern.kind === "BGP") {
        this.executeAndBGP(projection, dataset, pattern, env, callback);
    } else if(pattern.kind === "UNION") {
        this.executeUNION(projection, dataset, pattern.value, env, callback);
    } else if(pattern.kind === "JOIN") {
        this.executeJOIN(projection, dataset, pattern, env, callback);
    } else if(pattern.kind === "LEFT_JOIN") {
        this.executeLEFT_JOIN(projection, dataset, pattern, env, callback);
    } else if(pattern.kind === "FILTER") {
        // Some components may have the filter inside the unit
        var that = this;
        this.executeSelectUnit(projection, dataset, pattern.value, env, function (results) {
            if (results != null) {
                QueryFilters.checkFilters(pattern, results, false, dataset, env, that, callback);
            } else {
                callback([]);
            }
        });
    } else if(pattern.kind === "EMPTY_PATTERN") {
        // as an example of this case  check DAWG test case: algebra/filter-nested-2
        callback([]);
    //} else if(pattern.kind === "ZERO_OR_MORE_PATH" || pattern.kind === 'ONE_OR_MORE_PATH') {
    //    return this.executeZeroOrMorePath(pattern, dataset, env);
    } else {
        throw(new NonSupportedSparqlFeatureError(pattern.kind))
    }
};

/*
QueryEngine.prototype.executeZeroOrMorePath = function(pattern, dataset, env) {
    //console.log("EXECUTING ZERO OR MORE PATH");
    //console.log("X");
    //console.log(pattern.x);
    //console.log("Y");
    //console.log(pattern.y);
    var projection = [];
    var starProjection = false;
    if(pattern.x.token === 'var') {
        projection.push({token: 'variable',
            kind: 'var',
            value: pattern.x.value});
    }
    if(pattern.y.token === 'var') {
        projection.push({token: 'variable',
            kind: 'var',
            value: pattern.y.value});
    }

    if(projection.length === 0) {
        projection.push({"token": "variable", "kind": "*"});
        starProjection = true;
    }

    //console.log("COMPUTED PROJECTION");
    //console.log(projection);


    if(pattern.x.token === 'var' && pattern.y.token === 'var') {
        var bindings = this.executeAndBGP(projection, dataset, pattern.path, env);
        //console.log("BINDINGS "+bindings.length);
        //console.log(bindings);
        var acum = {};
        var results = [];
        var vx, intermediate, nextBinding, vxDenorm;
        var origVXName = pattern.x.value;
        var last = pattern.x;
        var nextPath = pattern.path;
        //console.log("VAR - VAR PATTERN");
        //console.log(nextPath.value);
        for(var i=0; i<bindings.length; i++) {
            vx = bindings[i][origVXName];
            if(acum[vx] == null) {
                vxDenorm = this.lexicon.retrieve(vx);
                pattern.x = vxDenorm;
                //console.log("REPLACING");
                //console.log(last);
                //console.log("BY");
                //console.log(vxDenorm);
                //console.log(nextPath.value);
                pattern.path = this.abstractQueryTree.replace(nextPath, last, vxDenorm, env);
                nextPath = Utils.clone(pattern.path);
                intermediate = this.executeZeroOrMorePath(pattern, dataset, env);
                for(var j=0; j<intermediate.length; j++) {
                    nextBinding = intermediate[j];
                    nextBinding[origVXName] = vx;
                    results.push(nextBinding)
                }
                last = vxDenorm;
            }
        }

        //console.log("RETURNING VAR - VAR");
        return results;
    } else if(pattern.x.token !== 'var' && pattern.y.token === 'var') {
        var finished;
        var acum = {};
        var initial = true;
        var pending = [];
        var bindings,nextBinding;
        var collected = [];
        var origVx = pattern.x;
        var last;

        while(initial == true || pending.length !== 0) {
            //console.log("-- Iteration");
            //console.log(pattern.path.value[0]);
            if(initial === true) {
                bindings = this.executeAndBGP(projection, dataset, pattern.path, env);
                //console.log("SAVING LAST");
                //console.log(pattern.x);
                last = pattern.x;
                initial = false;
            } else {
                var nextOid = pending.pop();
                //console.log("POPPING:"+nextOid);
                var value = this.lexicon.retrieve(nextOid);
                var path = pattern.path; //Utils.clone(pattern.path);
                //console.log(path.value[0]);
                //console.log("REPLACING");
                //console.log(last);
                //console.log("BY");
                //console.log(value);
                path = this.abstractQueryTree.replace(path, last, value, env);
                //console.log(path.value[0]);
                bindings = this.executeAndBGP(projection, dataset, path, env);
                last = value;
            }


            //console.log("BINDINGS!");
            //console.log(bindings);

            for(var i=0; i<bindings.length; i++) {
                //console.log(bindings[i][pattern.y.value])
                var value = bindings[i][pattern.y.value];
                //console.log("VALUE:"+value);
                if(acum[value] !== true) {
                    nextBinding = {};
                    nextBinding[pattern.y.value] = value;
                    collected.push(nextBinding);
                    acum[value] = true;
                    pending.push(value);
                }
            }
        }
        //console.log("RETURNING TERM - VAR");
        //console.log(collected);
        return collected;
    } else {
        throw "Kind of path not supported!";
    }
};
*/

QueryEngine.prototype.executeUNION = function(projection, dataset, patterns, env, callback) {
    var setQuery1 = patterns[0];
    var setQuery2 = patterns[1];
    var error = null;
    var set1,set2;


    if(patterns.length != 2) {
        throw("SPARQL algebra UNION with more than two components");
    }

    var that = this;
    async.seq(
        function(k){
            try {
                that.executeSelectUnit(projection, dataset, setQuery1, env, function (result) {
                    set1 = result;
                    k();
                });
            } catch(e) {
                error = e;
                k();
            }
        },
    function(k){
        if(error == null) {
            try {
                that.executeSelectUnit(projection, dataset, setQuery2, env, function (result) {
                    set2 = result;
                    k();
                });
            } catch(e) {
                error = e;
                k();
            }
        } else {
            k();
        }
    })(function(){
        if(error != null) {
            callback(error);
        } else {
            var result = QueryPlan.unionBindings(set1, set2);
            QueryFilters.checkFilters(patterns, result, false, dataset, env, that, callback);
        }
    });
};

QueryEngine.prototype.executeAndBGP = function(projection, dataset, patterns, env, callback) {
    var that = this;
    QueryPlan.executeAndBGPsDPSize(patterns.value, dataset, this, env, function(result){
        if(result!=null) {
            QueryFilters.checkFilters(patterns, result, false, dataset, env, that, callback);
        } else {
            callback(null);
        }
    });
};

QueryEngine.prototype.executeLEFT_JOIN = function(projection, dataset, patterns, env, callback) {
    var setQuery1 = patterns.lvalue;
    var setQuery2 = patterns.rvalue;

    var set1 = null;
    var set2 = null;
    var error = null;

    var that = this;
    var acum, duplicates;

    async.seq(
        function(k){
            try {
                that.executeSelectUnit(projection, dataset, setQuery1, env, function (result) {
                    set1 = result;
                    k();
                });
            } catch(e) {
                error = e;
                k();
            }
        },
        function(k){
            if(error != null) {
                k();
            } else {
                try {
                    that.executeSelectUnit(projection, dataset, setQuery2, env, function (result) {
                        set2 = result;
                        k();
                    });
                } catch(e) {
                    error = e;
                    k();
                }
            }
        })(
        function(){
            if(error != null) {
                callback(error);
            } else {
                var result = QueryPlan.leftOuterJoinBindings(set1, set2);
                QueryFilters.checkFilters(patterns, result, true, dataset, env, that, function(bindings){
                    if(set1.length>1 && set2.length>1) {
                        var vars = [];
                        var vars1 = {};
                        for(var p in set1[0]) {
                            vars1[p] = true;
                        }
                        for(p in set2[0]) {
                            if(vars1[p] != true) {
                                vars.push(p);
                            }
                        }
                        acum = [];
                        duplicates = {};
                        for(var i=0; i<bindings.length; i++) {
                            if(bindings[i]["__nullify__"] === true) {
                                for(var j=0; j<vars.length; j++) {
                                    bindings[i]["bindings"][vars[j]] = null;
                                }
                                var idx = [];
                                var idxColl = [];
                                for(var p in bindings[i]["bindings"]) {
                                    if(bindings[i]["bindings"][p] != null) {
                                        idx.push(p+bindings[i]["bindings"][p]);
                                        idx.sort();
                                        idxColl.push(idx.join(""));
                                    }
                                }
                                // reject duplicates -> (set union)
                                if(duplicates[idx.join("")]==null) {
                                    for(j=0; j<idxColl.length; j++) {
                                        //console.log(" - "+idxColl[j])
                                        duplicates[idxColl[j]] = true;
                                    }
                                    ////duplicates[idx.join("")]= true
                                    acum.push(bindings[i]["bindings"]);
                                }
                            } else {
                                acum.push(bindings[i]);
                                var idx = [];
                                var idxColl = [];
                                for(var p in bindings[i]) {
                                    idx.push(p+bindings[i][p]);
                                    idx.sort();
                                    //console.log(idx.join("") + " -> ok");
                                    duplicates[idx.join("")] = true;
                                }

                            }
                        }

                        callback(acum);
                    } else {
                        callback(bindings);
                    }
                });
            }
        });
};

QueryEngine.prototype.executeJOIN = function(projection, dataset, patterns, env, callback) {
    var setQuery1 = patterns.lvalue;
    var setQuery2 = patterns.rvalue;
    var set1 = null;
    var set2 = null;
    var error = null

    var that = this;

    async.seq(
        function(k){
            try {
                that.executeSelectUnit(projection, dataset, setQuery1, env, function (result) {
                    set1 = result;
                    k();
                });
            } catch(e) {
                error = e;
                k();
            }
        },
        function(k){
            if(error != null) {
                k();
            } else {
                try {
                    that.executeSelectUnit(projection, dataset, setQuery2, env, function (result) {
                        set2 = result;
                        k();
                    });
                } catch(e) {
                    error = e;
                    k();
                }
            }
        })(
        function(){
            var result = null;
            if(error != null) {
                callback(error);
            } else if(set1.length ===0 || set2.length===0) {
                callback([]);
            } else {
                var commonVarsTmp = {};
                var commonVars = [];

                for(var p in set1[0])
                    commonVarsTmp[p] = false;
                for(var p  in set2[0]) {
                    if(commonVarsTmp[p] === false)
                        commonVars.push(p);
                }

                if(commonVars.length == 0) {
                    result = QueryPlan.joinBindings(set1,set2);
                } else if(that.abstractQueryTree.treeWithUnion(setQuery1) ||
                    that.abstractQueryTree.treeWithUnion(setQuery2)) {
                    result = QueryPlan.joinBindings(set1,set2);
                } else {
                    result = QueryPlan.joinBindings2(commonVars, set1, set2);
                }
                QueryFilters.checkFilters(patterns, result, false, dataset, env, that, callback);
            }
        });
};


QueryEngine.prototype.rangeQuery = function(quad, queryEnv, callback) {
    var that = this;
    that.normalizeQuad(quad, queryEnv, false, function(key){
        if(key != null) {
            that.backend.range(new QuadIndex.Pattern(key), function(quads) {
                if(quads == null || quads.length == 0) {
                    callback([]);
                } else {
                    callback(quads);
                }
            });
        } else {
            callback(null);
        }
    });
};

// Update queries

QueryEngine.prototype.executeUpdate = function(syntaxTree, callback) {
    var prologue = syntaxTree.prologue;
    var units = syntaxTree.units;
    var that = this;

    // environment for the operation -> base ns, declared ns, etc.
    var queryEnv = {blanks:{}, outCache:{}};
    this.registerNsInEnvironment(prologue, queryEnv);
    for(var i=0; i<units.length; i++) {

        var aqt = that.abstractQueryTree.parseExecutableUnit(units[i]);
        if(aqt.kind === 'insertdata') {
            var error = null;
            async.eachSeries(aqt.quads, function(quad, k){
                if(error === null) {
                    that._executeQuadInsert(quad, queryEnv, function(err) {
                        if(err != null)
                            error = err;
                        k();
                    });
                } else {
                    k();
                }
            }, function(){
                if(error === null)
                    callback(null, true);
                else
                    callback(error);
            });
        } else if(aqt.kind === 'deletedata') {
            var error = null;
            async.eachSeries(aqt.quads, function(quad, k){
                if(error === null) {
                    that._executeQuadDelete(quad, queryEnv, function(err) {
                        if(err != null)
                            error = err;
                        k();
                    });
                } else {
                    k();
                }
            }, function(){
                if(error === null)
                    callback(null, true);
                else
                    callback(error);
            });
        } else if(aqt.kind === 'modify') {
            this._executeModifyQuery(aqt, queryEnv, callback);
        } else if(aqt.kind === 'create') {
            callback(true);
        } else if(aqt.kind === 'load') {
            var graph = {'uri': Utils.lexicalFormBaseUri(aqt.sourceGraph, queryEnv)};
            if(aqt.destinyGraph != null) {
                graph = {'uri': Utils.lexicalFormBaseUri(aqt.destinyGraph, queryEnv)};
            }
            var that = this;
            this.rdfLoader.load(aqt.sourceGraph.value, graph, function(err, result){
                if(err) {
                    callback(new Error("error batch loading quads"));
                } else {
                    that.batchLoad(result,function(result){
                        if(result !== null) {
                            callback(null, rsult);
                        } else {
                            callback(new Error("Error batch loading quads"));
                        }
                    });
                }
            });
        } else if(aqt.kind === 'drop') {
            this._executeClearGraph(aqt.destinyGraph, queryEnv, callback);
        } else if(aqt.kind === 'clear') {
            this._executeClearGraph(aqt.destinyGraph, queryEnv, callback);
        } else {
            throw new Error("not supported execution unit");
        }
    }
};

QueryEngine.prototype.batchLoad = function(quads, callback) {
    var counter = 0;
    var blanks = {};
    var that = this;

    if(this.eventsOnBatchLoad)
        this.callbacksBackend.startGraphModification();

    // subject
    var registerComponent = function(quad, component, newQuad, k) {
        var maybeBlankOid, oid, quad;

        if (quad[component]['uri'] || quad[component].token === 'uri') {
            var uriValue = (quad[component].uri || quad[component].value);
            that.lexicon.registerUri(uriValue, function(oid){
                var returnUriComponent = function(){
                    if (quad[component].uri != null) {
                        quad[component] = {'token': 'uri', 'value': quad[component].uri};
                        delete quad[component]['uri'];
                    }
                    newQuad[component] = oid;
                    k();
                };

                if(component === 'graph') {
                    that.lexicon.registerGraph(oid, uriValue, function(){
                        returnUriComponent();
                    });
                } else {
                    returnUriComponent();
                }
            });
        } else if (quad[component]['literal'] || quad[component].token === 'literal') {
            that.lexicon.registerLiteral(quad[component].literal || quad[component].value, function(oid){
                if (quad[component].literal != null) {
                    quad[component] = that.lexicon.parseLiteral(quad[component].literal);
                    delete quad[component]['literal'];
                }
                newQuad[component] = oid;
                k();
            });
        } else {
            maybeBlankOid = blanks[quad[component].blank || quad[component].value];
            if (maybeBlankOid == null) {
                that.lexicon.registerBlank(function(maybeBlankOid){
                    blanks[(quad[component].blank || quad[component].value)] = maybeBlankOid;

                    if (quad[component].token == null) {
                        quad[component].token = 'blank';
                        quad[component].value = quad[component].blank;
                        delete quad[component]['blank'];
                    }
                    newQuad[component] = maybeBlankOid;
                    k();
                });

            } else {
                if (quad[component].token == null) {
                    quad[component].token = 'blank';
                    quad[component].value = quad[component].blank;
                    delete quad[component]['blank'];
                }
                newQuad[component] = maybeBlankOid;
                k();
            }
        }

    };


    async.eachSeries(quads, function(quad,k){
        var newQuad = {};
        async.eachSeries(['subject','predicate','object','graph'], function(component,kk){
            registerComponent(quad, component, newQuad, kk)
        }, function(){
            var originalQuad = quad;
            quad = newQuad;
            var key = new QuadIndex.NodeKey(quad);

            that.backend.search(key, function(result){
                if(!result) {
                    that.backend.index(key, function(result){
                        if(result){
                            if(that.eventsOnBatchLoad)
                                that.callbacksBackend.nextGraphModification(Callbacks.added, [originalQuad,quad]);
                            counter = counter + 1;
                        }
                        k();
                    });
                } else {
                    k();
                }
            });

        });
    }, function(){
        if(that.lexicon.updateAfterWrite != null)
            that.lexicon.updateAfterWrite();

        var exitFn = function(){
            callback(counter);
        };

        if(that.eventsOnBatchLoad) {
            that.callbacksBackend.endGraphModification(exitFn());
        } else {
            exitFn();
        }
    });
};

// Low level operations for update queries

QueryEngine.prototype._executeModifyQuery = function(aqt, queryEnv, callback) {
    var that = this;
    var querySuccess = true;
    var error = new Error("Error executing modify query");
    var bindings = null;
    var components = ['subject', 'predicate', 'object', 'graph'];

    aqt.insert = aqt.insert == null ? [] : aqt.insert;
    aqt.delete = aqt.delete == null ? [] : aqt.delete;

    async.seq(
        function(k) {
            // select query

            var defaultGraph = [];
            var namedGraph = [];

            if(aqt.with != null) {
                defaultGraph.push(aqt.with);
            }

            if(aqt.using != null) {
                namedGraph = [];
                for(var i=0; i<aqt.using.length; i++) {
                    var usingGraph = aqt.using[i];
                    if(usingGraph.kind === 'named') {
                        namedGraph.push(usingGraph.uri);
                    } else {
                        defaultGraph.push(usingGraph.uri);
                    }
                }
            }

            aqt.dataset = {};
            aqt.projection = [{"token": "variable", "kind": "*"}];

            that.executeSelect(aqt, queryEnv, defaultGraph, namedGraph, function(err, result) {
                if(err) {
                    error = err
                    querySuccess = false;
                    return k();
                } else {
                    that.denormalizeBindingsList(result, queryEnv, function(result){
                        if(result!=null) {
                            bindings = result;
                        } else {
                            error = new Error("Error denormalizing bindings list");
                            querySuccess = false;
                        }
                        k();
                    });
                }
            });
        },function(k) {
            // delete query

            var defaultGraph = aqt.with;
            if(querySuccess) {
                var quads = [];
                for(var i=0; i<aqt.delete.length; i++) {
                    var src = aqt.delete[i];

                    for(var j=0; j<bindings.length; j++) {
                        var quad = {};
                        var binding = bindings[j];

                        for(var c=0; c<components.length; c++) {
                            var component = components[c];
                            if(component == 'graph' && src[component] == null) {
                                quad['graph'] = defaultGraph;
                            } else if(src[component].token === 'var') {
                                quad[component] = binding[src[component].value];
                            } else {
                                quad[component] = src[component];
                            }
                        }

                        quads.push(quad);
                    }
                }

                async.eachSeries(quads, function(quad,kk) {
                    that._executeQuadDelete(quad, queryEnv, function(){
                        kk();
                    });
                },function(){ k(); });
            } else {
                k();
            }
        },function(k) {
            // insert query
            var defaultGraph = aqt.with;

            if(querySuccess) {
                var quads = [];
                for(var i=0; i<aqt.insert.length; i++) {
                    var src = aqt.insert[i];

                    for(var j=0; j<bindings.length; j++) {
                        var quad = {};
                        var binding = bindings[j];

                        for(var c=0; c<components.length; c++) {
                            var component = components[c];
                            if(component == 'graph' && src[component] == null) {
                                quad['graph'] = defaultGraph;
                            } else if(src[component].token === 'var') {
                                quad[component] = binding[src[component].value];
                            } else {
                                quad[component] = src[component];
                            }
                        }

                        quads.push(quad);
                    }
                }

                async.eachSeries(quads, function(quad,kk) {
                    that._executeQuadInsert(quad, queryEnv, function(){
                        kk();
                    });
                },function(){ k(); });
            } else {
                k();
            }
        }
    )(function(){
        if(querySuccess)
            callback(null);
        else
            callback(error);
    });
};

QueryEngine.prototype._executeQuadInsert = function(quad, queryEnv, callback) {
    var that = this;
    var normalized;
    var error = false;
    var errorMessage = null;
    async.seq(
        function(k){
            that.normalizeQuad(quad, queryEnv, true, function(result){
                if(result != null){
                    normalized = result;
                } else {
                    error = true;
                    errorMessage = "Error normalizing quad.";
                }
                k();
            });
        },
        function(k){
            if(error === false) {
                var key = new QuadIndex.NodeKey(normalized);
                that.backend.search(key, function(found){
                    if(found === true){
                        k();
                    } else {
                        that.backend.index(key, function(){
                            that.callbacksBackend.nextGraphModification(Callbacks.added, [quad, normalized]);
                            k();
                        });
                    }
                });
            } else {
                k();
            }
        })(
        function(){
            if(error) {
                callback(new Error(errorMessage));
            } else {
                callback(null, true);
            }
        });
};

QueryEngine.prototype._executeQuadDelete = function(quad, queryEnv, callback) {
    var that = this;
    var normalized;
    var error = false;
    var errorMessage, key;
    async.seq(
        function(k){
            that.normalizeQuad(quad, queryEnv, true, function(result){
                if(result != null){
                    normalized = result;
                } else {
                    error = true;
                    errorMessage = "Error normalizing quad.";
                }
                k();
            });
        },
        function(k){
            if(error === false) {
                key = new QuadIndex.NodeKey(normalized);
                that.backend.delete(key, function(){
                        k();
                });
            } else {
                k();
            }
        },
        function(k){
            if(error === false) {
                that.lexicon.unregister(quad, key, function(){
                    that.callbacksBackend.nextGraphModification(Callbacks['deleted'], [quad, normalized]);
                    k();
                });
            } else {
                k();
            }
        })(
        function(){
            if(error) {
                callback(new Error(errorMessage));
            } else {
                callback(null, true);
            }
        });
};

QueryEngine.prototype._executeClearGraph = function(destinyGraph, queryEnv, callback) {
    var that = this;
    if(destinyGraph === 'default') {
        this.execute("DELETE { ?s ?p ?o } WHERE { ?s ?p ?o }", callback);
    } else if(destinyGraph === 'named') {
        that.lexicon.registeredGraphs(true, function(graphs){
            if(graphs!=null) {
                var foundErrorDeleting = false;
                async.eachSeries(graphs, function(graph,k){
                    if(!foundErrorDeleting) {
                        that.execute("DELETE { GRAPH <"+graph+"> { ?s ?p ?o } } WHERE { GRAPH <"+graph+"> { ?s ?p ?o } }", function(success, results){
                            foundErrorDeleting = !success;
                            k();
                        });
                    } else {
                        k();
                    }
                }, function(){
                    callback(!foundErrorDeleting);
                });
            } else {
                callback(false, "Error deleting named graphs");
            }
        });
    } else if(destinyGraph === 'all') {
        var that = this;
        this.execute("CLEAR DEFAULT", function(err, result) {
            if(!err) {
                that.execute("CLEAR NAMED", callback);
            } else {
                callback(false,result);
            }
        });
    } else {
        // destinyGraph is an URI
        if(destinyGraph.token == 'uri') {
            var graphUri = Utils.lexicalFormBaseUri(destinyGraph,queryEnv);
            if(graphUri != null) {
                this.callbacksBackend.ongoingModification = true;
                this.execute("DELETE { GRAPH <"+graphUri+"> { ?s ?p ?o } } WHERE { GRAPH <"+graphUri+"> { ?s ?p ?o } }", function(res){
                    that.callbacksBackend.ongoingModification = false;
                    callback(res);
                });
            } else {
                callback(false, "wrong graph URI");
            }
        } else {
            callback(false, "wrong graph URI");
        }
    }
};

QueryEngine.prototype.checkGroupSemantics = function(groupVars, projectionVars) {
    if(groupVars === 'singleGroup') {
        return true;
    }

    var projection = {};

    for(var i=0; i<groupVars.length; i++) {
        var groupVar = groupVars[i];
        if(groupVar.token === 'var') {
            projection[groupVar.value] = true;
        } else if(groupVar.token === 'aliased_expression') {
            projection[groupVar.alias.value] = true;
        }
    }

    for(i=0; i<projectionVars.length; i++) {
        var projectionVar = projectionVars[i];
        if(projectionVar.kind === 'var') {
            if(projection[projectionVar.value.value] == null) {
                return false;
            }
        } else if(projectionVar.kind === 'aliased' &&
            projectionVar.expression &&
            projectionVar.expression.primaryexpression === 'var') {
            if(projection[projectionVar.expression.value.value] == null) {
                return false;
            }
        }
    }

    return true;
};

QueryEngine.prototype.computeCosts = function (quads, env, callback) {
    for (var i = 0; i < quads.length; i++) {
        quads[i]['_cost'] = this.quadCost(quads[i], env);
    }

    callback(quads);
};

QueryEngine.prototype.quadCost = function(quad, env) {
    return 1;
};

QueryEngine.prototype.registerDefaultNamespace = function(ns, prefix) {
    this.defaultPrefixes[ns] = prefix;
};


module.exports = {
    QueryEngine: QueryEngine
};

},{"./abstract_query_tree":37,"./graph_callbacks":40,"./quad_index":48,"./query_filters":50,"./query_plan":51,"./rdf_loader":52,"./rdf_model":53,"./utils":55}],50:[function(_dereq_,module,exports){
var Utils = _dereq_('./utils');
var     _ = Utils;
var async = _dereq_('./utils');

QueryFilters = {};

var xmlSchema = "http://www.w3.org/2001/XMLSchema#";

QueryFilters.checkFilters = function(pattern, bindings, nullifyErrors, dataset, queryEnv, queryEngine, callback) {

    var filters = [];
    if (pattern.filter && typeof(pattern.filter) !== 'function')
        filters = pattern.filter;
    var nullified = [];
    if(filters==null || filters.length === 0 || pattern.length != null) {
        return callback(bindings);
    }

    async.eachSeries(filters, function(filter,k){
        QueryFilters.run(filter.value, bindings, nullifyErrors, dataset, queryEnv, queryEngine, function(filteredBindings){
            var acum = [];
            async.eachSeries(filteredBindings, function(filteredBinding,kk) {
                if(filteredBinding["__nullify__"]!=null) {
                    nullified.push(filteredBinding);
                } else {
                    acum.push(filteredBinding);
                }
                kk();
            },function(){
                bindings = acum;
                k();
            })
        });
    },function(){
        callback(bindings.concat(nullified))
    });
};

QueryFilters.boundVars = function(filterExpr) {
    if(filterExpr.expressionType != null) {
        var expressionType = filterExpr.expressionType;
        if(expressionType == 'relationalexpression') {
            var op1 = filterExpr.op1;
            var op2 = filterExpr.op2;
            return QueryFilters.boundVars(op1)+QueryFilters.boundVars(op2);
        } else if(expressionType == 'conditionalor' || expressionType == 'conditionaland') {
            var vars = [];
            for(var i=0; i< filterExpr.operands; i++) {
                vars = vars.concat(QueryFilters.boundVars(filterExpr.operands[i]));
            }
            return vars;
        } else if(expressionType == 'builtincall') {
            if(filterExpr.args == null) {
                return [];
            } else {
                var acum = [];
                for(var i=0; i< filterExpr.args.length; i++) {
                    acum = acum.concat(QueryFilters.boundVars(filterExpr.args[i]));
                }
                return acum;
            }
        } else if(expressionType == 'multiplicativeexpression') {
            var acum = QueryFilters.boundVars(filterExpr.factor);
            for(var i=0; i<filterExpr.factors.length; i++) {
                acum = acum.concat(QueryFilters.boundVars(filterExpr.factors[i].expression))
            }
            return acum;
        } else if(expressionType == 'additiveexpression') {
            var acum = QueryFilters.boundVars(filterExpr.summand);
            for(var i=0; i<filterExpr.summands.length; i++) {
                acum = acum.concat(QueryFilters.boundVars(filterExpr.summands[i].expression));
            }

            return acum;
        } else if(expressionType == 'regex') {
            var acum = QueryFilters.boundVars(filterExpr.expression1);
            return acum.concat(QueryFilters.boundVars(filterExpr.expression2));
        } else if(expressionType == 'unaryexpression') {
            return QueryFilters.boundVars(filterExpr.expression);
        } else if(expressionType == 'atomic') {
            if(filterExpr.primaryexpression == 'var') {
                return [filterExpr.value];
            } else {
                // numeric, literal, etc...
                return [];
            }
        }
    } else {
        console.log("ERROR");
        console.log(filterExpr);
        throw("Cannot find bound expressions in a no expression token");
    }
};

QueryFilters.run = function(filterExpr, bindings, nullifyFilters, dataset, env, queryEngine, callback) {
    queryEngine.copyDenormalizedBindings(bindings, env.outCache, function(denormBindings){
        var filteredBindings = [];
        for(var i=0; i<bindings.length; i++) {
            var thisDenormBindings = denormBindings[i];
            var ebv = QueryFilters.runFilter(filterExpr, thisDenormBindings, queryEngine, dataset, env);
            // ebv can be directly a RDFTerm (e.g. atomic expression in filter)
            // this additional call to ebv will return -> true/false/error
            var ebv = QueryFilters.ebv(ebv);
            //console.log("EBV:")
            //console.log(ebv)
            //console.log("FOR:")
            //console.log(thisDenormBindings)
            if(QueryFilters.isEbvError(ebv)) {
                // error
                if(nullifyFilters) {
                    var thisBindings = {"__nullify__": true, "bindings": bindings[i]};
                    filteredBindings.push(thisBindings);
                }
            } else if(ebv === true) {
                // true
                filteredBindings.push(bindings[i]);
            } else {
                // false
                if(nullifyFilters) {
                    var thisBindings = {"__nullify__": true, "bindings": bindings[i]};
                    filteredBindings.push(thisBindings);
                }
            }
        }
        callback(filteredBindings);
    });
};

QueryFilters.collect = function(filterExpr, bindings, dataset, env, queryEngine, callback) {
    queryEngine.copyDenormalizedBindings(bindings, env.outCache, function(denormBindings) {
        var filteredBindings = [];
        for(var i=0; i<denormBindings.length; i++) {
            var thisDenormBindings = denormBindings[i];
            var ebv = QueryFilters.runFilter(filterExpr, thisDenormBindings, queryEngine, dataset, env);
            filteredBindings.push({binding:bindings[i], value:ebv});
        }
        return callback(filteredBindings);
    });
};

QueryFilters.runDistinct = function(projectedBindings, projectionVariables) {
};

// @todo add more aggregation functions here
QueryFilters.runAggregator = function(aggregator, bindingsGroup, queryEngine, dataset, env) {
    if(bindingsGroup == null || bindingsGroup.length === 0) {
        return QueryFilters.ebvError();
    } else if(aggregator.token === 'variable' && aggregator.kind == 'var') {
        return bindingsGroup[0][aggregator.value.value];
    } else if(aggregator.token === 'variable' && aggregator.kind === 'aliased') {
        if(aggregator.expression.expressionType === 'atomic' && aggregator.expression.primaryexpression === 'var') {
            return bindingsGroup[0][aggregator.expression.value.value];
        } else if(aggregator.expression.expressionType === 'aggregate') {
            if(aggregator.expression.aggregateType === 'max') {
                var max = null;
                for(var i=0; i< bindingsGroup.length; i++) {
                    var bindings = bindingsGroup[i];
                    var ebv = QueryFilters.runFilter(aggregator.expression.expression, bindings, queryEngine, dataset, env);
                    if(!QueryFilters.isEbvError(ebv)) {
                        if(max === null) {
                            max = ebv;
                        } else {
                            if(QueryFilters.runLtFunction(max, ebv).value === true) {
                                max = ebv;
                            }
                        }
                    }
                }

                if(max===null) {
                    return QueryFilters.ebvError();
                } else {
                    return max;
                }
            } else if(aggregator.expression.aggregateType === 'min') {
                var min = null;
                for(var i=0; i< bindingsGroup.length; i++) {
                    var bindings = bindingsGroup[i];
                    var ebv = QueryFilters.runFilter(aggregator.expression.expression, bindings, queryEngine, dataset, env);
                    if(!QueryFilters.isEbvError(ebv)) {
                        if(min === null) {
                            min = ebv;
                        } else {
                            if(QueryFilters.runGtFunction(min, ebv).value === true) {
                                min = ebv;
                            }
                        }
                    }
                }

                if(min===null) {
                    return QueryFilters.ebvError();
                } else {
                    return min;
                }
            } else if(aggregator.expression.aggregateType === 'count') {
                var distinct = {};
                var count = 0;
                if(aggregator.expression.expression === '*') {
                    if(aggregator.expression.distinct != null && aggregator.expression.distinct != '') {
                        for(var i=0; i< bindingsGroup.length; i++) {
                            var bindings = bindingsGroup[i];
                            var key = Utils.hashTerm(bindings);
                            if(distinct[key] == null) {
                                distinct[key] = true;
                                count++;
                            }
                        }
                    } else {
                        count = bindingsGroup.length;
                    }
                } else {
                    for(var i=0; i< bindingsGroup.length; i++) {
                        var bindings = bindingsGroup[i];
                        var ebv = QueryFilters.runFilter(aggregator.expression.expression, bindings, queryEngine, dataset, env);
                        if(!QueryFilters.isEbvError(ebv)) {
                            if(aggregator.expression.distinct != null && aggregator.expression.distinct != '') {
                                var key = Utils.hashTerm(ebv);
                                if(distinct[key] == null) {
                                    distinct[key] = true;
                                    count++;
                                }
                            } else {
                                count++;
                            }
                        }
                    }
                }

                return {token: 'literal', type:xmlSchema+"integer", value:''+count};
            } else if(aggregator.expression.aggregateType === 'avg') {
                var distinct = {};
                var aggregated = {token: 'literal', type:xmlSchema+"integer", value:'0'};
                var count = 0;
                for(var i=0; i< bindingsGroup.length; i++) {
                    var bindings = bindingsGroup[i];
                    var ebv = QueryFilters.runFilter(aggregator.expression.expression, bindings, queryEngine, dataset, env);
                    if(!QueryFilters.isEbvError(ebv)) {
                        if(aggregator.expression.distinct != null && aggregator.expression.distinct != '') {
                            var key = Utils.hashTerm(ebv);
                            if(distinct[key] == null) {
                                distinct[key] = true;
                                if(QueryFilters.isNumeric(ebv)) {
                                    aggregated = QueryFilters.runSumFunction(aggregated, ebv);
                                    count++;
                                }
                            }
                        } else {
                            if(QueryFilters.isNumeric(ebv)) {
                                aggregated = QueryFilters.runSumFunction(aggregated, ebv);
                                count++;
                            }
                        }
                    }
                }

                var result = QueryFilters.runDivFunction(aggregated, {token: 'literal', type:xmlSchema+"integer", value:''+count});
                result.value = ''+result.value;
                return result;
            } else if(aggregator.expression.aggregateType === 'sum') {
                var distinct = {};
                var aggregated = {token: 'literal', type:xmlSchema+"integer", value:'0'};
                for(var i=0; i< bindingsGroup.length; i++) {
                    var bindings = bindingsGroup[i];
                    var ebv = QueryFilters.runFilter(aggregator.expression.expression, bindings, queryEngine, dataset, env);
                    if(!QueryFilters.isEbvError(ebv)) {
                        if(aggregator.expression.distinct != null && aggregator.expression.distinct != '') {
                            var key = Utils.hashTerm(ebv);
                            if(distinct[key] == null) {
                                distinct[key] = true;
                                if(QueryFilters.isNumeric(ebv)) {
                                    aggregated = QueryFilters.runSumFunction(aggregated, ebv);
                                }
                            }
                        } else {
                            if(QueryFilters.isNumeric(ebv)) {
                                aggregated = QueryFilters.runSumFunction(aggregated, ebv);
                            }
                        }
                    }
                }

                aggregated.value =''+aggregated.value;
                return aggregated;
            } else {
                var ebv = QueryFilters.runFilter(aggregate.expression, bindingsGroup[0], dataset, {blanks:{}, outCache:{}});
                return ebv;
            }
        }
    }
};

QueryFilters.runFilter = function(filterExpr, bindings, queryEngine, dataset, env) {
    //console.log("RUNNING FILTER");
    //console.log(filterExpr);
    if(filterExpr.expressionType != null) {
        var expressionType = filterExpr.expressionType;
        if(expressionType == 'relationalexpression') {
            var op1 = QueryFilters.runFilter(filterExpr.op1, bindings,queryEngine, dataset, env);
            var op2 = QueryFilters.runFilter(filterExpr.op2, bindings,queryEngine, dataset, env);
            return QueryFilters.runRelationalFilter(filterExpr, op1, op2, bindings, queryEngine, dataset, env);
        } else if(expressionType == 'conditionalor') {
            return QueryFilters.runOrFunction(filterExpr, bindings, queryEngine, dataset, env);
        } else if (expressionType == 'conditionaland') {
            return QueryFilters.runAndFunction(filterExpr, bindings, queryEngine, dataset, env);
        } else if(expressionType == 'additiveexpression') {
            return QueryFilters.runAddition(filterExpr.summand, filterExpr.summands, bindings, queryEngine, dataset, env);
        } else if(expressionType == 'builtincall') {
            return QueryFilters.runBuiltInCall(filterExpr.builtincall, filterExpr.args, bindings, queryEngine, dataset, env);
        } else if(expressionType == 'multiplicativeexpression') {
            return QueryFilters.runMultiplication(filterExpr.factor, filterExpr.factors, bindings, queryEngine, dataset, env);
        } else if(expressionType == 'unaryexpression') {
            return QueryFilters.runUnaryExpression(filterExpr.unaryexpression, filterExpr.expression, bindings, queryEngine, dataset, env);
        } else if(expressionType == 'irireforfunction') {
            return QueryFilters.runIriRefOrFunction(filterExpr.iriref, filterExpr.args, bindings, queryEngine, dataset, env);
        } else if(expressionType == 'regex') {
            return QueryFilters.runRegex(filterExpr.text, filterExpr.pattern, filterExpr.flags, bindings, queryEngine, dataset, env)
        } else if(expressionType == 'custom') {
            return QueryFilters.runBuiltInCall(filterExpr.name, filterExpr.args, bindings, queryEngine, dataset, env);
        } else if(expressionType == 'atomic') {
            if(filterExpr.primaryexpression == 'var') {
                // lookup the var in the bindings
                return bindings[filterExpr.value.value];
            } else {
                // numeric, literal, etc...
                //return queryEngine.filterExpr.value;
                if(typeof(filterExpr.value) != 'object') {
                    return filterExpr.value
                } else {
                    if(filterExpr.value.type == null || typeof(filterExpr.value.type) != 'object') {
                        return filterExpr.value
                    } else {
                        // type can be parsed as a hash using namespaces

                        filterExpr.value.type =  Utils.lexicalFormBaseUri(filterExpr.value.type, env);
                        return filterExpr.value
                    }
                }
            }
        } else {
            throw("Unknown filter expression type");
        }
    } else {
        throw("Cannot find bound expressions in a no expression token");
    }
};

QueryFilters.isRDFTerm = function(val) {
    if(val==null) {
        return false;
    } if((val.token && val.token == 'literal') ||
        (val.token && val.token == 'uri') ||
        (val.token && val.token == 'blank')) {
        return true;
    } else {
        return false;
    }
};


/*
 17.4.1.7 RDFterm-equal

 xsd:boolean   RDF term term1 = RDF term term2

 Returns TRUE if term1 and term2 are the same RDF term as defined in Resource Description Framework (RDF):
 Concepts and Abstract Syntax [CONCEPTS]; produces a type error if the arguments are both literal but are not
 the same RDF term *; returns FALSE otherwise. term1 and term2 are the same if any of the following is true:

 term1 and term2 are equivalent IRIs as defined in 6.4 RDF URI References of [CONCEPTS].
 term1 and term2 are equivalent literals as defined in 6.5.1 Literal Equality of [CONCEPTS].
 term1 and term2 are the same blank node as described in 6.6 Blank Nodes of [CONCEPTS].
 */
QueryFilters.RDFTermEquality = function(v1, v2, queryEngine, env) {
    if(v1.token === 'literal' && v2.token === 'literal') {
        if(v1.lang == v2.lang && v1.type == v2.type && v1.value == v2.value) {

            return true;
        } else {


            if(v1.type != null && v2.type != null) {
                return  QueryFilters.ebvError();
            } else if(QueryFilters.isSimpleLiteral(v1) && v2.type!=null){
                return QueryFilters.ebvError();
            } else if(QueryFilters.isSimpleLiteral(v2) && v1.type!=null){
                return QueryFilters.ebvError();
            } else {
                return false;
            }

//            if(v1.value != v2.value) {
//                return QueryFilters.ebvError();
//            } else if(v1.type && v2.type && v1.type!=v2.type) {
//                return QueryFilters.ebvError();
//            } else if(QueryFilters.isSimpleLiteral(v1) && v2.type!=null){
//                return QueryFilters.ebvError();
//            } else if(QueryFilters.isSimpleLiteral(v2) && v1.type!=null){
//                return QueryFilters.ebvError();
//            } else {
//                return false;
//            }

        }
    } else if(v1.token === 'uri' && v2.token === 'uri') {
        return Utils.lexicalFormBaseUri(v1, env) == Utils.lexicalFormBaseUri(v2, env);
    } else if(v1.token === 'blank' && v2.token === 'blank') {
        return v1.value == v2.value;
    } else {
        return false;
    }
};


QueryFilters.isInteger = function(val) {
    if(val == null) {
        return false;
    }
    if(val.token === 'literal') {
        if(val.type == xmlSchema+"integer" ||
            val.type == xmlSchema+"decimal" ||
            val.type == xmlSchema+"double" ||
            val.type == xmlSchema+"nonPositiveInteger" ||
            val.type == xmlSchema+"negativeInteger" ||
            val.type == xmlSchema+"long" ||
            val.type == xmlSchema+"int" ||
            val.type == xmlSchema+"short" ||
            val.type == xmlSchema+"byte" ||
            val.type == xmlSchema+"nonNegativeInteger" ||
            val.type == xmlSchema+"unsignedLong" ||
            val.type == xmlSchema+"unsignedInt" ||
            val.type == xmlSchema+"unsignedShort" ||
            val.type == xmlSchema+"unsignedByte" ||
            val.type == xmlSchema+"positiveInteger" ) {
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
};

QueryFilters.isFloat = function(val) {
    if(val == null) {
        return false;
    }
    if(val.token === 'literal') {
        if(val.type == xmlSchema+"float") {
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
};

QueryFilters.isDecimal = function(val) {
    if(val == null) {
        return false;
    }
    if(val.token === 'literal') {
        if(val.type == xmlSchema+"decimal") {
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
};

QueryFilters.isDouble = function(val) {
    if(val == null) {
        return false;
    }
    if(val.token === 'literal') {
        if(val.type == xmlSchema+"double") {
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
};


QueryFilters.isNumeric = function(val) {
    if(val == null) {
        return false;
    }
    if(val.token === 'literal') {
        if(val.type == xmlSchema+"integer" ||
            val.type == xmlSchema+"decimal" ||
            val.type == xmlSchema+"float" ||
            val.type == xmlSchema+"double" ||
            val.type == xmlSchema+"nonPositiveInteger" ||
            val.type == xmlSchema+"negativeInteger" ||
            val.type == xmlSchema+"long" ||
            val.type == xmlSchema+"int" ||
            val.type == xmlSchema+"short" ||
            val.type == xmlSchema+"byte" ||
            val.type == xmlSchema+"nonNegativeInteger" ||
            val.type == xmlSchema+"unsignedLong" ||
            val.type == xmlSchema+"unsignedInt" ||
            val.type == xmlSchema+"unsignedShort" ||
            val.type == xmlSchema+"unsignedByte" ||
            val.type == xmlSchema+"positiveInteger" ) {
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
};

QueryFilters.isSimpleLiteral = function(val) {
    if(val && val.token == 'literal') {
        if(val.type == null && val.lang == null) {
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
};

QueryFilters.isXsdType = function(type, val) {
    if(val && val.token == 'literal') {
        return val.type == xmlSchema+""+type;
    } else {
        return false;
    }
};

QueryFilters.ebv = function (term) {
    if (term == null || QueryFilters.isEbvError(term)) {
        return QueryFilters.ebvError();
    } else {
        if (term.token && term.token === 'literal') {
            if (term.type == xmlSchema+"integer" ||
                term.type == xmlSchema+"decimal" ||
                term.type == xmlSchema+"double" ||
                term.type == xmlSchema+"nonPositiveInteger" ||
                term.type == xmlSchema+"negativeInteger" ||
                term.type == xmlSchema+"long" ||
                term.type == xmlSchema+"int" ||
                term.type == xmlSchema+"short" ||
                term.type == xmlSchema+"byte" ||
                term.type == xmlSchema+"nonNegativeInteger" ||
                term.type == xmlSchema+"unsignedLong" ||
                term.type == xmlSchema+"unsignedInt" ||
                term.type == xmlSchema+"unsignedShort" ||
                term.type == xmlSchema+"unsignedByte" ||
                term.type == xmlSchema+"positiveInteger") {
                var tmp = parseFloat(term.value);
                if (isNaN(tmp)) {
                    return false;
                } else {
                    return parseFloat(term.value) != 0;
                }
            } else if (term.type === xmlSchema+"boolean") {
                return (term.value === 'true' || term.value === true || term.value === 'True');
            } else if (term.type === xmlSchema+"string") {
                return term.value != "";
            } else if (term.type === xmlSchema+"dateTime") {
                return (new Date(term.value)) != null;
            } else if (QueryFilters.isEbvError(term)) {
                return term;
            } else if (term.type == null) {
                if (term.value != "") {
                    return true;
                } else {
                    return false;
                }
            } else {
                return QueryFilters.ebvError();
            }
        } else {
            return term.value === true;
        }
    }
};

QueryFilters.effectiveBooleanValue = QueryFilters.ebv;

QueryFilters.ebvTrue = function() {
    var val = {token: 'literal', type:xmlSchema+"boolean", value:true};
    return val;
};

QueryFilters.ebvFalse = function() {
    var val = {token: 'literal', type:xmlSchema+"boolean", value:false};
    return val;
};

QueryFilters.ebvError = function() {
    var val = {token: 'literal', type:"https://github.com/antoniogarrote/js-tools/types#error", value:null};
    return val;
};

QueryFilters.isEbvError = function(term) {
    if(typeof(term) == 'object' && term != null) {
        return term.type === "https://github.com/antoniogarrote/js-tools/types#error";
//    } else if(term == null) {
//        return true;
    } else {
        return false;
    }
};

QueryFilters.ebvBoolean = function (bool) {
    if (QueryFilters.isEbvError(bool)) {
        return bool;
    } else {
        if (bool === true) {
            return QueryFilters.ebvTrue();
        } else {
            return QueryFilters.ebvFalse();
        }
    }
};


QueryFilters.runRelationalFilter = function(filterExpr, op1, op2, bindings, queryEngine, dataset, env) {
    var operator = filterExpr.operator;
    if(operator === '=') {
        return QueryFilters.runEqualityFunction(op1, op2, bindings, queryEngine, dataset, env);
    } else if(operator === '!=') {
        var res = QueryFilters.runEqualityFunction(op1, op2, bindings, queryEngine, dataset, env);
        if(QueryFilters.isEbvError(res)) {
            return res;
        } else {
            res.value = !res.value;
            return res;
        }
    } else if(operator === '<') {
        return QueryFilters.runLtFunction(op1, op2, bindings);
    } else if(operator === '>') {
        return QueryFilters.runGtFunction(op1, op2, bindings);
    } else if(operator === '<=') {
        return QueryFilters.runLtEqFunction(op1, op2, bindings);
    } else if(operator === '>=') {
        return QueryFilters.runGtEqFunction(op1, op2, bindings);
    } else {
        throw("Error applying relational filter, unknown operator");
    }
};

/**
 * Transforms a JS object representing a [typed] literal in a javascript
 * value that can be used in javascript operations and functions
 */
QueryFilters.effectiveTypeValue = function(val){
    if(val.token == 'literal') {
        if(val.type == xmlSchema+"integer") {
            var tmp = parseInt(val.value);
            //if(isNaN(tmp)) {
            //    return false;
            //} else {
            return tmp;
            //}
        } else if(val.type == xmlSchema+"decimal") {
            var tmp = parseFloat(val.value);
            //if(isNaN(tmp)) {
            //    return false;
            //} else {
            return tmp;
            //}
        } else if (val.type == xmlSchema+"float") {
            var tmp = parseFloat(val.value);
            //if(isNaN(tmp)) {
            //    return false;
            //} else {
            return tmp;
            //}
        } else if (val.type == xmlSchema+"double") {
            var tmp = parseFloat(val.value);
            //if(isNaN(tmp)) {
            //    return false;
            //} else {
            return tmp;
            //}
        } else if (val.type == xmlSchema+"nonPositiveInteger") {
            var tmp = parseFloat(val.value);
            //if(isNaN(tmp)) {
            //    return false;
            //} else {
            return tmp;
            //}
        } else if (val.type == xmlSchema+"negativeInteger") {
            var tmp = parseInt(val.value);
            //if(isNaN(tmp)) {
            //    return false;
            //} else {
            return tmp;
            //}
        } else if (val.type == xmlSchema+"long") {
            var tmp = parseInt(val.value);
            //if(isNaN(tmp)) {
            //    return false;
            //} else {
            return tmp;
            //}
        } else if (val.type == xmlSchema+"int") {
            var tmp = parseInt(val.value);
            //if(isNaN(tmp)) {
            //    return false;
            //} else {
            return tmp;
            //}
        } else if (val.type == xmlSchema+"short") {
            var tmp = parseInt(val.value);
            //if(isNaN(tmp)) {
            //    return false;
            //} else {
            return tmp;
            //}
        } else if (val.type == xmlSchema+"byte") {
            var tmp = parseInt(val.value);
            //if(isNaN(tmp)) {
            //    return false;
            //} else {
            return tmp;
            //}
        } else if (val.type == xmlSchema+"nonNegativeInteger") {
            var tmp = parseInt(val.value);
            //if(isNaN(tmp)) {
            //    return false;
            //} else {
            return tmp;
            //}
        } else if (val.type == xmlSchema+"unsignedLong") {
            var tmp = parseInt(val.value);
            //if(isNaN(tmp)) {
            //    return false;
            //} else {
            return tmp;
            //}
        } else if (val.type == xmlSchema+"unsignedInt") {
            var tmp = parseInt(val.value);
            //if(isNaN(tmp)) {
            //    return false;
            //} else {
            return tmp;
            //}
        } else if (val.type == xmlSchema+"unsignedShort") {
            var tmp = parseInt(val.value);
            //if(isNaN(tmp)) {
            //    return false;
            //} else {
            return tmp;
            //}
        } else if (val.type == xmlSchema+"unsignedByte") {
            var tmp = parseInt(val.value);
            //if(isNaN(tmp)) {
            //    return false;
            //} else {
            return tmp;
            //}
        } else if (val.type == xmlSchema+"positiveInteger" ) {
            var tmp = parseInt(val.value);
            //if(isNaN(tmp)) {
            //    return false;
            //} else {
            return tmp;
            //}
        } else if (val.type == xmlSchema+"date" ||
            val.type == xmlSchema+"dateTime" ) {
            try {
                var d = Utils.parseISO8601(val.value);
                return(d);
            } catch(e) {
                return null;
            }
        } else if (val.type == xmlSchema+"boolean" ) {
            return val.value === true || val.value === 'true' || val.value === '1' || val.value === 1 || val.value === true ? true :
                val.value === false || val.value === 'false' || val.value === '0' || val.value === 0 || val.value === false ? false :
                    undefined;
        } else if (val.type == xmlSchema+"string" ) {
            return val.value === null || val.value === undefined ? undefined : ''+val.value;
        } else if (val.type == null) {
            // plain literal -> just manipulate the string
            return val.value;
        } else {
            return val.value
        }
    } else {
        // @todo
        console.log("not implemented yet");
        console.log(val);
        throw("value not supported in operations yet");
    }
};

/*
 A logical-or that encounters an error on only one branch will return TRUE if the other branch is TRUE and an error if the other branch is FALSE.
 A logical-or or logical-and that encounters errors on both branches will produce either of the errors.
 */
QueryFilters.runOrFunction = function(filterExpr, bindings, queryEngine, dataset, env) {

    var acum = null;

    for(var i=0; i< filterExpr.operands.length; i++) {
        var ebv = QueryFilters.runFilter(filterExpr.operands[i], bindings, queryEngine, dataset, env);
        if(QueryFilters.isEbvError(ebv) == false) {
            ebv = QueryFilters.ebv(ebv);
        }
        if(acum == null) {
            acum = ebv;
        } else if(QueryFilters.isEbvError(ebv)) {
            if(QueryFilters.isEbvError(acum)) {
                acum = QueryFilters.ebvError();
            } else if(acum === true) {
                acum = true;
            } else {
                acum = QueryFilters.ebvError();
            }
        } else if(ebv === true) {
            acum = true;
        } else {
            if(QueryFilters.isEbvError(acum)) {
                acum = QueryFilters.ebvError();
            }
        }
    }

    return QueryFilters.ebvBoolean(acum);
};

/*
 A logical-and that encounters an error on only one branch will return an error if the other branch is TRUE and FALSE if the other branch is FALSE.
 A logical-or or logical-and that encounters errors on both branches will produce either of the errors.
 */
QueryFilters.runAndFunction = function(filterExpr, bindings, queryEngine, dataset, env) {

    var acum = null;

    for(var i=0; i< filterExpr.operands.length; i++) {

        var ebv = QueryFilters.runFilter(filterExpr.operands[i], bindings, queryEngine, dataset, env);

        if(QueryFilters.isEbvError(ebv) == false) {
            ebv = QueryFilters.ebv(ebv);
        }

        if(acum == null) {
            acum = ebv;
        } else if(QueryFilters.isEbvError(ebv)) {
            if(QueryFilters.isEbvError(acum)) {
                acum = QueryFilters.ebvError();
            } else if(acum === true) {
                acum = QueryFilters.ebvError();
            } else {
                acum = false;
            }
        } else if(ebv === true) {
            if(QueryFilters.isEbvError(acum)) {
                acum = QueryFilters.ebvError();
            }
        } else {
            acum = false;
        }
    }

    return QueryFilters.ebvBoolean(acum);
};


QueryFilters.runEqualityFunction = function(op1, op2, bindings, queryEngine, dataset, env) {
    if(QueryFilters.isEbvError(op1) || QueryFilters.isEbvError(op2)) {
        return QueryFilters.ebvError();
    }
    if(QueryFilters.isNumeric(op1) && QueryFilters.isNumeric(op2)) {
        var eop1 = QueryFilters.effectiveTypeValue(op1);
        var eop2 = QueryFilters.effectiveTypeValue(op2);
        if(isNaN(eop1) || isNaN(eop2)) {
            return QueryFilters.ebvBoolean(QueryFilters.RDFTermEquality(op1, op2, queryEngine, env));
        } else {
            return QueryFilters.ebvBoolean(eop1 == eop2);
        }
    } else if((QueryFilters.isSimpleLiteral(op1) || QueryFilters.isXsdType("string", op1)) &&
        (QueryFilters.isSimpleLiteral(op2) || QueryFilters.isXsdType("string", op2))) {
        return QueryFilters.ebvBoolean(QueryFilters.effectiveTypeValue(op1) == QueryFilters.effectiveTypeValue(op2));
    } else if(QueryFilters.isXsdType("boolean", op1) && QueryFilters.isXsdType("boolean", op2)) {
        return QueryFilters.ebvBoolean(QueryFilters.effectiveTypeValue(op1) == QueryFilters.effectiveTypeValue(op2));
    } else if((QueryFilters.isXsdType("dateTime", op1)||QueryFilters.isXsdType("date", op1)) && (QueryFilters.isXsdType("dateTime", op2)||QueryFilters.isXsdType("date", op2))) {
        if(QueryFilters.isXsdType("dateTime", op1) && QueryFilters.isXsdType("date", op2)) {
            return QueryFilters.ebvFalse();
        }
        if(QueryFilters.isXsdType("date", op1) && QueryFilters.isXsdType("dateTime", op2)) {
            return QueryFilters.ebvFalse();
        }

        var comp = Utils.compareDateComponents(op1.value, op2.value);
        if(comp != null) {
            if(comp == 0) {
                return QueryFilters.ebvTrue();
            } else {
                return QueryFilters.ebvFalse();
            }
        } else {
            return QueryFilters.ebvError();
        }
    } else if(QueryFilters.isRDFTerm(op1) && QueryFilters.isRDFTerm(op2)) {
        return QueryFilters.ebvBoolean(QueryFilters.RDFTermEquality(op1, op2, queryEngine, env));
    } else {
        return QueryFilters.ebvFalse();
    }
};

QueryFilters.runGtFunction = function(op1, op2, bindings) {
    if(QueryFilters.isEbvError(op1) || QueryFilters.isEbvError(op2)) {
        return QueryFilters.ebvError();
    }

    if(QueryFilters.isNumeric(op1) && QueryFilters.isNumeric(op2)) {
        return QueryFilters.ebvBoolean(QueryFilters.effectiveTypeValue(op1) > QueryFilters.effectiveTypeValue(op2));
    } else if(QueryFilters.isSimpleLiteral(op1) && QueryFilters.isSimpleLiteral(op2)) {
        return QueryFilters.ebvBoolean(QueryFilters.effectiveTypeValue(op1) > QueryFilters.effectiveTypeValue(op2));
    } else if(QueryFilters.isXsdType("string", op1) && QueryFilters.isXsdType("string", op2)) {
        return QueryFilters.ebvBoolean(QueryFilters.effectiveTypeValue(op1) > QueryFilters.effectiveTypeValue(op2));
    } else if(QueryFilters.isXsdType("boolean", op1) && QueryFilters.isXsdType("boolean", op2)) {
        return QueryFilters.ebvBoolean(QueryFilters.effectiveTypeValue(op1) > QueryFilters.effectiveTypeValue(op2));
    } else if((QueryFilters.isXsdType("dateTime", op1) || QueryFilters.isXsdType("date", op1)) &&
        (QueryFilters.isXsdType("dateTime", op2) || QueryFilters.isXsdType("date", op2))) {
        if(QueryFilters.isXsdType("dateTime", op1) && QueryFilters.isXsdType("date", op2)) {
            return QueryFilters.ebvFalse();
        }
        if(QueryFilters.isXsdType("date", op1) && QueryFilters.isXsdType("dateTime", op2)) {
            return QueryFilters.ebvFalse();
        }

        var comp = Utils.compareDateComponents(op1.value, op2.value);
        if(comp != null) {
            if(comp == 1) {
                return QueryFilters.ebvTrue();
            } else {
                return QueryFilters.ebvFalse();
            }
        } else {
            return QueryFilters.ebvError();
        }
    } else {
        return QueryFilters.ebvFalse();
    }
};

/**
 * Total gt function used when sorting bindings in the SORT BY clause.
 *
 * @todo
 * Some criteria are not clear
 */
QueryFilters.runTotalGtFunction = function(op1,op2) {
    if(QueryFilters.isEbvError(op1) || QueryFilters.isEbvError(op2)) {
        return QueryFilters.ebvError();
    }

    if((QueryFilters.isNumeric(op1) && QueryFilters.isNumeric(op2)) ||
        (QueryFilters.isSimpleLiteral(op1) && QueryFilters.isSimpleLiteral(op2)) ||
        (QueryFilters.isXsdType("string",op1) && QueryFilters.isSimpleLiteral("string",op2)) ||
        (QueryFilters.isXsdType("boolean",op1) && QueryFilters.isSimpleLiteral("boolean",op2)) ||
        (QueryFilters.isXsdType("dateTime",op1) && QueryFilters.isSimpleLiteral("dateTime",op2))) {
        return QueryFilters.runGtFunction(op1, op2, []);
    } else if(op1.token && op1.token === 'uri' && op2.token && op2.token === 'uri') {
        return QueryFilters.ebvBoolean(op1.value > op2.value);
    } else if(op1.token && op1.token === 'literal' && op2.token && op2.token === 'literal') {
        // one of the literals must have type/lang and the othe may not have them
        return QueryFilters.ebvBoolean(""+op1.value+op1.type+op1.lang > ""+op2.value+op2.type+op2.lang);
    } else if(op1.token && op1.token === 'blank' && op2.token && op2.token === 'blank') {
        return QueryFilters.ebvBoolean(op1.value > op2.value);
    } else if(op1.value && op2.value) {
        return QueryFilters.ebvBoolean(op1.value > op2.value);
    } else {
        return QueryFilters.ebvTrue();
    }
};


QueryFilters.runLtFunction = function(op1, op2, bindings) {
    if(QueryFilters.isEbvError(op1) || QueryFilters.isEbvError(op2)) {
        return QueryFilters.ebvError();
    }

    if(QueryFilters.isNumeric(op1) && QueryFilters.isNumeric(op2)) {
        return QueryFilters.ebvBoolean(QueryFilters.effectiveTypeValue(op1) < QueryFilters.effectiveTypeValue(op2));
    } else if(QueryFilters.isSimpleLiteral(op1) && QueryFilters.isSimpleLiteral(op2)) {
        return QueryFilters.ebvBoolean(QueryFilters.effectiveTypeValue(op1) < QueryFilters.effectiveTypeValue(op2));
    } else if(QueryFilters.isXsdType("string", op1) && QueryFilters.isXsdType("string", op2)) {
        return QueryFilters.ebvBoolean(QueryFilters.effectiveTypeValue(op1) < QueryFilters.effectiveTypeValue(op2));
    } else if(QueryFilters.isXsdType("boolean", op1) && QueryFilters.isXsdType("boolean", op2)) {
        return QueryFilters.ebvBoolean(QueryFilters.effectiveTypeValue(op1) < QueryFilters.effectiveTypeValue(op2));
    } else if((QueryFilters.isXsdType("dateTime", op1) || QueryFilters.isXsdType("date", op1)) &&
        (QueryFilters.isXsdType("dateTime", op2) || QueryFilters.isXsdType("date", op2))) {
        if(QueryFilters.isXsdType("dateTime", op1) && QueryFilters.isXsdType("date", op2)) {
            return QueryFilters.ebvFalse();
        }
        if(QueryFilters.isXsdType("date", op1) && QueryFilters.isXsdType("dateTime", op2)) {
            return QueryFilters.ebvFalse();
        }

        var comp = Utils.compareDateComponents(op1.value, op2.value);
        if(comp != null) {
            if(comp == -1) {
                return QueryFilters.ebvTrue();
            } else {
                return QueryFilters.ebvFalse();
            }
        } else {
            return QueryFilters.ebvError();
        }
    } else {
        return QueryFilters.ebvFalse();
    }
};


QueryFilters.runGtEqFunction = function(op1, op2, bindings) {
    if(QueryFilters.isEbvError(op1) || QueryFilters.isEbvError(op2)) {
        return QueryFilters.ebvError();
    }

    if(QueryFilters.isNumeric(op1) && QueryFilters.isNumeric(op2)) {
        return QueryFilters.ebvBoolean(QueryFilters.effectiveTypeValue(op1) >= QueryFilters.effectiveTypeValue(op2));
    } else if(QueryFilters.isSimpleLiteral(op1) && QueryFilters.isSimpleLiteral(op2)) {
        return QueryFilters.ebvBoolean(QueryFilters.effectiveTypeValue(op1) >= QueryFilters.effectiveTypeValue(op2));
    } else if(QueryFilters.isXsdType("string", op1) && QueryFilters.isXsdType("string", op2)) {
        return QueryFilters.ebvBoolean(QueryFilters.effectiveTypeValue(op1) >= QueryFilters.effectiveTypeValue(op2));
    } else if(QueryFilters.isXsdType("boolean", op1) && QueryFilters.isXsdType("boolean", op2)) {
        return QueryFilters.ebvBoolean(QueryFilters.effectiveTypeValue(op1) >= QueryFilters.effectiveTypeValue(op2));
    } else if((QueryFilters.isXsdType("dateTime", op1) || QueryFilters.isXsdType("date", op1)) &&
        (QueryFilters.isXsdType("dateTime", op2) || QueryFilters.isXsdType("date", op2))) {
        if(QueryFilters.isXsdType("dateTime", op1) && QueryFilters.isXsdType("date", op2)) {
            return QueryFilters.ebvFalse();
        }
        if(QueryFilters.isXsdType("date", op1) && QueryFilters.isXsdType("dateTime", op2)) {
            return QueryFilters.ebvFalse();
        }

        var comp = Utils.compareDateComponents(op1.value, op2.value);
        if(comp != null) {
            if(comp != -1) {
                return QueryFilters.ebvTrue();
            } else {
                return QueryFilters.ebvFalse();
            }
        } else {
            return QueryFilters.ebvError();
        }

    } else {
        return QueryFilters.ebvFalse();
    }
};


QueryFilters.runLtEqFunction = function(op1, op2, bindings) {
    if(QueryFilters.isEbvError(op1) || QueryFilters.isEbvError(op2)) {
        return QueryFilters.ebvError();
    }

    if(QueryFilters.isNumeric(op1) && QueryFilters.isNumeric(op2)) {
        return QueryFilters.ebvBoolean(QueryFilters.effectiveTypeValue(op1) <= QueryFilters.effectiveTypeValue(op2));
    } else if(QueryFilters.isSimpleLiteral(op1) && QueryFilters.isSimpleLiteral(op2)) {
        return QueryFilters.ebvBoolean(QueryFilters.effectiveTypeValue(op1) <= QueryFilters.effectiveTypeValue(op2));
    } else if(QueryFilters.isXsdType("string", op1) && QueryFilters.isXsdType("string", op2)) {
        return QueryFilters.ebvBoolean(QueryFilters.effectiveTypeValue(op1) <= QueryFilters.effectiveTypeValue(op2));
    } else if(QueryFilters.isXsdType("boolean", op1) && QueryFilters.isXsdType("boolean", op2)) {
        return QueryFilters.ebvBoolean(QueryFilters.effectiveTypeValue(op1) <= QueryFilters.effectiveTypeValue(op2));
    } else if((QueryFilters.isXsdType("dateTime", op1) || QueryFilters.isXsdType("date", op1)) &&
        (QueryFilters.isXsdType("dateTime", op2) || QueryFilters.isXsdType("date", op2))) {
        if(QueryFilters.isXsdType("dateTime", op1) && QueryFilters.isXsdType("date", op2)) {
            return QueryFilters.ebvFalse();
        }
        if(QueryFilters.isXsdType("date", op1) && QueryFilters.isXsdType("dateTime", op2)) {
            return QueryFilters.ebvFalse();
        }

        var comp = Utils.compareDateComponents(op1.value, op2.value);
        if(comp != null) {
            if(comp != 1) {
                return QueryFilters.ebvTrue();
            } else {
                return QueryFilters.ebvFalse();
            }
        } else {
            return QueryFilters.ebvError();
        }
    } else {
        return QueryFilters.ebvFalse();
    }
};

QueryFilters.runAddition = function(summand, summands, bindings, queryEngine, dataset, env) {
    var summandOp = QueryFilters.runFilter(summand,bindings,queryEngine, dataset, env);
    if(QueryFilters.isEbvError(summandOp)) {
        return QueryFilters.ebvError();
    }

    var acum = summandOp;
    if(QueryFilters.isNumeric(summandOp)) {
        for(var i=0; i<summands.length; i++) {
            var nextSummandOp = QueryFilters.runFilter(summands[i].expression, bindings,queryEngine, dataset, env);
            if(QueryFilters.isNumeric(nextSummandOp)) {
                if(summands[i].operator === '+') {
                    acum = QueryFilters.runSumFunction(acum, nextSummandOp);
                } else if(summands[i].operator === '-') {
                    acum = QueryFilters.runSubFunction(acum, nextSummandOp);
                }
            } else {
                return QueryFilters.ebvFalse();
            }
        }
        return acum;
    } else {
        return QueryFilters.ebvFalse();
    }
};

QueryFilters.runSumFunction = function(suma, sumb) {
    if(QueryFilters.isEbvError(suma) || QueryFilters.isEbvError(sumb)) {
        return QueryFilters.ebvError();
    }
    var val = QueryFilters.effectiveTypeValue(suma) + QueryFilters.effectiveTypeValue(sumb);

    if(QueryFilters.isDouble(suma) || QueryFilters.isDouble(sumb)) {
        return {token: 'literal', type:xmlSchema+"double", value:val};
    } else if(QueryFilters.isFloat(suma) || QueryFilters.isFloat(sumb)) {
        return {token: 'literal', type:xmlSchema+"float", value:val};
    } else if(QueryFilters.isDecimal(suma) || QueryFilters.isDecimal(sumb)) {
        return {token: 'literal', type:xmlSchema+"decimal", value:val};
    } else {
        return {token: 'literal', type:xmlSchema+"integer", value:val};
    }
};

QueryFilters.runSubFunction = function(suma, sumb) {
    if(QueryFilters.isEbvError(suma) || QueryFilters.isEbvError(sumb)) {
        return QueryFilters.ebvError();
    }
    var val = QueryFilters.effectiveTypeValue(suma) - QueryFilters.effectiveTypeValue(sumb);

    if(QueryFilters.isDouble(suma) || QueryFilters.isDouble(sumb)) {
        return {token: 'literal', type:xmlSchema+"double", value:val};
    } else if(QueryFilters.isFloat(suma) || QueryFilters.isFloat(sumb)) {
        return {token: 'literal', type:xmlSchema+"float", value:val};
    } else if(QueryFilters.isDecimal(suma) || QueryFilters.isDecimal(sumb)) {
        return {token: 'literal', type:xmlSchema+"decimal", value:val};
    } else {
        return {token: 'literal', type:xmlSchema+"integer", value:val};
    }
};

QueryFilters.runMultiplication = function(factor, factors, bindings, queryEngine, dataset, env) {
    var factorOp = QueryFilters.runFilter(factor,bindings,queryEngine, dataset, env);
    if(QueryFilters.isEbvError(factorOp)) {
        return factorOp;
    }

    var acum = factorOp;
    if(QueryFilters.isNumeric(factorOp)) {
        for(var i=0; i<factors.length; i++) {
            var nextFactorOp = QueryFilters.runFilter(factors[i].expression, bindings,queryEngine, dataset, env);
            if(QueryFilters.isEbvError(nextFactorOp)) {
                return factorOp;
            }
            if(QueryFilters.isNumeric(nextFactorOp)) {
                if(factors[i].operator === '*') {
                    acum = QueryFilters.runMulFunction(acum, nextFactorOp);
                } else if(factors[i].operator === '/') {
                    acum = QueryFilters.runDivFunction(acum, nextFactorOp);
                }
            } else {
                return QueryFilters.ebvFalse();
            }
        }
        return acum;
    } else {
        return QueryFilters.ebvFalse();
    }
};

QueryFilters.runMulFunction = function(faca, facb) {
    if(QueryFilters.isEbvError(faca) || QueryFilters.isEbvError(facb)) {
        return QueryFilters.ebvError();
    }
    var val = QueryFilters.effectiveTypeValue(faca) * QueryFilters.effectiveTypeValue(facb);

    if(QueryFilters.isDouble(faca) || QueryFilters.isDouble(facb)) {
        return {token: 'literal', type:xmlSchema+"double", value:val};
    } else if(QueryFilters.isFloat(faca) || QueryFilters.isFloat(facb)) {
        return {token: 'literal', type:xmlSchema+"float", value:val};
    } else if(QueryFilters.isDecimal(faca) || QueryFilters.isDecimal(facb)) {
        return {token: 'literal', type:xmlSchema+"decimal", value:val};
    } else {
        return {token: 'literal', type:xmlSchema+"integer", value:val};
    }
};

QueryFilters.runDivFunction = function(faca, facb) {
    if(QueryFilters.isEbvError(faca) || QueryFilters.isEbvError(facb)) {
        return QueryFilters.ebvError();
    }
    var val = QueryFilters.effectiveTypeValue(faca) / QueryFilters.effectiveTypeValue(facb);

    if(QueryFilters.isDouble(faca) || QueryFilters.isDouble(facb)) {
        return {token: 'literal', type:xmlSchema+"double", value:val};
    } else if(QueryFilters.isFloat(faca) || QueryFilters.isFloat(facb)) {
        return {token: 'literal', type:xmlSchema+"float", value:val};
    } else if(QueryFilters.isDecimal(faca) || QueryFilters.isDecimal(facb)) {
        return {token: 'literal', type:xmlSchema+"decimal", value:val};
    } else {
        return {token: 'literal', type:xmlSchema+"integer", value:val};
    }
};

QueryFilters.runBuiltInCall = function(builtincall, args, bindings, queryEngine, dataset, env) {
    if(builtincall === 'notexists' || builtincall === 'exists') {
        // Run the query in the filter applying bindings

        var cloned = _.clone(args[0],true);
        var ast = queryEngine.abstractQueryTree.parseSelect({pattern:cloned}, bindings);
        ast = queryEngine.abstractQueryTree.bind(ast.pattern, bindings);

        var result = queryEngine.executeSelectUnit([ {kind:'*'} ],
            dataset,
            ast,
            env);

        if(builtincall === 'exists') {
            return QueryFilters.ebvBoolean(result.length!==0);
        } else {
            return QueryFilters.ebvBoolean(result.length===0);
        }

    }  else {

        var ops = [];
        for(var i=0; i<args.length; i++) {
            if(args[i].token === 'var') {
                ops.push(args[i]);
            } else {
                var op = QueryFilters.runFilter(args[i], bindings, queryEngine, dataset, env);
                if(QueryFilters.isEbvError(op)) {
                    return op;
                }
                ops.push(op);
            }
        }

        if(builtincall === 'str') {
            if(ops[0].token === 'literal') {
                // lexical form literals
                return {token: 'literal', type:null, value:""+ops[0].value}; // type null? or xmlSchema+"string"
            } else if(ops[0].token === 'uri'){
                // codepoint URIs
                return {token: 'literal', type:null, value:ops[0].value}; // idem
            } else {
                return QueryFilters.ebvFalse();
            }
        } else if(builtincall === 'lang') {
            if(ops[0].token === 'literal'){
                if(ops[0].lang != null) {
                    return {token: 'literal', value:""+ops[0].lang};
                } else {
                    return {token: 'literal', value:""};
                }
            } else {
                return QueryFilters.ebvError();
            }
        } else if(builtincall === 'datatype') {
            if(ops[0].token === 'literal'){
                var lit = ops[0];
                if(lit.type != null) {
                    if(typeof(lit.type) === 'string') {
                        return {token: 'uri', value:lit.type, prefix:null, suffix:null};
                    } else {
                        return lit.type;
                    }
                } else if(lit.lang == null) {
                    return {token: 'uri', value:'http://www.w3.org/2001/XMLSchema#string', prefix:null, suffix:null};
                } else {
                    return QueryFilters.ebvError();
                }
            } else {
                return QueryFilters.ebvError();
            }
        } else if(builtincall === 'isliteral') {
            if(ops[0].token === 'literal'){
                return QueryFilters.ebvTrue();
            } else {
                return QueryFilters.ebvFalse();
            }
        } else if(builtincall === 'isblank') {
            if(ops[0].token === 'blank'){
                return QueryFilters.ebvTrue();
            } else {
                return QueryFilters.ebvFalse();
            }
        } else if(builtincall === 'isuri' || builtincall === 'isiri') {
            if(ops[0].token === 'uri'){
                return QueryFilters.ebvTrue();
            } else {
                return QueryFilters.ebvFalse();
            }
        } else if(builtincall === 'sameterm') {
            var op1 = ops[0];
            var op2 = ops[1];
            var res = QueryFilters.RDFTermEquality(op1, op2, queryEngine, env);
            if(QueryFilters.isEbvError(res)) {
                res = false;
            }
            return QueryFilters.ebvBoolean(res);
        } else if(builtincall === 'langmatches') {
            var lang = ops[0];
            var langRange = ops[1];

            if(lang.token === 'literal' && langRange.token === 'literal'){
                if(langRange.value === '*' && lang.value != '') {
                    return QueryFilters.ebvTrue();
                } else {
                    return QueryFilters.ebvBoolean(lang.value.toLowerCase().indexOf(langRange.value.toLowerCase()) === 0)
                }
            } else {
                return QueryFilters.ebvError();
            }
        } else if(builtincall === 'bound') {
            var boundVar = ops[0].value;
            var acum = [];
            if(boundVar == null) {
                return QueryFilters.ebvError();
            } else  if(bindings[boundVar] != null) {
                return QueryFilters.ebvTrue();
            } else {
                return QueryFilters.ebvFalse();
            }
        } else if(queryEngine.customFns[builtincall] != null) {
            return queryEngine.customFns[builtincall](QueryFilters, ops);
        } else {
            throw ("Builtin call "+builtincall+" not implemented yet");
        }
    }
};

QueryFilters.runUnaryExpression = function(unaryexpression, expression, bindings, queryEngine, dataset, env) {
    var op = QueryFilters.runFilter(expression, bindings,queryEngine, dataset, env);
    if(QueryFilters.isEbvError(op)) {
        return op;
    }

    if(unaryexpression === '!') {
        var res = QueryFilters.ebv(op);
        //console.log("** Unary ! ");
        //console.log(op)
        if(QueryFilters.isEbvError(res)) {
            //console.log("--- ERROR")
            //console.log(QueryFilters.ebvFalse())
            //console.log("\r\n")

            // ??
            return QueryFilters.ebvFalse();
        } else {
            res = !res;
            //console.log("--- BOOL")
            //console.log(QueryFilters.ebvBoolean(res))
            //console.log("\r\n")

            return QueryFilters.ebvBoolean(res);
        }
    } else if(unaryexpression === '+') {
        if(QueryFilters.isNumeric(op)) {
            return op;
        } else {
            return QueryFilters.ebvError();
        }
    } else if(unaryexpression === '-') {
        if(QueryFilters.isNumeric(op)) {
            var clone = {};
            for(var p in op) {
                clone[p] = op[p];
            }
            clone.value = -clone.value;
            return clone;
        } else {
            return QueryFilters.ebvError();
        }
    }
};

QueryFilters.runRegex = function(text, pattern, flags, bindings, queryEngine, dataset, env) {

    if(text != null) {
        text = QueryFilters.runFilter(text, bindings, queryEngine, dataset, env);
    } else {
        return QueryFilters.ebvError();
    }

    if(pattern != null) {
        pattern = QueryFilters.runFilter(pattern, bindings, queryEngine, dataset, env);
    } else {
        return QueryFilters.ebvError();
    }

    if(flags != null) {
        flags = QueryFilters.runFilter(flags, bindings, queryEngine, dataset, env);
    }


    if(pattern != null && pattern.token === 'literal' && (flags == null || flags.token === 'literal')) {
        pattern = pattern.value;
        flags = (flags == null) ? null : flags.value;
    } else {
        return QueryFilters.ebvError();
    }

    if(text!= null && text.token == 'var') {
        if(bindings[text.value] != null) {
            text = bindings[text.value];
        } else {
            return QueryFilters.ebvError();
        }
    } else if(text!=null && text.token === 'literal') {
        if(text.type == null || QueryFilters.isXsdType("string",text)) {
            text = text.value
        } else {
            return QueryFilters.ebvError();
        }
    } else {
        return QueryFilters.ebvError();
    }

    var regex;
    if(flags == null) {
        regex = new RegExp(pattern);
    } else {
        regex = new RegExp(pattern,flags.toLowerCase());
    }
    if(regex.exec(text)) {
        return QueryFilters.ebvTrue();
    } else {
        return QueryFilters.ebvFalse();
    }
};

QueryFilters.normalizeLiteralDatatype = function(literal, queryEngine, env) {
    if(literal.value.type == null || typeof(literal.value.type) != 'object') {
        return literal;
    } else {
        // type can be parsed as a hash using namespaces
        literal.value.type =  Utils.lexicalFormBaseUri(literal.value.type, env);
        return literal;
    }
};

QueryFilters.runIriRefOrFunction = function(iriref, args, bindings,queryEngine, dataset, env) {
    if(args == null) {
        return iriref;
    } else {
        var ops = [];
        for(var i=0; i<args.length; i++) {
            ops.push(QueryFilters.runFilter(args[i], bindings, queryEngine, dataset, env))
        }

        var fun = Utils.lexicalFormBaseUri(iriref, env);

        if(fun == xmlSchema+"integer" ||
            fun == xmlSchema+"decimal" ||
            fun == xmlSchema+"double" ||
            fun == xmlSchema+"nonPositiveInteger" ||
            fun == xmlSchema+"negativeInteger" ||
            fun == xmlSchema+"long" ||
            fun == xmlSchema+"int" ||
            fun == xmlSchema+"short" ||
            fun == xmlSchema+"byte" ||
            fun == xmlSchema+"nonNegativeInteger" ||
            fun == xmlSchema+"unsignedLong" ||
            fun == xmlSchema+"unsignedInt" ||
            fun == xmlSchema+"unsignedShort" ||
            fun == xmlSchema+"unsignedByte" ||
            fun == xmlSchema+"positiveInteger") {
            var from = ops[0];
            if(from.token === 'literal') {
                from = QueryFilters.normalizeLiteralDatatype(from, queryEngine, env);
                if(from.type == xmlSchema+"integer" ||
                    from.type == xmlSchema+"decimal" ||
                    from.type == xmlSchema+"double" ||
                    from.type == xmlSchema+"nonPositiveInteger" ||
                    from.type == xmlSchema+"negativeInteger" ||
                    from.type == xmlSchema+"long" ||
                    from.type == xmlSchema+"int" ||
                    from.type == xmlSchema+"short" ||
                    from.type == xmlSchema+"byte" ||
                    from.type == xmlSchema+"nonNegativeInteger" ||
                    from.type == xmlSchema+"unsignedLong" ||
                    from.type == xmlSchema+"unsignedInt" ||
                    from.type == xmlSchema+"unsignedShort" ||
                    from.type == xmlSchema+"unsignedByte" ||
                    from.type == xmlSchema+"positiveInteger") {
                    from.type = fun;
                    return from;
                } else if(from.type == 'http://www.w3.org/2001/XMLSchema#boolean') {
                    if(QueryFilters.ebv(from) == true) {
                        from.type = fun;
                        from.value = 1;
                    } else {
                        from.type = fun;
                        from.value = 0;
                    }
                    return from;
                } else if(from.type == 'http://www.w3.org/2001/XMLSchema#float' ||
                    from.type == 'http://www.w3.org/2001/XMLSchema#double') {
                    from.type = fun;
                    from.value = parseInt(from.value);
                    return from;
                } else if(from.type == 'http://www.w3.org/2001/XMLSchema#string' || from.type == null) {
                    if(from.value.split(".").length > 2) {
                        return QueryFilters.ebvError();
                    } else if (from.value.split("-").length > 2) {
                        return QueryFilters.ebvError();
                    } else if (from.value.split("/").length > 2) {
                        return QueryFilters.ebvError();
                    } else if (from.value.split("+").length > 2) {
                        return QueryFilters.ebvError();
                    }

                    // @todo improve this with regular expressions for each lexical representation
                    if(fun == xmlSchema+"decimal") {
                        if(from.value.indexOf("e") != -1 || from.value.indexOf("E") != -1) {
                            return QueryFilters.ebvError();
                        }
                    }

                    // @todo improve this with regular expressions for each lexical representation
                    if(fun == xmlSchema+"int" || fun == xmlSchema+"integer") {
                        if(from.value.indexOf("e") != -1 || from.value.indexOf("E") != -1 || from.value.indexOf(".") != -1) {
                            return QueryFilters.ebvError();
                        }
                    }

                    try {
                        from.value = parseInt(parseFloat(from.value));
                        if(isNaN(from.value)) {
                            return QueryFilters.ebvError();
                        } else {
                            from.type = fun;
                            return from;
                        }
                    } catch(e) {
                        return QueryFilters.ebvError();
                    }
                } else {
                    return QueryFilters.ebvError();
                }
            } else {
                return QueryFilters.ebvError();
            }
        } else if(fun == xmlSchema+"boolean") {
            var from = ops[0];
            if(from.token === "literal" && from.type == null) {
                if(from.value === "true" || from.value === "1") {
                    return QueryFilters.ebvTrue();
                } else if(from.value === "false" || from.value === "0" ) {
                    return QueryFilters.ebvFalse();
                } else {
                    return QueryFilters.ebvError();
                }
            } else if(from.token === "literal") {
                if(QueryFilters.isEbvError(from)) {
                    return from;
                } else {
                    return QueryFilters.ebvBoolean(from);
                }
            } else {
                return QueryFilters.ebvError();
            }
        } else if(fun == xmlSchema+"string") {
            var from = ops[0];
            if(from.token === 'literal') {
                from = QueryFilters.normalizeLiteralDatatype(from, queryEngine, env);
                if(from.type == xmlSchema+"integer" ||
                    from.type == xmlSchema+"decimal" ||
                    from.type == xmlSchema+"double" ||
                    from.type == xmlSchema+"nonPositiveInteger" ||
                    from.type == xmlSchema+"negativeInteger" ||
                    from.type == xmlSchema+"long" ||
                    from.type == xmlSchema+"int" ||
                    from.type == xmlSchema+"short" ||
                    from.type == xmlSchema+"byte" ||
                    from.type == xmlSchema+"nonNegativeInteger" ||
                    from.type == xmlSchema+"unsignedLong" ||
                    from.type == xmlSchema+"unsignedInt" ||
                    from.type == xmlSchema+"unsignedShort" ||
                    from.type == xmlSchema+"unsignedByte" ||
                    from.type == xmlSchema+"positiveInteger" ||
                    from.type == xmlSchema+"float") {
                    from.type = fun;
                    from.value = ""+from.value;
                    return from;
                } else if(from.type == xmlSchema+"string") {
                    return from;
                } else if(from.type == xmlSchema+"boolean") {
                    if(QueryFilters.ebv(from)) {
                        from.type = fun;
                        from.value = 'true';
                    } else {
                        from.type = fun;
                        from.value = 'false';
                    }
                    return from;
                } else if(from.type == xmlSchema+"dateTime" ||
                    from.type == xmlSchema+"date") {
                    from.type = fun;
                    if(typeof(from.value) != 'string') {
                        from.value = Utils.iso8601(from.value);
                    }
                    return from;
                } else if(from.type == null) {
                    from.value = ""+from.value;
                    from.type = fun;
                    return from;
                } else {
                    return QueryFilters.ebvError();
                }
            } else if(from.token === 'uri') {
                return {token: 'literal',
                    value: Utils.lexicalFormBaseUri(from, env),
                    type: fun,
                    lang: null};
            } else {
                return QueryFilters.ebvError();
            }
        } else if(fun == xmlSchema+"dateTime" || fun == xmlSchema+"date") {
            from = ops[0];
            if(from.type == xmlSchema+"dateTime" || from.type == xmlSchema+"date") {
                return from;
            } else if(from.type == xmlSchema+"string" || from.type == null) {
                try {
                    from.value = Utils.iso8601(Utils.parseISO8601(from.value));
                    from.type = fun;
                    return from;
                } catch(e) {
                    return QueryFilters.ebvError();
                }
            } else {
                return QueryFilters.ebvError();
            }
        } else if(fun == xmlSchema+"float") {
            var from = ops[0];
            if(from.token === 'literal') {
                from = QueryFilters.normalizeLiteralDatatype(from, queryEngine, env);
                if(from.type == 'http://www.w3.org/2001/XMLSchema#decimal' ||
                    from.type == 'http://www.w3.org/2001/XMLSchema#int') {
                    from.type = fun;
                    from.value = parseFloat(from.value);
                    return from;
                } else if(from.type == 'http://www.w3.org/2001/XMLSchema#boolean') {
                    if(QueryFilters.ebv(from) == true) {
                        from.type = fun;
                        from.value = 1.0;
                    } else {
                        from.type = fun;
                        from.value = 0.0;
                    }
                    return from;
                } else if(from.type == 'http://www.w3.org/2001/XMLSchema#float' ||
                    from.type == 'http://www.w3.org/2001/XMLSchema#double') {
                    from.type = fun;
                    from.value = parseFloat(from.value);
                    return from;
                } else if(from.type == 'http://www.w3.org/2001/XMLSchema#string') {
                    try {
                        from.value = parseFloat(from.value);
                        if(isNaN(from.value)) {
                            return QueryFilters.ebvError();
                        } else {
                            from.type = fun;
                            return from;
                        }
                    } catch(e) {
                        return QueryFilters.ebvError();
                    }
                } else if(from.type == null) {
                    // checking some exceptions that are parsed as Floats by JS
                    if(from.value.split(".").length > 2) {
                        return QueryFilters.ebvError();
                    } else if (from.value.split("-").length > 2) {
                        return QueryFilters.ebvError();
                    } else if (from.value.split("/").length > 2) {
                        return QueryFilters.ebvError();
                    } else if (from.value.split("+").length > 2) {
                        return QueryFilters.ebvError();
                    }

                    try {
                        from.value = parseFloat(from.value);
                        if(isNaN(from.value)) {
                            return QueryFilters.ebvError();
                        } else {
                            from.type = fun;
                            return from;
                        }
                    } catch(e) {
                        return QueryFilters.ebvError();
                    }
                } else {
                    return QueryFilters.ebvError();
                }
            } else {
                return QueryFilters.ebvError();
            }
        } else {
            // unknown function
            return QueryFilters.ebvError();
        }
    }
};


module.exports = {
    QueryFilters: QueryFilters
};

},{"./utils":55}],51:[function(_dereq_,module,exports){
var _ = _dereq_('./utils');
var async = _dereq_('./utils');

/**
 * A new query plan object
 * @param left
 * @param right
 * @param cost
 * @param identifier
 * @param allVars
 * @param joinVars
 * @constructor
 */
var QueryPlan = function(left, right, cost, identifier, allVars, joinVars) {

    this.left =  left;
    this.right = right;
    this.cost = cost;
    this.i = identifier;
    this.vars = allVars;
    this.join = joinVars;

};

/**
 * Functions to build and execute query plans for a particular query
 * using a dynamic programming join algorithm.
 */
var QueryPlanDPSize = {};

/**
 * Finds variable in a BGP. Variables can be actual variables or blank nodes.
 * The variables are returned as an array and assigned as a property of the BGP object.
 * @param bgp
 * @returns Array with the found variables.
 */
QueryPlanDPSize.variablesInBGP = function(bgp) {
    // may be cached in the pattern
    var variables = bgp.variables;
    if(variables) {
        return variables;
    }

    var components =  bgp.value || bgp;
    variables  = [];
    for(var comp in components) {
        if(components[comp] && components[comp].token === "var") {
            variables.push(components[comp].value);
        } else if(components[comp] && components[comp].token === "blank") {
            variables.push("blank:"+components[comp].value);
        }
    }
    bgp.variables = variables;

    return variables;
};

/**
 * Checks if two plans are connected due to at least on common variable.
 * @param leftPlan
 * @param rightPlan
 * @returns {boolean}
 */
QueryPlanDPSize.connected = function(leftPlan, rightPlan) {
    var varsLeft ="/"+leftPlan.vars.join("/")+"/";
    for(var i=0; i<rightPlan.vars.length; i++) {
        if(varsLeft.indexOf("/"+rightPlan.vars[i]+"/") != -1) {
            return true;
        }
    }

    return false;
};

var intersection = function(arr1,arr2) {
    var acc = {};
    for(var i=0; i<arr1.lenght; i++) {
        acc[arr1[i]] = 1;
    }
    for(i=0; i<arr2.length; i++) {
        var val = acc[arr2[i]] || 0;
        val++;
        acc[arr2[i]] = val;
    }
    var intersect = [];
    for(var p in acc) {
        if(acc[p] == 2)
        intersect.push(acc[p]);
    }

    return intersect;
};

/**
 * Computes the intersection for the bariables of two BGPs
 * @param bgpa
 * @param bgpb
 * @returns {*}
 */
QueryPlanDPSize.variablesIntersectionBGP = function(bgpa, bgpb) {
    return intersection(
        QueryPlanDPSize.variablesInBGP(bgpa),
        QueryPlanDPSize.variablesInBGP(bgpb)
    );
};

/**
 * All BGPs sharing variables are grouped together.
 */
QueryPlanDPSize.executeAndBGPsGroups = function(bgps) {
    var groups = {};
    var groupVars = {};
    var groupId = 0;


    // Returns true if the any of the passed vars are in the vars
    // associated to the group.
    var detectVarsInGroup = function(vars, groupVars) {

        for(var j=0; j<vars.length; j++) {
            var thisVar = "/"+vars[j]+"/";
            if(groupVars.indexOf(thisVar) != -1) {
                return true;
            }
        }

        return false;
    };

    // Creates a new group merging the vars and the groups
    var mergeGroups = function(bgp, toJoin, newGroups, newGroupVars) {
        var acumGroups = [];
        var acumId = "";
        var acumVars = "";
        for(var gid in toJoin) {
            acumId = acumId+gid; // new group id
            acumGroups = acumGroups.concat(groups[gid]);
            acumVars = acumVars + groupVars[gid]; // @todo bug here? we were not adding...
        }

        acumVars = acumVars + vars.join("/") + "/";
        acumGroups.push(bgp);

        newGroups[acumId] = acumGroups;
        newGroupVars[acumId] = acumVars;
    };

    for(var i=0; i<bgps.length; i++) {
        var bgp = bgps[i];
        var newGroups = {};
        var newGroupVars = {};

        var vars = QueryPlanDPSize.variablesInBGP(bgp);
        var toJoin = {};

        for(var nextGroupId in groupVars) {
            if(detectVarsInGroup(vars, groupVars[nextGroupId])) {
                // we need to merge this group fo the next iteration
                toJoin[nextGroupId] = true;
            } else {
                // this group does not need merge for the next iteration
                newGroups[nextGroupId] = groups[nextGroupId];
                newGroupVars[nextGroupId] = groupVars[nextGroupId];
            }
        }

        if(_.size(toJoin) === 0) {
            // we haven't found a single existing group sharing vars
            // with the BGP. We need to create a new group only for this BGP.
            newGroups['g'+groupId] = [bgp];
            newGroupVars['g'+groupId] = "/"+(vars.join("/"))+"/";
            groupId++;
        } else {
            // We merge all the groups sharing vars with the BGP.
            mergeGroups(bgp,toJoin, newGroups, newGroupVars);
        }

        groups = newGroups;
        groupVars = newGroupVars;
    }

    return _.values(groups);
};

/**
 * Checks if there is an intersection between search plans.
 * @param leftPlan
 * @param rightPlan
 * @returns 0 or 1 if there's an intersection
 */
QueryPlanDPSize.intersectionSize = function(leftPlan, rightPlan) {
    var idsRight = rightPlan.i.split("_");
    for(var i=0; i<idsRight.length; i++) {
        if(idsRight[i]=="")
            continue;
        if(leftPlan.i.indexOf('_'+idsRight[i]+'_') != -1) {
            return 1; // we just need to know if this value is >0
        }
    }
    return 0;
};

/**
 * Creates  a new join tree merging two query plans with shared variables.
 * @param left plan object
 * @param right plan object
 * @returns a new query plan object
 */
QueryPlanDPSize.createJoinTree = function(leftPlan, rightPlan) {
    var varsLeft ="/"+leftPlan.vars.join("/")+"/";
    var accumVars = leftPlan.vars.concat([]);

    var join = [];

    // Search for the join vars trying to find shared vars between
    // the left plan and the right plan.
    for(var i=0; i<rightPlan.vars.length; i++) {
        if(varsLeft.indexOf("/"+rightPlan.vars[i]+"/") != -1) {
            if(rightPlan.vars[i].indexOf("_:") == 0) {
                join.push("blank:"+rightPlan.vars[i]);
            } else {
                join.push(rightPlan.vars[i]);
            }
        } else {
            accumVars.push(rightPlan.vars[i]);
        }
    }

    // Creates a new identifier for the join tree using the union
    // of both plans identifiers.
    var rightIds = rightPlan.i.split("_");
    var leftIds = leftPlan.i.split("_");
    var distinct = {};
    for(var i=0; i<rightIds.length; i++) {
        if(rightIds[i] != "") {
            distinct[rightIds[i]] = true;
        }
    }
    for(var i=0; i<leftIds.length; i++) {
        if(leftIds[i] != "") {
            distinct[leftIds[i]] = true;
        }
    }
    var ids = _.keys(distinct);

    // Returns the new join tree
    return {
        left: leftPlan,
        right: rightPlan,
        cost: leftPlan.cost+rightPlan.cost,
        i: "_"+(ids.sort().join("_"))+"_",
        vars: accumVars,
        join: join
    };
};

/**
 * Algorithm that chooses the best way to execute an execution plan in the query engine.
 * @param treeNode
 * @param dataset
 * @param queryEngine
 * @param env
 * @returns {*}
 */
QueryPlanDPSize.executeBushyTree = function(queryPlan, dataset, queryEngine, env, callback) {
    if(queryPlan.left == null ) {
        QueryPlanDPSize.executeEmptyJoinBGP(queryPlan.right, dataset, queryEngine, env, callback);
    } else if(queryPlan.right == null) {
        QueryPlanDPSize.executeEmptyJoinBGP(queryPlan.left, dataset, queryEngine, env, callback);
    } else {
        QueryPlanDPSize.executeBushyTree(queryPlan.left, dataset, queryEngine, env, function(resultsLeft){

            if(resultsLeft!=null) {
                QueryPlanDPSize.executeBushyTree(queryPlan.right, dataset, queryEngine, env, function(resultsRight){
                    if(resultsRight!=null) {
                        callback(QueryPlanDPSize.joinBindings2(queryPlan.join, resultsLeft, resultsRight));
                    } else {
                        callback(null);
                    }
                });
            } else {
                callback(null);
            }
        });
    }
};


QueryPlanDPSize.executeAndBGPsDPSize = function(allBgps, dataset, queryEngine, env, callback) {

    var groups = QueryPlanDPSize.executeAndBGPsGroups(allBgps);
    var groupResults = [];

    async.eachSeries(groups,function(bgps,k) {
        // @todo
        // this lambda function should be moved to its named function

        // Build bushy tree for this group
        var costFactor = 1;
        queryEngine.computeCosts(bgps,env,function(bgps) {
            var bestPlans = {};
            var plans = {};
            var sizes = {};

            var maxSize = 1;
            var maxPlan = null;

            var cache = {};

            sizes['1'] = [];

            // Building plans of size 1
            for(var i=0; i<bgps.length; i++) {
                var vars = [];

                delete bgps[i]['variables'];
                for(var comp in bgps[i]) {
                    if(comp != '_cost') {
                        if(bgps[i][comp].token === 'var') {
                            vars.push(bgps[i][comp].value);
                        } else if(bgps[i][comp].token === 'blank') {
                            vars.push(bgps[i][comp].value);
                        }
                    }
                }

                plans["_"+i+"_"] = {left: bgps[i], right:null, cost:bgps[i]._cost, i:('_'+i+'_'), vars:vars};
                var plan = {left: bgps[i], right:null, cost:bgps[i]._cost, i:('_'+i+'_'), vars:vars};
                bestPlans["_"+i+"_"] = plan;
                delete bgps[i]['_cost'];
                cache["_"+i+"_"] = true;
                sizes['1'].push("_"+i+"_");
                if(maxPlan == null || maxPlan.cost>plan.cost) {
                    maxPlan = plan;
                }
            }

            // dynamic programming -> build plans of increasing size
            for(var s=2; s<=bgps.length; s++) { // size
                for(var sl=1; sl<s; sl++) { // size left plan
                    var sr = s - sl; // size right plan
                    var leftPlans = sizes[''+sl] || [];
                    var rightPlans = sizes[''+sr] || [];
                    for(var i=0; i<leftPlans.length; i++) {
                        for(var j=0; j<rightPlans.length; j++) {
                            if(leftPlans[i]===rightPlans[j])
                                continue;
                            var leftPlan = plans[leftPlans[i]];
                            var rightPlan = plans[rightPlans[j]];

                            // condition (1)
                            if(QueryPlanDPSize.intersectionSize(leftPlan, rightPlan) == 0) {
                                // condition (2)

                                if(QueryPlanDPSize.connected(leftPlan,rightPlan)) {
                                    maxSize = s;
                                    var p1 = bestPlans[leftPlan.i];  //QueryPlanAsync.bestPlan(leftPlan, bestPlans);
                                    var p2 = bestPlans[rightPlan.i]; //QueryPlanAsync.bestPlan(rightPlan, bestPlans);

                                    var currPlan = QueryPlanDPSize.createJoinTree(p1,p2);
                                    if(!cache[currPlan.i]) {
                                        cache[currPlan.i] = true;

                                        var costUnion = currPlan.cost+1;
                                        if(bestPlans[currPlan.i] != null) {
                                            costUnion = bestPlans[currPlan.i].cost;
                                        }

                                        var acum = sizes[s] || [];
                                        acum.push(currPlan.i);
                                        plans[currPlan.i] = currPlan;
                                        sizes[s] = acum;

                                        if(costUnion > currPlan.cost) {
                                            if(maxSize === s) {
                                                maxPlan = currPlan;
                                            }
                                            bestPlans[currPlan.i] = currPlan;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            groupResults.push(maxPlan);
            k();
        });
    },function() {
        // now execute the Bushy trees and perform
        // cross products between groups
        var acum = null;
        async.eachSeries(groupResults, function(tree,k) {


            QueryPlanDPSize.executeBushyTree(tree, dataset, queryEngine, env, function(result) {
                if(result) {
                    if(acum == null) {
                        acum = result;
                        k();
                    } else {
                        acum = QueryPlanDPSize.crossProductBindings(acum, result);
                        k();
                    }
                } else {
                    k("Error executing bushy tree");
                }

            });
        },function(err){
            if(err) {
                callback(null, err);
            } else {
                callback(acum);
            }
        });
    });
};


QueryPlanDPSize.executeEmptyJoinBGP = function(bgp, dataset, queryEngine, queryEnv, callback) {
    return QueryPlanDPSize.executeBGPDatasets(bgp, dataset, queryEngine, queryEnv, callback);
};


QueryPlanDPSize.executeBGPDatasets = function(bgp, dataset, queryEngine, queryEnv, callback) {
    // avoid duplicate queries in the same graph
    // merge of graphs is not guaranteed here.
    var duplicates = {};

    if(bgp.graph == null) {
        //union through all default graph(s)
        var acum = [];
        async.eachSeries(dataset.implicit,
            function(implicitGraph, k){
                if(duplicates[implicitGraph.oid] == null) {
                    duplicates[implicitGraph.oid] = true;
                    bgp.graph = implicitGraph;//.oid
                    queryEngine.rangeQuery(bgp, queryEnv, function(results){
                        results = QueryPlanDPSize.buildBindingsFromRange(results, bgp);
                        acum.push(results);
                        k();
                    });
                } else {
                    k();
                }
            }, function(){
                var acumBindings = QueryPlanDPSize.unionManyBindings(acum);
                callback(acumBindings);
            });
    } else if(bgp.graph.token === 'var') {
        // union through all named datasets
        var graphVar = bgp.graph.value;
        var acum = [];

        async.eachSeries(dataset.named,
            function(graph, k){
                if(duplicates[graph.oid] == null) {
                    duplicates[graph.oid] = true;
                    bgp.graph = graph;//.oid
                    if(acum != null) {
                        queryEngine.rangeQuery(bgp, queryEnv, function (results) {
                            if (results != null) {
                                results = QueryPlanDPSize.buildBindingsFromRange(results, bgp);
                                // add the graph bound variable to the result
                                for (var j = 0; j < results.length; j++) {
                                    results[j][graphVar] = graph.oid;
                                }
                                acum.push(results);
                            } else {
                                acum = null;
                            }
                            k();
                        });
                    } else {
                        k();
                    }
                }
            }, function(){
                if(acum == null) {
                    callback(null);
                } else {
                    var acumBindings = QueryPlanDPSize.unionManyBindings(acum);
                    callback(acumBindings);
                }
            });
    } else {
        // graph already has an active value, just match.
        // Filtering the results will still be necessary
        queryEngine.rangeQuery(bgp, queryEnv, function(results){
            if(results!=null) {
                results = QueryPlanDPSize.buildBindingsFromRange(results, bgp);
                callback(results);
            } else {
                callback(null);
            }
        });
    }
};

QueryPlanDPSize.buildBindingsFromRange = function(results, bgp) {
    QueryPlanDPSize.variablesInBGP(bgp);

    var components =  bgp.value||bgp;
    var bindings = {};
    for(comp in components) {
        if(components[comp] && components[comp].token === "var") {
            bindings[comp] = components[comp].value;
        } else if(components[comp] && components[comp].token === "blank") {
            bindings[comp] = "blank:"+components[comp].value;
        }
    }

    var resultsBindings =[];

    if(results!=null) {
        for(var i=0; i<results.length; i++) {
            var binding = {};
            var result  = results[i];
            var duplicated = false;
            for(var comp in bindings) {
                var value = result[comp];
                if(binding[bindings[comp]] == null || binding[bindings[comp]] === value) {
                    binding[bindings[comp]] = value;
                } else {
                    duplicated = true;
                    break;
                }
            }
            if(!duplicated)
                resultsBindings.push(binding);
        }
    }

    return resultsBindings;
};


// @used
QueryPlanDPSize.areCompatibleBindings = function(bindingsa, bindingsb) {
    for(var variable in bindingsa) {
        if(bindingsb[variable]!=null && (bindingsb[variable] != bindingsa[variable])) {
            return false;
        }
    }

    return true;
};

//QueryPlanDPSize.areCompatibleBindingsStrict = function(bindingsa, bindingsb) {
//    var foundSome = false;
//    for(var variable in bindingsa) {
// 	if(bindingsb[variable]!=null && (bindingsb[variable] != bindingsa[variable])) {
// 	    return false;
// 	} else if(bindingsb[variable] == bindingsa[variable]){
// 	    foundSome = true;
// 	}
//    }
//
//    return foundSome;
//};



QueryPlanDPSize.mergeBindings = function(bindingsa, bindingsb) {
    var merged = {};
    for(var variable in bindingsa) {
        merged[variable] = bindingsa[variable];
    }

    for(var variable in bindingsb) {
        merged[variable] = bindingsb[variable];
    }

    return merged;
};

QueryPlanDPSize.joinBindings2 = function(bindingVars, bindingsa, bindingsb) {
    var acum = {};
    var bindings, variable, variableValue, values, tmp;
    var joined = [];

    for(var i=0; i<bindingsa.length; i++) {
        bindings = bindingsa[i];
        tmp = acum;
        for(var j=0; j<bindingVars.length; j++) {
            variable = bindingVars[j];
            variableValue = bindings[variable];
            if(j == bindingVars.length-1) {
                values = tmp[variableValue] || [];
                values.push(bindings);
                tmp[variableValue] = values;
            } else {
                values = tmp[variableValue] || {};
                tmp[variableValue] = values;
                tmp = values;
            }
        }
    }

    for(var i=0; i<bindingsb.length; i++) {
        bindings = bindingsb[i];
        tmp = acum;
        for(var j=0; j<bindingVars.length; j++) {
            variable = bindingVars[j];
            variableValue = bindings[variable];

            if(tmp[variableValue] != null) {
                if(j == bindingVars.length-1) {
                    for(var k=0; k<tmp[variableValue].length; k++) {
                        joined.push(QueryPlanDPSize.mergeBindings(tmp[variableValue][k],bindings));
                    }
                } else {
                    tmp = tmp[variableValue];
                }
            }
        }
    }

    return joined;
};

QueryPlanDPSize.joinBindings = function(bindingsa, bindingsb) {
    var result = [];

    for(var i=0; i< bindingsa.length; i++) {
        var bindinga = bindingsa[i];
        for(var j=0; j<bindingsb.length; j++) {
            var bindingb = bindingsb[j];
            if(QueryPlanDPSize.areCompatibleBindings(bindinga, bindingb)){
                result.push(QueryPlanDPSize.mergeBindings(bindinga, bindingb));
            }
        }
    }
    return result;
};

QueryPlanDPSize.augmentMissingBindings = function(bindinga, bindingb) {
    for(var pb in bindingb) {
        if(bindinga[pb] == null) {
            bindinga[pb] = null;
        }
    }
    return bindinga;
};

/*
 QueryPlanDPSize.diff = function(bindingsa, biundingsb) {
 var result = [];

 for(var i=0; i< bindingsa.length; i++) {
 var bindinga = bindingsa[i];
 var matched = false;
 for(var j=0; j<bindingsb.length; j++) {
 var bindingb = bindingsb[j];
 if(QueryPlanDPSize.areCompatibleBindings(bindinga, bindingb)){
 matched = true;
 result.push(QueryPlanDPSize.mergeBindings(bindinga, bindingb));
 }
 }
 if(matched === false) {
 // missing bindings must be present for further processing
 // e.g. filtering by not present value (see DAWG tests
 // bev-6)
 QueryPlanDPSize.augmentMissingBindings(bindinga, bindingb);
 result.push(bindinga);
 }
 }

 return result;
 };
 */

QueryPlanDPSize.leftOuterJoinBindings = function(bindingsa, bindingsb) {
    var result = [];
    // strict was being passes ad an argument
    //var compatibleFunction = QueryPlanDPSize.areCompatibleBindings;
    //if(strict === true)
    // 	compatibleFunction = QueryPlanDPSize.areCompatibleBindingsStrict;

    for(var i=0; i< bindingsa.length; i++) {
        var bindinga = bindingsa[i];
        var matched = false;
        for(var j=0; j<bindingsb.length; j++) {
            var bindingb = bindingsb[j];
            if(QueryPlanDPSize.areCompatibleBindings(bindinga, bindingb)){
                matched = true;
                result.push(QueryPlanDPSize.mergeBindings(bindinga, bindingb));
            }
        }
        if(matched === false) {
            // missing bindings must be present for further processing
            // e.g. filtering by not present value (see DAWG tests
            // bev-6)
            // augmentMissingBindings set their value to null.
            QueryPlanDPSize.augmentMissingBindings(bindinga, bindingb);
            result.push(bindinga);
        }
    }
    return result;
};

QueryPlanDPSize.crossProductBindings = function(bindingsa, bindingsb) {
    var result = [];

    for(var i=0; i< bindingsa.length; i++) {
        var bindinga = bindingsa[i];
        for(var j=0; j<bindingsb.length; j++) {
            var bindingb = bindingsb[j];
            result.push(QueryPlanDPSize.mergeBindings(bindinga, bindingb));
        }
    }

    return result;
};

QueryPlanDPSize.unionBindings = function(bindingsa, bindingsb) {
    return bindingsa.concat(bindingsb);
};

QueryPlanDPSize.unionManyBindings = function(bindingLists) {
    var acum = [];
    for(var i=0; i<bindingLists.length; i++) {
        var bindings = bindingLists[i];
        acum = QueryPlanDPSize.unionBindings(acum, bindings);
    }

    return acum;
};


module.exports = {
    QueryPlan: QueryPlanDPSize
};

},{"./utils":55}],52:[function(_dereq_,module,exports){
var NetworkTransport = _dereq_("./network_transport").NetworkTransport;
var RVN3Parser = _dereq_("./rvn3_parser").RVN3Parser;
var JSONLDParser = _dereq_("./jsonld_parser").JSONLDParser;
var Utils = _dereq_("./utils");

 var RDFLoader = function (params) {

    this.precedences = ["text/turtle", "text/n3", "application/ld+json", "application/json"];
    this.parsers = {"text/turtle":RVN3Parser.parser, "text/n3":RVN3Parser.parser, "application/ld+json":JSONLDParser.parser, "application/json":JSONLDParser.parser};

    // Conditionally adding RDFXML parser
    if(typeof(RDFXMLParser) !== 'undefined') {
        this.precedences.push("application/rdf+xml");
        this.parsers["application/rdf+xml"] = RDFXMLParser.parser;
    }

    if (params != null) {
        for (var mime in params["parsers"]) {
            this.parsers[mime] = params["parsers"][mime];
        }
    }

    if (params && params["precedences"] != null) {
        this.precedences = params["precedences"];
        for (var mime in params["parsers"]) {
            if (!Utils.include(this.precedences, mime)) {
                this.precedences.push(mime);
            }
        }
    }

    this.acceptHeaderValue = "";
    for (var i = 0; i < this.precedences.length; i++) {
        if (i != 0) {
            this.acceptHeaderValue = this.acceptHeaderValue + "," + this.precedences[i];
        } else {
            this.acceptHeaderValue = this.acceptHeaderValue + this.precedences[i];
        }
    }
};

RDFLoader.prototype.registerParser = function(mediaType, parser) {
    this.parsers[mediaType] = parser;
    this.precedences.push(mediaType);
};

RDFLoader.prototype.unregisterParser = function(mediaType) {
    delete this.parsers[mediaType];
    var mediaTypes = [];
    for(var i=0; i<this.precedences.length; i++) {
        if(this.precedences[i] != mediaType) {
            mediaTypes.push(this.precedences[i]);
        }
    }

    this.precedences = mediaTypes;
};

RDFLoader.prototype.setAcceptHeaderPrecedence = function(mediaTypes) {
    this.precedences = mediaTypes;
};

RDFLoader.prototype.load = function(uri, graph, callback) {
    var that = this;
    NetworkTransport.load(uri, this.acceptHeaderValue, function(err, results){
        if(err) {
            callback(err);
        } else {
            var mime = results["headers"]["Content-Type"] || results["headers"]["content-type"];
            var data = results['data'];
            if(mime != null) {
                mime = mime.split(";")[0];
                for(var m in that.parsers) {
                    if(m.indexOf("/")!=-1) {
                        var mimeParts = m.split("/");
                        if(mimeParts[1] === '*') {
                            if(mime.indexOf(mimeParts[0])!=-1) {
                                return that.tryToParse(that.parsers[m], graph, data, {documentURI: uri}, callback);
                            }
                        } else {
                            if(mime.indexOf(m)!=-1) {
                                return that.tryToParse(that.parsers[m], graph, data, {documentURI: uri}, callback);
                            } else if(mime.indexOf(mimeParts[1])!=-1) {
                                return that.tryToParse(that.parsers[m], graph, data, {documentURI: uri}, callback);
                            }
                        }
                    } else {
                        if(mime.indexOf(m)!=-1) {
                            return that.tryToParse(that.parsers[m], graph, data, {documentURI: uri}, callback);
                        }
                    }
                }
                callback(new Error("Unknown media type : "+mime));
            } else {
                callback(new Error("Uknown media type"));
            }
        }});
};

RDFLoader.prototype.loadFromFile = function(parser, graph, uri, callback) {
    try {
        var that = this;
        var fs = _dereq_('fs');
        fs.readFile(uri.split("file:/")[1], function(err, data) {
            if(err) {
                callback(err);
            } else {
                var data = data.toString('utf8');
                that.tryToParse(parser, graph, data, {documentURI: uri}, callback);
            }
        });
    } catch(e) {
        callback(e);
    }
};

RDFLoader.prototype.tryToParse = function(parser, graph, input, options, callback) {
    // console.log("TRYING TO PARSE");
    // console.log(parser);
    // console.log(graph);
    // console.log(options);
    // console.log(callback);
    try {
        if(typeof(input) === 'string') {
            input = Utils.normalizeUnicodeLiterals(input);
        }
        parser.parse(input, graph, options, callback);

    } catch(e) {
        console.log(e.message);
        console.log(e.stack);
        callback(e);
    }
};

module.exports = {
    RDFLoader: RDFLoader
};


// var loader = require("./js-communication/src/rdf_loader").RDFLoader; loader = new loader.RDFLoader(); loader.load('http://dbpedialite.org/titles/Lisp_%28programming_language%29', function(success, results){console.log("hey"); console.log(success); console.log(results)})

},{"./jsonld_parser":41,"./network_transport":43,"./rvn3_parser":54,"./utils":55,"fs":1}],53:[function(_dereq_,module,exports){
// imports
var _ = _dereq_("./utils");
var QueryFilters = _dereq_("./query_filters").QueryFilters;

RDFModel = {};

/**
 * Implementation of <http://www.w3.org/TR/rdf-interfaces/>
 */

// Uris map

RDFModel.defaultContext = { "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "owl": "http://www.w3.org/2002/07/owl#",
    "xsd": "http://www.w3.org/2001/XMLSchema#",
    "dcterms": "http://purl.org/dc/terms/",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "cal": "http://www.w3.org/2002/12/cal/ical#",
    "vcard": "http://www.w3.org/2006/vcard/ns# ",
    "geo": "http://www.w3.org/2003/01/geo/wgs84_pos#",
    "cc": "http://creativecommons.org/ns#",
    "sioc": "http://rdfs.org/sioc/ns#",
    "doap": "http://usefulinc.com/ns/doap#",
    "com": "http://purl.org/commerce#",
    "ps": "http://purl.org/payswarm#",
    "gr": "http://purl.org/goodrelations/v1#",
    "sig": "http://purl.org/signature#",
    "ccard": "http://purl.org/commerce/creditcard#"
};

RDFModel.UrisMap = function() {
    this.defaultNs = "";
    this.interfaceProperties = ['get', 'remove', 'set', 'setDefault', 'addAll', 'resolve', 'shrink'];
};

RDFModel.UrisMap.prototype.values = function() {
    var collected = {};
    for(var p in this) {
        if(!_.include(this.interfaceProperties,p) &&
            typeof(this[p])!=='function' &&
            p!=='defaultNs' &&
            p!=='interfaceProperties') {
            collected[p] = this[p];
        }
    }

    return collected;
};

RDFModel.UrisMap.prototype.get = function(prefix) {
    if(prefix.indexOf(" ") != -1) {
        throw "Prefix must not contain any whitespaces";
    }
    return this[prefix];
};

RDFModel.UrisMap.prototype.remove = function(prefix) {
    if(prefix.indexOf(" ") != -1) {
        throw "Prefix must not contain any whitespaces";
    }

    delete this[prefix];

    return null;
};

RDFModel.UrisMap.prototype.set = function(prefix, iri) {
    if(prefix.indexOf(" ") != -1) {
        throw "Prefix must not contain any whitespaces";
    }

    this[prefix] = iri;
};


RDFModel.UrisMap.prototype.setDefault = function(iri) {
    this.defaultNs =iri;
};

RDFModel.UrisMap.prototype.addAll = function(prefixMap, override) {
    for(var prefix in prefixMap) {
        if(!_.include(this.interfaceProperties, prefix)) {
            if(this[prefix] != null) {
                if(override === true) {
                    this[prefix] = prefixMap[prefix];
                }
            } else {
                this[prefix] = prefixMap[prefix];
            }
        }
    }

    return this;
};

RDFModel.UrisMap.prototype.resolve = function(curie) {
    var parts = curie.split(":");
    var ns = parts[0];
    var suffix = parts[1];
    if(ns === '') {
        if(this.defaultNs == null) {
            return null;
        } else {
            return this.defaultNs + suffix;
        }
    } else if(this[ns] != null) {
        return this[ns] + suffix;
    } else {
        return null;
    }
};

RDFModel.UrisMap.prototype.shrink = function(iri) {
    for(var ns in this) {
        var prefix = this[ns];
        if(iri.indexOf(prefix) === 0) {
            if(prefix !== '' && ns != 'defaultNs') {
                var suffix = iri.split(prefix)[1];
                return ns + ":" + suffix;
            }
        }
    }

    return iri;
};

// Profile

RDFModel.Profile = function() {
    this.prefixes = new RDFModel.UrisMap();
    this.terms = new RDFModel.UrisMap();
};

RDFModel.Profile.prototype.importProfile = function(profile, override) {
    this.prefixes.addAll(profile.prefixes, override);
    this.terms.addAll(profile.terms, override);
};


RDFModel.Profile.prototype.resolve = function(toResolve) {
    if(toResolve.indexOf(":") != -1) {
        return this.prefixes.resolve(toResolve);
    } else if(this.terms[toResolve] != null) {
        return this.terms.resolve(toResolve);
    } else {
        return null;
    }
};

RDFModel.Profile.prototype.setDefaultPrefix = function(iri) {
    this.prefixes.setDefault(iri);
};

RDFModel.Profile.prototype.setDefaultVocabulary = function(iri) {
    this.terms.setDefault(iri);
};

RDFModel.Profile.prototype.setPrefix = function(prefix, iri) {
    this.prefixes.set(prefix, iri);
};

RDFModel.Profile.prototype.setTerm = function(term, iri) {
    this.terms.set(term, iri);
};

// RDF environemnt
RDFModel.RDFEnvironment = function () {
    RDFModel.Profile.call(this);
    this.blankNodeCounter = 0;
    var that = this;
    this.filters = {
        s:function (s) {
            return function (t) {
                return t.subject.equals(s);
            };
        },
        p:function (p) {
            return function (t) {
                return t.predicate.equals(p);
            };
        },
        o:function (o) {
            return function (t) {
                return t.object.equals(o);
            };
        },
        sp:function (s, p) {
            return function (t) {
                return t.subject.equals(s) && t.predicate.equals(p);
            };
        },
        so:function (s, o) {
            return function (t) {
                return t.subject.equals(s) && t.object.equals(o);
            };
        },
        po:function (p, o) {
            return function (t) {
                return t.predicate.equals(p) && t.object.equals(o);
            };
        },
        spo:function (s, p, o) {
            return function (t) {
                return t.subject.equals(s) && t.predicate.equals(p) && t.object.equals(o);
            };
        },
        describes:function (v) {
            return function (t) {
                return t.subject.equals(v) || t.object.equals(v);
            };
        },
        type:function (o) {
            var type = that.resolve("rdf:type");
            return function (t) {
                return t.predicate.equals(type) && t.object.equals(o);
            };
        }
    };

    for (var p in RDFModel.defaultContext) {
        this.prefixes.set(p, RDFModel.defaultContext[p]);
    }
};
RDFModel.RDFEnvironment.prototype = _.create(RDFModel.Profile.prototype,{'constructor': RDFModel.RDFEnvironment});

RDFModel.RDFEnvironment.prototype.createBlankNode = function() {
    var bnode =  new RDFModel.BlankNode(this.blankNodeCounter);
    this.blankNodeCounter++;
    return bnode;
};

RDFModel.RDFEnvironment.prototype.createNamedNode = function(value) {
    var resolvedValue = this.resolve(value);
    if(resolvedValue != null) {
        return new RDFModel.NamedNode(resolvedValue);
    } else {
        return new RDFModel.NamedNode(value);
    }
};

RDFModel.RDFEnvironment.prototype.createLiteral = function(value, language, datatype) {
    if(datatype != null) {
        return new RDFModel.Literal(value, language, datatype.toString());
    } else {
        return new RDFModel.Literal(value, language, datatype);
    }
};

RDFModel.RDFEnvironment.prototype.createTriple = function(subject, predicate, object) {
    return new RDFModel.Triple(subject, predicate, object);
};

RDFModel.RDFEnvironment.prototype.createGraph = function(triples) {
    var graph = new RDFModel.Graph();
    if(triples != null) {
        for(var i=0; i<triples.length; i++) {
            graph.add(triples[i]);
        }
    }
    return graph;
};

RDFModel.RDFEnvironment.prototype.createAction = function(test, action) {
    return function(triple) {
        if(test(triple)) {
            return action(triple);
        } else {
            return triple;
        }
    }
};

RDFModel.RDFEnvironment.prototype.createProfile = function(empty) {
    // empty (opt);
    if(empty === true) {
        return new RDFModel.RDFEnvironment.Profile();
    } else {
        var profile = new RDFModel.RDFEnvironment.Profile();
        profile.importProfile(this);

        return profile;
    }
};

RDFModel.RDFEnvironment.prototype.createTermMap = function(empty) {
    if(empty === true) {
        return new RDFModel.UrisMap();
    } else {
        var cloned = this.terms.values();
        var termMap = new RDFModel.UrisMap();

        for(var p in cloned) {
            termMap[p] = cloned[p];
        }

        return termMap;
    }
};

RDFModel.RDFEnvironment.prototype.createPrefixMap = function(empty) {
    if(empty === true) {
        return new RDFModel.UrisMap();
    } else {
        var cloned = this.prefixes.values();
        var prefixMap = new RDFModel.UrisMap();

        for(var p in cloned) {
            prefixMap[p] = cloned[p];
        }

        return prefixMap;
    }
};

// Common RDFNode interface

RDFModel.RDFNode = function(interfaceName){
    this.interfaceName = interfaceName;
    this.attributes  = ["interfaceName", "nominalValue"]
};

RDFModel.RDFNode.prototype.equals = function(otherNode) {
    if(otherNode.interfaceName == null) {
        return this.valueOf() == otherNode;

    } else {
        for(var i in this.attributes) {
            var attribute = this.attributes[i];
            if(this[attribute] != otherNode[attribute]) {
                return false;
            }
        }

        return true;
    }
};


// Blank node

RDFModel.BlankNode = function(bnodeId) {
    RDFModel.RDFNode.call(this, "BlankNode");
    this.nominalValue = "_:"+bnodeId;
    this.bnodeId = bnodeId;
};

RDFModel.BlankNode.prototype = _.create(RDFModel.RDFNode.prototype, {'constructor':RDFModel.BlankNode});

RDFModel.BlankNode.prototype.toString = function(){
    return this.nominalValue;
};

RDFModel.BlankNode.prototype.toNT = function() {
    return this.nominalValue;
};

RDFModel.BlankNode.prototype.valueOf = function() {
    return this.nominalValue;
};

// Literal node

RDFModel.Literal = function(value, language, datatype) {
    RDFModel.RDFNode.call(this, "Literal");
    this.nominalValue = value;
    if(language != null) {
        this.language = language;
    } else if(datatype != null) {
        this.datatype = datatype;
    }
};

RDFModel.Literal.prototype = _.create(RDFModel.RDFNode.prototype,{'constructor':RDFModel.Literal});

RDFModel.Literal.prototype.toString = function(){
    var tmp = '"'+this.nominalValue+'"';
    if(this.language != null) {
        tmp = tmp + "@" + this.language;
    } else if(this.datatype != null || this.type) {
        tmp = tmp + "^^<" + (this.datatype||this.type) + ">";
    }

    return tmp;
};

RDFModel.Literal.prototype.toNT = function() {
    return this.toString();
};

RDFModel.Literal.prototype.valueOf = function() {
    return QueryFilters.effectiveTypeValue({
        token: 'literal',
        type: (this.type || this.datatype),
        value: this.nominalValue,
        language: this.language
    });
};

// NamedNode node

RDFModel.NamedNode = function(val) {
    RDFModel.RDFNode.call(this, "NamedNode");
    if(val.value != null) {
        this.nominalValue = val.value;
    } else {
        this.nominalValue = val;
    }
};

RDFModel.NamedNode.prototype = _.create(RDFModel.RDFNode.prototype, {'constructor':RDFModel.NamedNode});

RDFModel.NamedNode.prototype.toString = function(){
    return this.nominalValue;
};

RDFModel.NamedNode.prototype.toNT = function() {
    return "<"+this.toString()+">";
};

RDFModel.NamedNode.prototype.valueOf = function() {
    return this.nominalValue;
};

// Triple interface
RDFModel.Triple = function(subject, predicate, object){
    this.subject = subject;
    this.predicate = predicate;
    this.object = object;
};

RDFModel.Triple.prototype.equals = function(otherTriple) {
    return this.subject.equals(otherTriple.subject) &&
        this.predicate.equals(otherTriple.predicate) &&
        this.object.equals(otherTriple.object);
};

RDFModel.Triple.prototype.toString = function() {
    return this.subject.toNT()+" "+this.predicate.toNT()+" "+this.object.toNT()+" . \r\n";
};

// Graph interface

RDFModel.Graph = function() {
    this.triples = [];
    this.duplicates = {};
    this.actions = [];
    this.length = 0;
};

RDFModel.Graph.prototype.add = function(triple) {
    for(var i=0; i<this.actions.length; i++) {
        triple = this.actions[i](triple);
    }

    var id = triple.subject.toString()+triple.predicate.toString()+triple.object.toString();
    if(!this.duplicates[id]) {
        this.duplicates[id] = true;
        this.triples.push(triple);
    }

    this.length = this.triples.length;
    return this;
};

RDFModel.Graph.prototype.addAction = function (tripleAction, run) {
    this.actions.push(tripleAction);
    if (run == true) {
        for (var i = 0; i < this.triples.length; i++) {
            this.triples[i] = tripleAction(this.triples[i]);
        }
    }

    return this;
};

RDFModel.Graph.prototype.addAll = function (graph) {
    var newTriples = graph.toArray();
    for (var i = 0; i < newTriples.length; i++) {
        this.add(newTriples[i]);
    }

    this.length = this.triples.length;
    return this;
};

RDFModel.Graph.prototype.remove = function(triple) {
    var toRemove = null;
    for(var i=0; i<this.triples.length; i++) {
        if(this.triples[i].equals(triple)) {
            var id = triple.subject.toString()+triple.predicate.toString()+triple.object.toString();
            delete this.duplicates[id];
            toRemove = i;
            break;
        }
    }

    if(toRemove!=null) {
        this.triples.splice(toRemove,1);
    }

    this.length = this.triples.length;
    return this;
};

RDFModel.Graph.prototype.toArray = function() {
    return this.triples;
};

RDFModel.Graph.prototype.some = function(p) {
    for(var i=0; i<this.triples.length; i++) {
        if(p(this.triples[i],this) === true) {
            return true;
        }
    }

    return false;
};

RDFModel.Graph.prototype.every = function(p) {
    for(var i=0; i<this.triples.length; i++) {
        if(p(this.triples[i],this) === false) {
            return false;
        }
    }

    return true;
};

RDFModel.Graph.prototype.filter = function(f) {
    var tmp = new RDFModel.Graph();

    for(var i=0; i<this.triples.length; i++) {
        if(f(this.triples[i],this) === true) {
            tmp.add(this.triples[i]);
        }
    }

    return tmp;
};

RDFModel.Graph.prototype.forEach = function(f) {
    for(var i=0; i<this.triples.length; i++) {
        f(this.triples[i],this);
    }
};

RDFModel.Graph.prototype.merge = function(g) {
    var newGraph = new RDFModel.Graph();
    for(var i=0; i<this.triples.length; i++)
        newGraph.add(this.triples[i]);

    return newGraph;
};

RDFModel.Graph.prototype.match = function(subject, predicate, object, limit) {
    var graph = new RDFModel.Graph();

    var matched = 0;
    for(var i=0; i<this.triples.length; i++) {
        var triple = this.triples[i];
        if(subject == null || (triple.subject.equals(subject))) {
            if(predicate == null || (triple.predicate.equals(predicate))) {
                if(object == null || (triple.object.equals(object))) {
                    if(limit==null || matched < limit) {
                        matched++;
                        graph.add(triple);
                    } else {
                        return graph;
                    }
                }
            }
        }
    }

    return graph;
};

RDFModel.Graph.prototype.removeMatches = function(subject, predicate, object) {
    var toRemove = [];
    for(var i=0; i<this.triples.length; i++) {
        var triple = this.triples[i];
        if(subject == null || (triple.subject.equals(subject))) {
            if(predicate == null || (triple.predicate.equals(predicate))) {
                if(object == null || (triple.object.equals(object))) {
                    toRemove.push(triple);
                }
            }
        }
    }

    for(var i=0; i<toRemove.length; i++) {
        this.remove(toRemove[i]);
    }

    return this;
};

RDFModel.Graph.prototype.toNT = function() {
    var n3 = "";

    this.forEach(function(triple) {
        n3 = n3 + triple.toString();
    });

    return n3;
};

// Builders for the query engine

RDFModel.buildRDFResource = function(value, bindings, engine, env) {
    if(value.token === 'blank') {
        return RDFModel.buildBlankNode(value, bindings, engine, env);
    } else if(value.token === 'literal') {
        return RDFModel.buildLiteral(value, bindings, engine, env);
    } else if(value.token === 'uri') {
        return RDFModel.buildNamedNode(value, bindings, engine, env);
    } else if(value.token === 'var') {
        var result = bindings[value.value];
        if(result != null) {
            return RDFModel.buildRDFResource(result, bindings, engine, env);
        } else {
            return null;
        }
    } else {
        return null;
    }
};

RDFModel.buildBlankNode = function(value, bindings, engine, env) {
    if(value.valuetmp != null) {
        value.value = value.valuetmp;
    }
    if(value.value.indexOf("_:") === 0) {
        value.value = value.value.split("_:")[1];
    }
    return new RDFModel.BlankNode(value.value);
};

RDFModel.buildLiteral = function(value, bindings, engine, env) {
    return new RDFModel.Literal(value.value, value.lang, value.type);
};

RDFModel.buildNamedNode = function(value, bindings, engine, env) {
    if(value.value != null) {
        return new RDFModel.NamedNode(value);
    } else {
        if(value.prefix != null) {
            var prefix = engine.resolveNsInEnvironment(value.prefix, env);
            value.value = prefix+value.suffix;
            return new RDFModel.NamedNode(value);
        } else {
            return new RDFModel.NamedNode(value);
        }
    }
};

RDFModel.rdf = new RDFModel.RDFEnvironment();

module.exports = RDFModel;

},{"./query_filters":50,"./utils":55}],54:[function(_dereq_,module,exports){
//var N3Parser = require('n3').Parser;
var N3Parser = _dereq_('../node_modules/n3/lib/N3Parser');

// Add a wrapper around the N3.js parser
var RVN3Parser = {};
RVN3Parser.parser = {
    async: true,
    parse: function (data, graph, options, callback) {
        // Shift arguments if necessary
        if (!callback) {
            callback = options;
            options = graph;
            graph = null;
        }

        // Make sure graph is an object
        if (graph && typeof(graph) === 'string')
            graph = { token: 'uri', value: graph, prefix: null, suffix: null };
        // Convert options
        if (options && options.baseURI)
            options.documentIRI = options.baseURI;

        // Parse triples into array
        var triples = [];
        new N3Parser(options).parse(data, function (error, triple) {
            if (error)
                callback(error);
            else if (!triple)
                callback(false, triples);
            else
                triples.push({
                    subject:   convertEntity(triple.subject),
                    predicate: convertEntity(triple.predicate),
                    object:    convertEntity(triple.object),
                    graph:     graph
                });
        });
    },

    resetBlankNodeIds: function() {
        N3Parser._resetBlankNodeIds();
    }

};

// Converts an entity in N3.js representation to this library's representation
function convertEntity(entity) {
    switch (entity[0]) {
        case '"': {
            if(entity.indexOf("^^") > 0) {
                var parts = entity.split("^^");
                return {literal: parts[0] + "^^<" + parts[1] + ">" };
            } else {
                return { literal: entity };
            }
        }
        case '_': return { blank: entity.replace('b', '') };
        default:  return { token: 'uri', value: entity, prefix: null, suffix: null };
    }
}

module.exports = {
    RVN3Parser: RVN3Parser
};
},{"../node_modules/n3/lib/N3Parser":36}],55:[function(_dereq_,module,exports){
(function (process){
var nextTick = (function () {

    var global = null;
    if(typeof window !== 'undefined')
        global = window;
    else if(typeof process !== 'undefined')
        global = process;


    var canSetImmediate = typeof global !== 'undefined' && global.setImmediate;
    var canPost = typeof global !== 'undefined' && global.postMessage && global.addEventListener;

    // setImmediate
    if (canSetImmediate)
        return function (f) { return global.setImmediate(f) };

    // Node.js specific
    if(global !== 'undefined' && global.nextTick && typeof _dereq_ === 'function') {
        if(_dereq_('timers') && _dereq_('timers').setImmediate)
            return _dereq_('timers').setImmediate;
        else
            return global.nextTick;
    }

    // postMessage
    if (canPost) {
        var queue = [];
        global.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === global || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);
        return function nextTick(fn) {
            queue.push(fn);
            global.postMessage('process-tick', '*');
        };
    }


    // setTimeout
    return function nextTick(fn) {
        setTimeout(fn, 0);
    };

})();

/**
 * Function that generates a hash key for a bound term.
 * @param term
 * @returns {*}
 */
var hashTerm = function(term) {
    try {
        if(term == null) {
            return "";
        } if(term.token==='uri') {
            return "u"+term.value;
        } else if(term.token === 'blank') {
            return "b"+term.value;
        } else if(term.token === 'literal') {
            var l = "l"+term.value;
            l = l + (term.type || "");
            l = l + (term.lang || "");

            return l;
        }
    } catch(e) {
        if(typeof(term) === 'object') {
            var key = "";
            for(p in term) {
                key = key + p + term[p];
            }

            return key;
        }
        return term;
    }
};

/**
 * Returns a String with the lexical representation of a URI term.
 * @param term the URI term to be transformed into a String representation.
 * @param env Repository of the prefixes where th prefix of the URI will be resolved.
 * @returns the lexical representation of the URI term.
 */
var lexicalFormBaseUri = function(term, env) {
    var uri = null;
    env = env || {};
    if(term.value == null) {
        // URI has prefix and suffix, we'll try to resolve it.
        var prefix = term.prefix;
        var suffix = term.suffix;
        var resolvedPrefix = env.namespaces[prefix];
        if(resolvedPrefix != null) {
            uri = resolvedPrefix+suffix;
        } else {
            uri = prefix+":"+suffix;
        }
    } else {
        // URI is not prefixed
        uri = term.value;
    }

    if(uri===null) {
        return null;
    } else {
        // Should we apply the base URI namespace?
        if(uri.indexOf(":") == -1) {
            uri = (env.base||"") + uri; // applyBaseUri
        }
    }

    return uri;
};


parseISO8601 = function (str) {
    return Date.parse(str);
};

if (!Date.prototype.toISOString) {
    (function() {

        function pad(number) {
            if (number < 10) {
                return '0' + number;
            }
            return number;
        }

        Date.prototype.toISOString = function() {
            return this.getUTCFullYear() +
                '-' + pad(this.getUTCMonth() + 1) +
                '-' + pad(this.getUTCDate()) +
                'T' + pad(this.getUTCHours()) +
                ':' + pad(this.getUTCMinutes()) +
                ':' + pad(this.getUTCSeconds()) +
                '.' + (this.getUTCMilliseconds() / 1000).toFixed(3).slice(2, 5) +
                'Z';
        };

    }());
}

iso8601 = function(date) {
    return date.toISOString();
};

compareDateComponents = function(stra,strb) {
    var dateA = parseISO8601(stra);
    var dateB = parseISO8601(strb);

    if(dateA == dateB) {
        return 0;
    } else if(dateA < dateB) {
        return -1;
    } else {
        return 1;
    }
};

lexicalFormLiteral = function(term, env) {
    var value = term.value;
    var lang = term.lang;
    var type = term.type;

    var indexedValue = null;
    if(value != null && type != null && typeof(type) != 'string') {
        var typeValue = type.value;

        if(typeValue == null) {
            var typePrefix = type.prefix;
            var typeSuffix = type.suffix;

            var resolvedPrefix = env.namespaces[typePrefix];
            term.type = resolvedPrefix+typeSuffix;
            typeValue = resolvedPrefix+typeSuffix;
        }
        // normalization
        if(typeValue.indexOf('hexBinary') != -1) {
            indexedValue = '"' + term.value.toLowerCase() + '"^^<' + typeValue + '>';
        } else {
            indexedValue = '"' + term.value + '"^^<' + typeValue + '>';
        }
    } else {
        if(lang == null && type == null) {
            indexedValue = '"' + value + '"';
        } else if(type == null) {
            indexedValue = '"' + value + '"' + "@" + lang;
        } else {
            // normalization
            if(type.indexOf('hexBinary') != -1) {
                indexedValue = '"' + term.value.toLowerCase() + '"^^<'+type+'>';
            } else {
                indexedValue = '"' + term.value + '"^^<'+type+'>';
            }
        }
    }
    return indexedValue;
};

normalizeUnicodeLiterals = function (string) {
    var escapedUnicode = string.match(/\\u[0-9abcdefABCDEF]{4,4}/g) || [];
    var dups = {};
    for (var i = 0; i < escapedUnicode.length; i++) {
        if (dups[escapedUnicode[i]] == null) {
            dups[escapedUnicode[i]] = true;
            string = string.replace(new RegExp("\\" + escapedUnicode[i], "g"), eval("'" + escapedUnicode[i] + "'"));
        }
    }

    return string;
};

registerIndexedDB = function(that) {
    if(typeof(window) === 'undefined') {
        var sqlite3 = _dereq_('sqlite3')
        var indexeddbjs = _dereq_("indexeddb-js");
        var engine    = new sqlite3.Database(':memory:');
        var scope     = indexeddbjs.makeScope('sqlite3', engine);
        that.indexedDB = scope.indexedDB;
        that.IDBKeyRange = scope.IDBKeyRange;
    } else {
        // In the following line, you should include the prefixes of implementations you want to test.
        window.indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
        window.IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;
        // DON'T use "var indexedDB = ..." if you're not in a function.
        // Moreover, you may need references to some window.IDB* objects:
        if (!window.indexedDB) {
            callback(null,new Error("The browser does not support IndexDB."));
        } else {
            that.indexedDB = window.indexedDB;
            that.IDBKeyRange = window.IDBKeyRange;
        }
    }
};

function guid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
        s4() + '-' + s4() + s4() + s4();
}

hashTerm = function(term) {
    try {
        if(term == null) {
            return "";
        } if(term.token==='uri') {
            return "u"+term.value;
        } else if(term.token === 'blank') {
            return "b"+term.value;
        } else if(term.token === 'literal') {
            var l = "l"+term.value;
            l = l + (term.type || "");
            l = l + (term.lang || "");

            return l;
        }
    } catch(e) {
        if(typeof(term) === 'object') {
            var key = "";
            for(p in term) {
                key = key + p + term[p];
            }

            return key;
        }
        return term;
    }
};

var reject = function(xs,p) {
    var acc = [];
    for(var i=0; i<xs.length; i++) {
        if(p(xs[i])) {
            acc.push(xs[i]);
        }
    }

    return acc;
};

var include = function(xs,p) {
    for(var i=0; i<xs.length; i++){
        if(xs[i] === p)
            return true;
    }

    return false;
};

var each = function(xs,f) {
    if(xs.forEach) {
        xs.forEach(f);
    } else {
        for (var i = 0; i < xs.length; i++)
            f(xs[i]);
    }
};

var map = function(xs,f) {
    if(xs.map) {
        return xs.map(f);
    } else {
        var acc = [];
        for (var i = 0; i < xs.length; i++)
            acc[i] = f(xs[i]);

        return acc;
    }
};

var keys = function(xs) {
    var acc = [];
    for(var p in xs)
        acc.push(p);
    return acc;
};

var values = function(xs) {
    var acc = [];
    for(var p in xs)
        acc.push(xs[p]);
    return acc;
};

var size = function(xs) {
    if(xs.length) {
        return xs.length;
    } else {
        var acc = 0;
        for(var p in xs)
            acc++;
        return acc;
    }
};

clone = function(value) {
    return JSON.parse(JSON.stringify(value));
};

var isObject = function(value) {
    // Avoid a V8 JIT bug in Chrome 19-20.
    // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
    var type = typeof value;
    return type == 'function' || (value && type == 'object') || false;
};


var create = (function() {
    function Object() {}
    return function(prototype) {
        if (isObject(prototype)) {
            Object.prototype = prototype;
            var result = new Object;
            Object.prototype = null;
        }
        return result || Object();
    };
}());

var whilst = function (test, iterator, callback) {
    if (test()) {
        iterator(function (err) {
            if (err) {
                return callback(err);
            }
            whilst(test, iterator, callback);
        });
    }
    else {
        callback();
    }
};


var eachSeries = function (arr, iterator, callback) {
    callback = callback || function () {};
    if (!arr.length) {
        return callback();
    }
    var completed = 0;
    var iterate = function () {
        iterator(arr[completed], function (err) {
            if (err) {
                callback(err);
                callback = function () {};
            }
            else {
                completed += 1;
                if (completed >= arr.length) {
                    callback();
                }
                else {
                    iterate();
                }
            }
        });
    };
    iterate();
};


var reduce = function (arr, memo, iterator, callback) {
    eachSeries(arr, function (x, callback) {
        iterator(memo, x, function (err, v) {
            memo = v;
            callback(err);
        });
    }, function (err) {
        callback(err, memo);
    });
};

var seq = function (/* functions... */) {
    var fns = arguments;
    return function () {
        var that = this;
        var args = Array.prototype.slice.call(arguments);
        var callback = args.pop();
        reduce(fns, args, function (newargs, fn, cb) {
                fn.apply(that, newargs.concat([function () {
                    var err = arguments[0];
                    var nextargs = Array.prototype.slice.call(arguments, 1);
                    cb(err, nextargs);
                }]))
            },
            function (err, results) {
                callback.apply(that, [err].concat(results));
            });
    };
};



module.exports = {
    nextTick: nextTick,
    hasTerm: hashTerm,
    lexicalFormBaseUri: lexicalFormBaseUri,
    parseISO8601: parseISO8601,
    compareDateComponents: compareDateComponents,
    iso8601: iso8601,
    normalizeUnicodeLiterals: normalizeUnicodeLiterals,
    lexicalFormLiteral: lexicalFormLiteral,
    registerIndexedDB: registerIndexedDB,
    guid: guid,
    hashTerm: hashTerm,
    keys: keys,
    values: values,
    size: size,
    map: map,
    each: each,
    forEach: each,
    include: include,
    reject: reject,
    remove: reject,
    clone: clone,
    create: create,
    whilst: whilst,
    eachSeries: eachSeries,
    seq: seq
};

}).call(this,_dereq_("VCmEsw"))
},{"VCmEsw":13,"timers":26}]},{},[39])
(39)
});