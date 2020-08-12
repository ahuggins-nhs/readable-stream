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
// Implement an async ._write(chunk, encoding, cb), and it'll handle all
// the drain event emission and buffering.
'use strict'

import { Buffer } from 'https://deno.land/std@0.64.0/node/buffer.ts'
import { nextTick, NextTickCallback } from './internal/next_tick.ts'
import deprecate from './internal/util_deprecate.ts'
import inherits from './internal/inherits.ts'
import { codes as _require$codes } from './errors.ts'
import { getHighWaterMark } from './internal/streams/state.ts'
import * as destroyImpl from './internal/streams/destroy.ts'
import Stream from './internal/streams/stream.ts'
import { Duplex } from './_stream_duplex.ts'
import { Readable } from './_stream_readable.ts'
import { WritableOptions, BufferEncoding } from './Interfaces.ts'
import EventEmitter from './internal/streams/stream.ts'

export interface Writable {
  new (options?: WritableOptions): Writable
  writable: boolean
  writableEnded: boolean
  writableFinished: boolean
  writableHighWaterMark: number
  writableLength: number
  writableObjectMode: boolean
  writableCorked: number
  destroyed: boolean
  WritableState: typeof WritableState
  _writableState: WritableState
  _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void
  _writev?(chunks: Array<{ chunk: any; encoding: BufferEncoding }>, callback: (error?: Error | null) => void): void
  _destroy(error: Error | null, callback: (error?: Error | null) => void): void
  _final(callback: (error?: Error | null) => void): void
  write(chunk: any, cb?: (error: Error | null | undefined) => void): boolean
  write(chunk: any, encoding: BufferEncoding, cb?: (error: Error | null | undefined) => void): boolean
  setDefaultEncoding(encoding: BufferEncoding): this
  end(cb?: () => void): void
  end(chunk: any, cb?: () => void): void
  end(chunk: any, encoding: BufferEncoding, cb?: () => void): void
  cork(): void
  uncork(): void
  destroy(error?: Error): void

  /**
   * Event emitter
   * The defined events on documents including:
   * 1. close
   * 2. drain
   * 3. error
   * 4. finish
   * 5. pipe
   * 6. unpipe
   */
  addListener(event: 'close', listener: () => void): this
  addListener(event: 'drain', listener: () => void): this
  addListener(event: 'error', listener: (err: Error) => void): this
  addListener(event: 'finish', listener: () => void): this
  addListener(event: 'pipe', listener: (src: Readable) => void): this
  addListener(event: 'unpipe', listener: (src: Readable) => void): this
  addListener(event: string | symbol, listener: (...args: any[]) => void): this

  emit(event: 'close'): boolean
  emit(event: 'drain'): boolean
  emit(event: 'error', err: Error): boolean
  emit(event: 'finish'): boolean
  emit(event: 'pipe', src: Readable): boolean
  emit(event: 'unpipe', src: Readable): boolean
  emit(event: string | symbol, ...args: any[]): boolean

  on(event: 'close', listener: () => void): this
  on(event: 'drain', listener: () => void): this
  on(event: 'error', listener: (err: Error) => void): this
  on(event: 'finish', listener: () => void): this
  on(event: 'pipe', listener: (src: Readable) => void): this
  on(event: 'unpipe', listener: (src: Readable) => void): this
  on(event: string | symbol, listener: (...args: any[]) => void): this

  once(event: 'close', listener: () => void): this
  once(event: 'drain', listener: () => void): this
  once(event: 'error', listener: (err: Error) => void): this
  once(event: 'finish', listener: () => void): this
  once(event: 'pipe', listener: (src: Readable) => void): this
  once(event: 'unpipe', listener: (src: Readable) => void): this
  once(event: string | symbol, listener: (...args: any[]) => void): this

  prependListener(event: 'close', listener: () => void): this
  prependListener(event: 'drain', listener: () => void): this
  prependListener(event: 'error', listener: (err: Error) => void): this
  prependListener(event: 'finish', listener: () => void): this
  prependListener(event: 'pipe', listener: (src: Readable) => void): this
  prependListener(event: 'unpipe', listener: (src: Readable) => void): this
  prependListener(event: string | symbol, listener: (...args: any[]) => void): this

