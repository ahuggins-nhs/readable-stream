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

'use strict'

import { Buffer } from 'https://deno.land/std@0.64.0/node/buffer.ts'

export interface StringDecoder {
  new (encoding: string): StringDecoder
  write(buf: Buffer): string
}

var isEncoding =
  Buffer.isEncoding ||
  function (encoding) {
    encoding = '' + encoding
    switch (encoding && encoding.toLowerCase()) {
      case 'hex':
      case 'utf8':
      case 'utf-8':
      case 'ascii':
      case 'binary':
      case 'base64':
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
      case 'raw':
        return true
      default:
        return false
    }
  }

function _normalizeEncoding (enc: string) {
  if (!enc) return 'utf8'
  var retried
  while (true) {
    switch (enc) {
      case 'utf8':
      case 'utf-8':
        return 'utf8'
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return 'utf16le'
      case 'latin1':
      case 'binary':
        return 'latin1'
      case 'base64':
      case 'ascii':
      case 'hex':
        return enc
      default:
        if (retried) return // undefined
        enc = ('' + enc).toLowerCase()
        retried = true
    }
  }
}

// Do not cache `Buffer.isEncoding` when checking encoding names as some
// modules monkey-patch it to support additional encodings
function normalizeEncoding (enc: string) {
  var nenc = _normalizeEncoding(enc)
  if (typeof nenc !== 'string' && (Buffer.isEncoding === isEncoding || !isEncoding(enc)))
    throw new Error('Unknown encoding: ' + enc)
  return nenc || enc
}

// StringDecoder provides an interface for efficiently splitting a series of
// buffers into a series of JS strings without breaking apart multi-byte
// characters.
export const StringDecoder = (function StringDecoder (this: any, encoding: string) {
  this.encoding = normalizeEncoding(encoding)
  var nb
  switch (this.encoding) {
    case 'utf16le':
      this.text = utf16Text
      this.end = utf16End
      nb = 4
      break
    case 'utf8':
      this.fillLast = utf8FillLast
      nb = 4
      break
    case 'base64':
      this.text = base64Text
      this.end = base64End
      nb = 3
      break
    default:
      this.write = simpleWrite
      this.end = simpleEnd
      return
  }
  this.lastNeed = 0
  this.lastTotal = 0
  this.lastChar = Buffer.allocUnsafe(nb)
} as unknown) as StringDecoder

StringDecoder.prototype.write = function (buf: Buffer): string {
  if (buf.length === 0) return ''
  var r
  var i
  if (this.lastNeed) {
    r = this.fillLast(buf)
    if (r === undefined) return ''
    i = this.lastNeed
    this.lastNeed = 0
  } else {
    i = 0
  }
  if (i < buf.length) return r ? r + this.text(buf, i) : this.text(buf, i)
  return r || ''
}

StringDecoder.prototype.end = utf8End

// Returns only complete characters in a Buffer
StringDecoder.prototype.text = utf8Text

// Attempts to complete a partial non-UTF-8 character using bytes from a Buffer
StringDecoder.prototype.fillLast = function (buf: Buffer) {
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, this.lastNeed)
    return this.lastChar.toString(this.encoding, 0, this.lastTotal)
  }
  buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, buf.length)
  this.lastNeed -= buf.length
}

// Checks the type of a UTF-8 byte, whether it's ASCII, a leading byte, or a
// continuation byte. If an invalid byte is detected, -2 is returned.
function utf8CheckByte (byte: number) {
  if (byte <= 0x7f) return 0
  else if (byte >> 5 === 0x06) return 2
  else if (byte >> 4 === 0x0e) return 3
  else if (byte >> 3 === 0x1e) return 4
  return byte >> 6 === 0x02 ? -1 : -2
}

// Checks at most 3 bytes at the end of a Buffer in order to detect an
// incomplete multi-byte UTF-8 character. The total number of bytes (2, 3, or 4)
// needed to complete the UTF-8 character (if applicable) are returned.
function utf8CheckIncomplete (self: any, buf: Buffer, i: number) {
  var j = buf.length - 1
  if (j < i) return 0
  var nb = utf8CheckByte(buf[j])
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 1
    return nb
  }
  if (--j < i || nb === -2) return 0
  nb = utf8CheckByte(buf[j])
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 2
    return nb
  }
  if (--j < i || nb === -2) return 0
  nb = utf8CheckByte(buf[j])
  if (nb >= 0) {
    if (nb > 0) {
      if (nb === 2) nb = 0
      else self.lastNeed = nb - 3
    }
    return nb
  }
  return 0
}

