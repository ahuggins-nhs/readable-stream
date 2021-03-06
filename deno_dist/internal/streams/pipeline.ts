// Ported from https://github.com/mafintosh/pump with
// permission from the author, Mathias Buus (@mafintosh).
'use strict'

import { codes as _require$codes } from '../.././errors.ts'
import eos from './end-of-stream.ts'

function once (callback: Function) {
  var called = false
  return function () {
    if (called) return
    called = true
    callback.apply(void 0, arguments)
  }
}

var ERR_MISSING_ARGS = _require$codes.ERR_MISSING_ARGS
var ERR_STREAM_DESTROYED = _require$codes.ERR_STREAM_DESTROYED

function noop (err: any) {
  // Rethrow the error if it exists to avoid swallowing it
  if (err) throw err
}

function isRequest (stream: any) {
  return stream.setHeader && typeof stream.abort === 'function'
}

function destroyer (stream: any, reading: boolean, writing: boolean, callback: Function) {
  callback = once(callback)
  var closed = false
  stream.on('close', function () {
    closed = true
  })

  eos(
    stream,
    {
      readable: reading,
      writable: writing
    },
    function (err: any) {
      if (err) return callback(err)
      closed = true
      callback()
    }
  )
  var destroyed = false
  return function (err: any) {
    if (closed) return
    if (destroyed) return
    destroyed = true // request.destroy just do .end - .abort is what we want

    if (isRequest(stream)) return stream.abort()
    if (typeof stream.destroy === 'function') return stream.destroy()
    callback(err || new ERR_STREAM_DESTROYED('pipe'))
  }
}

function call (fn: Function) {
  fn()
}

function pipe (from: any, to: any) {
  return from.pipe(to)
}

function popCallback (streams: any[]) {
  if (!streams.length) return noop
  if (typeof streams[streams.length - 1] !== 'function') return noop
  return streams.pop()
}

export default function pipeline () {
  for (var _len = arguments.length, streams = new Array(_len), _key = 0; _key < _len; _key++) {
    streams[_key] = arguments[_key]
  }

  var callback = popCallback(streams)
  if (Array.isArray(streams[0])) streams = streams[0]

  if (streams.length < 2) {
    throw new ERR_MISSING_ARGS('streams')
  }

  var error: any
  var destroys = streams.map(function (stream, i) {
    var reading = i < streams.length - 1
    var writing = i > 0
    return destroyer(stream, reading, writing, function (err: any) {
      if (!error) error = err
      if (err) destroys.forEach(call)
      if (reading) return
      destroys.forEach(call)
      callback(error)
    })
  })
  return streams.reduce(pipe)
}