  prependOnceListener(event: 'close', listener: () => void): this
  prependOnceListener(event: 'drain', listener: () => void): this
  prependOnceListener(event: 'error', listener: (err: Error) => void): this
  prependOnceListener(event: 'finish', listener: () => void): this
  prependOnceListener(event: 'pipe', listener: (src: Readable) => void): this
  prependOnceListener(event: 'unpipe', listener: (src: Readable) => void): this
  prependOnceListener(event: string | symbol, listener: (...args: any[]) => void): this

  removeListener(event: 'close', listener: () => void): this
  removeListener(event: 'drain', listener: () => void): this
  removeListener(event: 'error', listener: (err: Error) => void): this
  removeListener(event: 'finish', listener: () => void): this
  removeListener(event: 'pipe', listener: (src: Readable) => void): this
  removeListener(event: 'unpipe', listener: (src: Readable) => void): this
  removeListener(event: string | symbol, listener: (...args: any[]) => void): this
}

interface WritableState {
  new (options: any, stream: any, isDuplex: boolean): WritableState
}

function WriteReq (this: any, chunk: any, encoding: string, cb: Function) {
  this.chunk = chunk
  this.encoding = encoding
  this.callback = cb
  this.next = null
} // It seems a linked list but it is not
// there will be only 2 of these for each stream

const CorkedRequest = (function CorkedRequest (this: any, state: any) {
  var _this = this

  this.next = null
  this.entry = null

  this.finish = function () {
    onCorkedFinish(_this, state)
  }
} as unknown) as { new (state: any): any }
/* </replacement> */
/*<replacement>*/

var internalUtil = {
  deprecate: deprecate
}
/*</replacement>*/

interface globalThis {
  Uint8Array: typeof Uint8Array
}

var OurUint8Array = globalThis.Uint8Array || function () {}

function _uint8ArrayToBuffer (chunk: any) {
  return Buffer.from(chunk)
}

function _isUint8Array (obj: any) {
  return Buffer.isBuffer(obj) || obj instanceof OurUint8Array
}

var ERR_INVALID_ARG_TYPE = _require$codes.ERR_INVALID_ARG_TYPE
var ERR_METHOD_NOT_IMPLEMENTED = _require$codes.ERR_METHOD_NOT_IMPLEMENTED
var ERR_MULTIPLE_CALLBACK = _require$codes.ERR_MULTIPLE_CALLBACK
var ERR_STREAM_CANNOT_PIPE = _require$codes.ERR_STREAM_CANNOT_PIPE
var ERR_STREAM_DESTROYED = _require$codes.ERR_STREAM_DESTROYED
var ERR_STREAM_NULL_VALUES = _require$codes.ERR_STREAM_NULL_VALUES
var ERR_STREAM_WRITE_AFTER_END = _require$codes.ERR_STREAM_WRITE_AFTER_END
var ERR_UNKNOWN_ENCODING = _require$codes.ERR_UNKNOWN_ENCODING

var errorOrDestroy = destroyImpl.errorOrDestroy

function nop () {}