// Validates as many continuation bytes for a multi-byte UTF-8 character as
// needed or are available. If we see a non-continuation byte where we expect
// one, we "replace" the validated continuation bytes we've seen so far with
// a single UTF-8 replacement character ('\ufffd'), to match v8's UTF-8 decoding
// behavior. The continuation byte check is included three times in the case
// where all of the continuation bytes for a character exist in the same buffer.
// It is also done this way as a slight performance increase instead of using a
// loop.
function utf8CheckExtraBytes (self: any, buf: Buffer, p: any) {
  if ((buf[0] & 0xc0) !== 0x80) {
    self.lastNeed = 0
    return '\ufffd'
  }
  if (self.lastNeed > 1 && buf.length > 1) {
    if ((buf[1] & 0xc0) !== 0x80) {
      self.lastNeed = 1
      return '\ufffd'
    }
    if (self.lastNeed > 2 && buf.length > 2) {
      if ((buf[2] & 0xc0) !== 0x80) {
        self.lastNeed = 2
        return '\ufffd'
      }
    }
  }
}

// Attempts to complete a multi-byte UTF-8 character using bytes from a Buffer.
function utf8FillLast (this: any, buf: Buffer) {
  var p = this.lastTotal - this.lastNeed
  var r = utf8CheckExtraBytes(this, buf, p)
  if (r !== undefined) return r
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, p, 0, this.lastNeed)
    return this.lastChar.toString(this.encoding, 0, this.lastTotal)
  }
  buf.copy(this.lastChar, p, 0, buf.length)
  this.lastNeed -= buf.length
}

// Returns all complete UTF-8 characters in a Buffer. If the Buffer ended on a
// partial character, the character's bytes are buffered until the required
// number of bytes are available.
function utf8Text (this: any, buf: Buffer, i: number) {
  var total = utf8CheckIncomplete(this, buf, i)
  if (!this.lastNeed) return buf.toString('utf8', i)
  this.lastTotal = total
  var end = buf.length - (total - this.lastNeed)
  buf.copy(this.lastChar, 0, end)
  return buf.toString('utf8', i, end)
}

// For UTF-8, a replacement character is added when ending on a partial
// character.
function utf8End (this: any, buf: Buffer) {
  var r = buf && buf.length ? this.write(buf) : ''
  if (this.lastNeed) return r + '\ufffd'
  return r
}

// UTF-16LE typically needs two bytes per character, but even if we have an even
// number of bytes available, we need to check if we end on a leading/high
// surrogate. In that case, we need to wait for the next two bytes in order to
// decode the last character properly.
function utf16Text (this: any, buf: Buffer, i: number) {
  if ((buf.length - i) % 2 === 0) {
    var r = buf.toString('utf16le', i)
    if (r) {
      var c = r.charCodeAt(r.length - 1)
      if (c >= 0xd800 && c <= 0xdbff) {
        this.lastNeed = 2
        this.lastTotal = 4
        this.lastChar[0] = buf[buf.length - 2]
        this.lastChar[1] = buf[buf.length - 1]
        return r.slice(0, -1)
      }
    }
    return r
  }
  this.lastNeed = 1
  this.lastTotal = 2
  this.lastChar[0] = buf[buf.length - 1]
  return buf.toString('utf16le', i, buf.length - 1)
}

// For UTF-16LE we do not explicitly append special replacement characters if we
// end on a partial character, we simply let v8 handle that.
function utf16End (this: any, buf: Buffer) {
  var r = buf && buf.length ? this.write(buf) : ''
  if (this.lastNeed) {
    var end = this.lastTotal - this.lastNeed
    return r + this.lastChar.toString('utf16le', 0, end)
  }
  return r
}

function base64Text (this: any, buf: Buffer, i: number) {
  var n = (buf.length - i) % 3
  if (n === 0) return buf.toString('base64', i)
  this.lastNeed = 3 - n
  this.lastTotal = 3
  if (n === 1) {
    this.lastChar[0] = buf[buf.length - 1]
  } else {
    this.lastChar[0] = buf[buf.length - 2]
    this.lastChar[1] = buf[buf.length - 1]
  }
  return buf.toString('base64', i, buf.length - n)
}

function base64End (this: any, buf: Buffer) {
  var r = buf && buf.length ? this.write(buf) : ''
  if (this.lastNeed) return r + this.lastChar.toString('base64', 0, 3 - this.lastNeed)
  return r
}

// Pass bytes on through for single-byte encodings (e.g. ascii, latin1, hex)
function simpleWrite (this: any, buf: Buffer) {
  return buf.toString(this.encoding)
}

function simpleEnd (this: any, buf: Buffer) {
  return buf && buf.length ? this.write(buf) : ''
}
