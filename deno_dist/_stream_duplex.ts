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
'use strict'

import inherits from './internal/inherits.ts'
import { Readable } from './_stream_readable.ts'
import { Writable } from './_stream_writable.ts'
import { DuplexOptions } from './Interfaces.ts'

export interface Duplex extends Readable {
  new (options?: DuplexOptions): Duplex
  writable: boolean
  writableEnded: boolean
  writableFinished: boolean
  writableHighWaterMark: number
  writableLength: number
  writableObjectMode: boolean
  writableCorked: number
  _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void
  _writev?(chunks: Array<{ chunk: any; encoding: BufferEncoding }>, callback: (error?: Error | null) => void): void
  _destroy(error: Error | null, callback: (error: Error | null) => void): void
  _final(callback: (error?: Error | null) => void): void
  write(chunk: any, encoding?: BufferEncoding, cb?: (error: Error | null | undefined) => void): boolean
  write(chunk: any, cb?: (error: Error | null | undefined) => void): boolean
  setDefaultEncoding(encoding: BufferEncoding): this
  end(cb?: () => void): void
  end(chunk: any, cb?: () => void): void
  end(chunk: any, encoding?: BufferEncoding, cb?: () => void): void
  cork(): void
  uncork(): void
}

/*<replacement>*/

var objectKeys =
  Object.keys ||
  function (obj: any) {
    var keys = []

    for (var key in obj) {
      keys.push(key)
    }

    return keys
  }
/*</replacement>*/

export const Duplex = (function Duplex (options?: DuplexOptions): void {
  if (!(this instanceof Duplex)) return new (Duplex as any)(options)
  Readable.call(this, options)
  Writable.call(this, options)
  this.allowHalfOpen = true

  if (options) {
    if (options.readable === false) this.readable = false
    if (options.writable === false) this.writable = false

    if (options.allowHalfOpen === false) {
      this.allowHalfOpen = false
      this.once('end', onend)
    }
  }
} as unknown) as Duplex

inherits(Duplex, Readable)

{
  // Allow the keys array to be GC'ed.
  var keys = objectKeys(Writable.prototype)

  for (var v = 0; v < keys.length; v++) {
    var method = keys[v]
    if (!Duplex.prototype[method]) Duplex.prototype[method] = Writable.prototype[method]
  }
}

Object.defineProperty(Duplex.prototype, 'writableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get () {
    return this._writableState.highWaterMark
  }
})
Object.defineProperty(Duplex.prototype, 'writableBuffer', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get () {
    return this._writableState && this._writableState.getBuffer()
  }
})
Object.defineProperty(Duplex.prototype, 'writableLength', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get () {
    return this._writableState.length
  }
}) // the no-half-open enforcer

function onend () {
  // If the writable side ended, then we're ok.
  if (this._writableState.ended) return // no more data can be written.
  // But allow more writes to happen in this tick.

  process.nextTick(onEndNT, this)
}

function onEndNT (self: any) {
  self.end()
}

Object.defineProperty(Duplex.prototype, 'destroyed', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get () {
    if (this._readableState === undefined || this._writableState === undefined) {
      return false
    }

    return this._readableState.destroyed && this._writableState.destroyed
  },
  set: function set (value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (this._readableState === undefined || this._writableState === undefined) {
      return
    } // backward compatibility, the user is explicitly
    // managing destroyed

    this._readableState.destroyed = value
    this._writableState.destroyed = value
  }
})