const WritableState = (function WritableState (this: any, options: any, stream: any, isDuplex: boolean) {
  options = options || {} // Duplex streams are both readable and writable, but share
  // the same options object.
  // However, some cases require setting options to different
  // values for the readable and the writable sides of the duplex stream,
  // e.g. options.readableObjectMode vs. options.writableObjectMode, etc.

  if (typeof isDuplex !== 'boolean') isDuplex = stream instanceof Duplex // object stream flag to indicate whether or not this stream
  // contains buffers or objects.

  this.objectMode = !!options.objectMode
  if (isDuplex) this.objectMode = this.objectMode || !!options.writableObjectMode // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()

  this.highWaterMark = getHighWaterMark(this, options, 'writableHighWaterMark', isDuplex) // if _final has been called

  this.finalCalled = false // drain event flag.

  this.needDrain = false // at the start of calling end()

  this.ending = false // when end() has been called, and returned

  this.ended = false // when 'finish' is emitted

  this.finished = false // has it been destroyed

  this.destroyed = false // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.

  var noDecode = options.decodeStrings === false
  this.decodeStrings = !noDecode // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.

  this.defaultEncoding = options.defaultEncoding || 'utf8' // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.

  this.length = 0 // a flag to see when we're in the middle of a write.

  this.writing = false // when true all writes will be buffered until .uncork() call

  this.corked = 0 // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.

  this.sync = true // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.

  this.bufferProcessing = false // the callback that's passed to _write(chunk,cb)

  this.onwrite = function (er: any) {
    onwrite(stream, er)
  } // the callback that the user supplies to write(chunk,encoding,cb)

  this.writecb = null // the amount that is being written when _write is called.

  this.writelen = 0
  this.bufferedRequest = null
  this.lastBufferedRequest = null // number of pending user-supplied write callbacks
  // this must be 0 before 'finish' can be emitted

  this.pendingcb = 0 // emit prefinish if the only thing we're waiting for is _write cbs
  // This is relevant for synchronous Transform streams

  this.prefinished = false // True if the error was already emitted and should not be thrown again

  this.errorEmitted = false // Should close be emitted on destroy. Defaults to true.

  this.emitClose = options.emitClose !== false // Should .destroy() be called after 'finish' (and potentially 'end')

  this.autoDestroy = !!options.autoDestroy // count buffered requests

  this.bufferedRequestCount = 0 // allocate the first CorkedRequest, there is always
  // one allocated and free to use, and we maintain at most two

  this.corkedRequestsFree = new CorkedRequest(this)
} as unknown) as WritableState

WritableState.prototype.getBuffer = function getBuffer () {
  var current = this.bufferedRequest
  var out = []

  while (current) {
    out.push(current)
    current = current.next
  }

  return out
}
;(function () {
  try {
    Object.defineProperty(WritableState.prototype, 'buffer', {
      get: (internalUtil.deprecate as any)(
        function writableStateBufferGetter (this: any) {
          return this.getBuffer()
        },
        '_writableState.buffer is deprecated. Use _writableState.getBuffer ' + 'instead.',
        'DEP0003'
      )
    })
  } catch (_) {}
})() // Test _writableState for inheritance to account for Duplex streams,
// whose prototype chain only points to Readable.

export const Writable = (function Writable (this: Writable, options?: WritableOptions): void {
  // Writable ctor is applied to Duplexes, too.
  // `realHasInstance` is necessary because using plain `instanceof`
  // would return false, as no `_writableState` property is attached.
  // Trying to use the custom `instanceof` for Writable here will also break the
  // Node.js LazyTransform implementation, which has a non-trivial getter for
  // `_writableState` that would lead to infinite recursion.
  // Checking for a Stream.Duplex instance is faster here instead of inside
  // the WritableState constructor, at least with V8 6.5

  var isDuplex = this instanceof Duplex
  if (!isDuplex && !realHasInstance.call(Writable, this)) return new (Writable as any)(options)
  this._writableState = new WritableState(options, this, isDuplex) // legacy.

  this.writable = true

  if (options) {
    if (typeof options.write === 'function') this._write = options.write
    if (typeof options.writev === 'function') this._writev = options.writev
    if (typeof options.destroy === 'function') this._destroy = options.destroy
    if (typeof options.final === 'function') this._final = options.final
  }

  Stream.call(this as unknown as EventEmitter) // Otherwise people can pipe Writable streams, which is just wrong.
} as unknown) as Writable

Writable.WritableState = WritableState

inherits(Writable, Stream)

var realHasInstance: Function

if (
  typeof Symbol === 'function' &&
  Symbol.hasInstance &&
  typeof Function.prototype[Symbol.hasInstance] === 'function'
) {
  realHasInstance = Function.prototype[Symbol.hasInstance]
  Object.defineProperty(Writable, Symbol.hasInstance, {
    value: function value (object: any) {
      if (realHasInstance.call(this, object)) return true
      if (this !== Writable) return false
      return object && object._writableState instanceof WritableState
    }
  })
} else {
  realHasInstance = function realHasInstance (this: any, object: any) {
    return object instanceof this
  }
}

