// Ported from https://github.com/mafintosh/end-of-stream with
// permission from the author, Mathias Buus (@mafintosh).
'use strict'

import { codes } from '../.././errors.ts'

var ERR_STREAM_PREMATURE_CLOSE = codes.ERR_STREAM_PREMATURE_CLOSE

function once (callback: Function) {
  var called = false
  return function (this: any) {
    if (called) return
    called = true

    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key]
    }

    callback.apply(this, args)
  }
}

function noop () {}

function isRequest (stream: any) {
  return stream.setHeader && typeof stream.abort === 'function'
}

export default function eos (stream: any, opts: any, callback: Function = noop): Function {
  if (typeof opts === 'function') return eos(stream, null, opts)
  if (!opts) opts = {}
  callback = once(callback || noop)
  var readable = opts.readable || (opts.readable !== false && stream.readable)
  var writable = opts.writable || (opts.writable !== false && stream.writable)

  var onlegacyfinish = function onlegacyfinish () {
    if (!stream.writable) onfinish()
  }

  var writableEnded = stream._writableState && stream._writableState.finished

  var onfinish = function onfinish () {
    writable = false
    writableEnded = true
    if (!readable) callback.call(stream)
  }

  var readableEnded = stream._readableState && stream._readableState.endEmitted

  var onend = function onend () {
    readable = false
    readableEnded = true
    if (!writable) callback.call(stream)
  }

  var onerror = function onerror (err: any) {
    callback.call(stream, err)
  }

  var onclose = function onclose () {
    var err

    if (readable && !readableEnded) {
      if (!stream._readableState || !stream._readableState.ended) err = new ERR_STREAM_PREMATURE_CLOSE()
      return callback.call(stream, err)
    }

    if (writable && !writableEnded) {
      if (!stream._writableState || !stream._writableState.ended) err = new ERR_STREAM_PREMATURE_CLOSE()
      return callback.call(stream, err)
    }
  }

  var onrequest = function onrequest () {
    stream.req.on('finish', onfinish)
  }

  if (isRequest(stream)) {
    stream.on('complete', onfinish)
    stream.on('abort', onclose)
    if (stream.req) onrequest()
    else stream.on('request', onrequest)
  } else if (writable && !stream._writableState) {
    // legacy streams
    stream.on('end', onlegacyfinish)
    stream.on('close', onlegacyfinish)
  }

  stream.on('end', onend)
  stream.on('finish', onfinish)
  if (opts.error !== false) stream.on('error', onerror)
  stream.on('close', onclose)
  return function () {
    stream.removeListener('complete', onfinish)
    stream.removeListener('abort', onclose)
    stream.removeListener('request', onrequest)
    if (stream.req) stream.req.removeListener('finish', onfinish)
    stream.removeListener('end', onlegacyfinish)
    stream.removeListener('close', onlegacyfinish)
    stream.removeListener('finish', onfinish)
    stream.removeListener('end', onend)
    stream.removeListener('error', onerror)
    stream.removeListener('close', onclose)
  }
}
