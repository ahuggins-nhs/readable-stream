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
'use strict'

import inherits from './internal/inherits.ts'
import { codes as _require$codes } from './errors.ts'
import { Duplex } from './_stream_duplex.ts'
import { TransformCallback, TransformOptions } from './Interfaces.ts'

export interface Transform extends Duplex {
  new (options?: TransformOptions): Transform
  _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback): void
  _flush(callback: TransformCallback): void
}

var ERR_METHOD_NOT_IMPLEMENTED = _require$codes.ERR_METHOD_NOT_IMPLEMENTED
var ERR_MULTIPLE_CALLBACK = _require$codes.ERR_MULTIPLE_CALLBACK
var ERR_TRANSFORM_ALREADY_TRANSFORMING = _require$codes.ERR_TRANSFORM_ALREADY_TRANSFORMING
var ERR_TRANSFORM_WITH_LENGTH_0 = _require$codes.ERR_TRANSFORM_WITH_LENGTH_0

function afterTransform (er: any, data: any) {
  var ts = this._transformState
  ts.transforming = false
  var cb = ts.writecb

  if (cb === null) {
    return this.emit('error', new ERR_MULTIPLE_CALLBACK())
  }

  ts.writechunk = null
  ts.writecb = null
  if (data != null)
    // single equals check for both `null` and `undefined`
    this.push(data)
  cb(er)
  var rs = this._readableState
  rs.reading = false

  if (rs.needReadable || rs.length < rs.highWaterMark) {
    this._read(rs.highWaterMark)
  }
}

export const Transform = (function Transform (options?: TransformOptions): void {
  if (!(this instanceof Transform)) return new (Transform as any)(options)
  Duplex.call(this, options)
  this._transformState = {
    afterTransform: afterTransform.bind(this),
    needTransform: false,
    transforming: false,
    writecb: null,
    writechunk: null,
    writeencoding: null
  } // start out asking for a readable event once data is transformed.

  this._readableState.needReadable = true // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.

  this._readableState.sync = false

  if (options) {
    if (typeof options.transform === 'function') this._transform = options.transform
    if (typeof options.flush === 'function') this._flush = options.flush
  } // When the writable side finishes, then flush out anything remaining.

  this.on('prefinish', prefinish)
} as unknown) as Transform

inherits(Transform, Duplex)

function prefinish () {
  var _this = this

  if (typeof this._flush === 'function' && !this._readableState.destroyed) {
    this._flush(function (er: any, data: any) {
      done(_this, er, data)
    })
  } else {
    done(this, null, null)
  }
}

Transform.prototype.push = function (chunk: any, encoding: string) {
  this._transformState.needTransform = false
  return Duplex.prototype.push.call(this, chunk, encoding)
} // This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.

Transform.prototype._transform = function (chunk: any, encoding: string, cb: Function) {
  cb(new ERR_METHOD_NOT_IMPLEMENTED('_transform()'))
}

Transform.prototype._write = function (chunk: any, encoding: string, cb: Function) {
  var ts = this._transformState
  ts.writecb = cb
  ts.writechunk = chunk
  ts.writeencoding = encoding

  if (!ts.transforming) {
    var rs = this._readableState
    if (ts.needTransform || rs.needReadable || rs.length < rs.highWaterMark) this._read(rs.highWaterMark)
  }
} // Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.

Transform.prototype._read = function (n: number) {
  var ts = this._transformState

  if (ts.writechunk !== null && !ts.transforming) {
    ts.transforming = true

    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform)
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true
  }
}

Transform.prototype._destroy = function (err: any, cb: Function) {
  Duplex.prototype._destroy.call(this, err, function (err2: any) {
    cb(err2)
  })
}

function done (stream: any, er: any, data: any) {
  if (er) return stream.emit('error', er)
  if (data != null)
    // single equals check for both `null` and `undefined`
    stream.push(data) // TODO(BridgeAR): Write a test for these two error cases
  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided

  if (stream._writableState.length) throw new ERR_TRANSFORM_WITH_LENGTH_0()
  if (stream._transformState.transforming) throw new ERR_TRANSFORM_ALREADY_TRANSFORMING()
  return stream.push(null)
}