Writable.prototype.pipe = function () {
  errorOrDestroy(this, new ERR_STREAM_CANNOT_PIPE())
}

function writeAfterEnd (stream: any, cb: NextTickCallback) {
  var er = new ERR_STREAM_WRITE_AFTER_END() // TODO: defer error events consistently everywhere, not just the cb

  errorOrDestroy(stream, er)
  nextTick(cb, er)
} // Checks that a user-supplied chunk is valid, especially for the particular
// mode the stream is in. Currently this means that `null` is never accepted
// and undefined/non-string values are only allowed in object mode.

function validChunk (stream: any, state: any, chunk: any, cb: NextTickCallback) {
  var er

  if (chunk === null) {
    er = new ERR_STREAM_NULL_VALUES()
  } else if (typeof chunk !== 'string' && !state.objectMode) {
    er = new ERR_INVALID_ARG_TYPE('chunk', ['string', 'Buffer'], chunk)
  }

  if (er) {
    errorOrDestroy(stream, er)
    nextTick(cb, er)
    return false
  }

  return true
}

Writable.prototype.write = function (chunk: any, encoding: string, cb: NextTickCallback) {
  var state = this._writableState
  var ret = false

  var isBuf = !state.objectMode && _isUint8Array(chunk)

  if (isBuf && !Buffer.isBuffer(chunk)) {
    chunk = _uint8ArrayToBuffer(chunk)
  }

  if (typeof encoding === 'function') {
    cb = encoding
    encoding = null as unknown as string
  }

  if (isBuf) encoding = 'buffer'
  else if (!encoding) encoding = state.defaultEncoding
  if (typeof cb !== 'function') cb = nop
  if (state.ending) writeAfterEnd(this, cb)
  else if (isBuf || validChunk(this, state, chunk, cb)) {
    state.pendingcb++
    ret = writeOrBuffer(this, state, isBuf, chunk, encoding, cb)
  }
  return ret
}

Writable.prototype.cork = function () {
  this._writableState.corked++
}

Writable.prototype.uncork = function () {
  var state = this._writableState

  if (state.corked) {
    state.corked--
    if (!state.writing && !state.corked && !state.bufferProcessing && state.bufferedRequest)
      clearBuffer(this, state)
  }
}

Writable.prototype.setDefaultEncoding = function setDefaultEncoding (encoding: string) {
  // node::ParseEncoding() requires lower case.
  if (typeof encoding === 'string') encoding = encoding.toLowerCase()
  if (
    !(
      ['hex', 'utf8', 'utf-8', 'ascii', 'binary', 'base64', 'ucs2', 'ucs-2', 'utf16le', 'utf-16le', 'raw'].indexOf(
        (encoding + '').toLowerCase()
      ) > -1
    )
  )
    throw new ERR_UNKNOWN_ENCODING(encoding)
  this._writableState.defaultEncoding = encoding
  return this
}

Object.defineProperty(Writable.prototype, 'writableBuffer', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get () {
    return this._writableState && this._writableState.getBuffer()
  }
})

function decodeChunk (state: any, chunk: any, encoding: string) {
  if (!state.objectMode && state.decodeStrings !== false && typeof chunk === 'string') {
    chunk = Buffer.from(chunk, encoding as any)
  }

  return chunk
}

Object.defineProperty(Writable.prototype, 'writableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get () {
    return this._writableState.highWaterMark
  }
}) // if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.

function writeOrBuffer (stream: any, state: any, isBuf: boolean, chunk: any, encoding: string, cb: Function) {
  if (!isBuf) {
    var newChunk = decodeChunk(state, chunk, encoding)

    if (chunk !== newChunk) {
      isBuf = true
      encoding = 'buffer'
      chunk = newChunk
    }
  }

  var len = state.objectMode ? 1 : chunk.length
  state.length += len
  var ret = state.length < state.highWaterMark // we must ensure that previous needDrain will not be reset to false.

  if (!ret) state.needDrain = true

  if (state.writing || state.corked) {
    var last = state.lastBufferedRequest
    state.lastBufferedRequest = {
      chunk: chunk,
      encoding: encoding,
      isBuf: isBuf,
      callback: cb,
      next: null
    }

    if (last) {
      last.next = state.lastBufferedRequest
    } else {
      state.bufferedRequest = state.lastBufferedRequest
    }

    state.bufferedRequestCount += 1
  } else {
    doWrite(stream, state, false, len, chunk, encoding, cb)
  }

  return ret
}

function doWrite (stream: any, state: any, writev: boolean, len: number, chunk: any, encoding: string, cb: Function) {
  state.writelen = len
  state.writecb = cb
  state.writing = true
  state.sync = true
  if (state.destroyed) state.onwrite(new ERR_STREAM_DESTROYED('write'))
  else if (writev) stream._writev(chunk, state.onwrite)
  else stream._write(chunk, encoding, state.onwrite)
  state.sync = false
}

function onwriteError (stream: any, state: any, sync: boolean, er: any, cb: NextTickCallback) {
  --state.pendingcb

  if (sync) {
    // defer the callback if we are being called synchronously
    // to avoid piling up things on the stack
    nextTick(cb, er) // this can emit finish, and it will always happen
    // after error

    nextTick(finishMaybe, stream, state)
    stream._writableState.errorEmitted = true
    errorOrDestroy(stream, er)
  } else {
    // the caller expect this to happen before if
    // it is async
    cb(er)
    stream._writableState.errorEmitted = true
    errorOrDestroy(stream, er) // this can emit finish, but finish must
    // always follow error

    finishMaybe(stream, state)
  }
}

function onwriteStateUpdate (state: any) {
  state.writing = false
  state.writecb = null
  state.length -= state.writelen
  state.writelen = 0
}

function onwrite (stream: any, er: any) {
  var state = stream._writableState
  var sync = state.sync
  var cb = state.writecb
  if (typeof cb !== 'function') throw new ERR_MULTIPLE_CALLBACK()
  onwriteStateUpdate(state)
  if (er) onwriteError(stream, state, sync, er, cb)
  else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(state) || stream.destroyed

    if (!finished && !state.corked && !state.bufferProcessing && state.bufferedRequest) {
      clearBuffer(stream, state)
    }

    if (sync) {
      nextTick(afterWrite, stream, state, finished, cb)
    } else {
      afterWrite(stream, state, finished, cb)
    }
  }
}

function afterWrite (stream: any, state: any, finished: boolean, cb: Function) {
  if (!finished) onwriteDrain(stream, state)
  state.pendingcb--
  cb()
  finishMaybe(stream, state)
} // Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.

function onwriteDrain (stream: any, state: any) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false
    stream.emit('drain')
  }
} // if there's something in the buffer waiting, then process it

function clearBuffer (stream: any, state: any) {
  state.bufferProcessing = true
  var entry = state.bufferedRequest

  if (stream._writev && entry && entry.next) {
    // Fast case, write everything using _writev()
    var l = state.bufferedRequestCount
    var buffer = new Array(l)
    var holder = state.corkedRequestsFree
    holder.entry = entry
    var count = 0
    var allBuffers = true

    while (entry) {
      buffer[count] = entry
      if (!entry.isBuf) allBuffers = false
      entry = entry.next
      count += 1
    }

    ;(buffer as any).allBuffers = allBuffers
    doWrite(stream, state, true, state.length, buffer, '', holder.finish) // doWrite is almost always async, defer these to save a bit of time
    // as the hot path ends with doWrite

    state.pendingcb++
    state.lastBufferedRequest = null

    if (holder.next) {
      state.corkedRequestsFree = holder.next
      holder.next = null
    } else {
      state.corkedRequestsFree = new CorkedRequest(state)
    }

    state.bufferedRequestCount = 0
  } else {
    // Slow case, write chunks one-by-one
    while (entry) {
      var chunk = entry.chunk
      var encoding = entry.encoding
      var cb = entry.callback
      var len = state.objectMode ? 1 : chunk.length
      doWrite(stream, state, false, len, chunk, encoding, cb)
      entry = entry.next
      state.bufferedRequestCount-- // if we didn't call the onwrite immediately, then
      // it means that we need to wait until it does.
      // also, that means that the chunk and cb are currently
      // being processed, so move the buffer counter past them.

      if (state.writing) {
        break
      }
    }

    if (entry === null) state.lastBufferedRequest = null
  }

  state.bufferedRequest = entry
  state.bufferProcessing = false
}

Writable.prototype._write = function (chunk: any, encoding: string, cb: Function) {
  cb(new ERR_METHOD_NOT_IMPLEMENTED('_write()'))
}

Writable.prototype._writev = null

Writable.prototype.end = function (chunk: any, encoding: string, cb: NextTickCallback) {
  var state = this._writableState

  if (typeof chunk === 'function') {
    cb = chunk
    chunk = null
    encoding = null as unknown as string
  } else if (typeof encoding === 'function') {
    cb = encoding
    encoding = null as unknown as string
  }

  if (chunk !== null && chunk !== undefined) this.write(chunk, encoding) // .end() fully uncorks

  if (state.corked) {
    state.corked = 1
    this.uncork()
  } // ignore unnecessary end() calls.

  if (!state.ending) endWritable(this, state, cb)
  return this
}

Object.defineProperty(Writable.prototype, 'writableLength', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get () {
    return this._writableState.length
  }
})

function needFinish (state: any) {
  return state.ending && state.length === 0 && state.bufferedRequest === null && !state.finished && !state.writing
}

function callFinal (stream: any, state: any) {
  stream._final(function (err: any) {
    state.pendingcb--

    if (err) {
      errorOrDestroy(stream, err)
    }

    state.prefinished = true
    stream.emit('prefinish')
    finishMaybe(stream, state)
  })
}

function prefinish (stream: any, state: any) {
  if (!state.prefinished && !state.finalCalled) {
    if (typeof stream._final === 'function' && !state.destroyed) {
      state.pendingcb++
      state.finalCalled = true
      nextTick(callFinal, stream, state)
    } else {
      state.prefinished = true
      stream.emit('prefinish')
    }
  }
}

function finishMaybe (stream: any, state: any) {
  var need = needFinish(state)

  if (need) {
    prefinish(stream, state)

    if (state.pendingcb === 0) {
      state.finished = true
      stream.emit('finish')

      if (state.autoDestroy) {
        // In case of duplex streams we need a way to detect
        // if the readable side is ready for autoDestroy as well
        var rState = stream._readableState

        if (!rState || (rState.autoDestroy && rState.endEmitted)) {
          stream.destroy()
        }
      }
    }
  }

  return need
}

function endWritable (stream: any, state: any, cb: NextTickCallback) {
  state.ending = true
  finishMaybe(stream, state)

  if (cb) {
    if (state.finished) nextTick(cb)
    else stream.once('finish', cb)
  }

  state.ended = true
  stream.writable = false
}

function onCorkedFinish (corkReq: any, state: any, err?: any) {
  var entry = corkReq.entry
  corkReq.entry = null

  while (entry) {
    var cb = entry.callback
    state.pendingcb--
    cb(err)
    entry = entry.next
  } // reuse the free corkReq.

  state.corkedRequestsFree.next = corkReq
}

Object.defineProperty(Writable.prototype, 'destroyed', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get () {
    if (this._writableState === undefined) {
      return false
    }

    return this._writableState.destroyed
  },
  set: function set (value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (!this._writableState) {
      return
    } // backward compatibility, the user is explicitly
    // managing destroyed

    this._writableState.destroyed = value
  }
})
Writable.prototype.destroy = destroyImpl.destroy
Writable.prototype._undestroy = destroyImpl.undestroy

Writable.prototype._destroy = function (err: any, cb: Function) {
  cb(err)
}
