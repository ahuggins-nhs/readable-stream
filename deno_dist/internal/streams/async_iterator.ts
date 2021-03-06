'use strict'

import { nextTick } from '../next_tick.ts'
import finished from './end-of-stream.ts'

var _Object$setPrototypeO

function _defineProperty (obj: any, key: string | number | symbol, value: any) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true
    })
  } else {
    obj[key] = value
  }
  return obj
}

var kLastResolve = Symbol('lastResolve')
var kLastReject = Symbol('lastReject')
var kError = Symbol('error')
var kEnded = Symbol('ended')
var kLastPromise = Symbol('lastPromise')
var kHandlePromise = Symbol('handlePromise')
var kStream = Symbol('stream')

function createIterResult (value: any, done: boolean) {
  return {
    value: value,
    done: done
  }
}

function readAndResolve (iter: any) {
  var resolve = iter[kLastResolve]

  if (resolve !== null) {
    var data = iter[kStream].read() // we defer if data is null
    // we can be expecting either 'end' or
    // 'error'

    if (data !== null) {
      iter[kLastPromise] = null
      iter[kLastResolve] = null
      iter[kLastReject] = null
      resolve(createIterResult(data, false))
    }
  }
}

function onReadable (iter: any) {
  // we wait for the next tick, because it might
  // emit an error with process.nextTick
  nextTick(readAndResolve, iter)
}

function wrapForNext (lastPromise: Promise<any>, iter: any) {
  return function (resolve: (value?: any) => void, reject: (reason: any) => void) {
    lastPromise.then(function () {
      if (iter[kEnded]) {
        resolve(createIterResult(undefined, true))
        return
      }

      iter[kHandlePromise](resolve, reject)
    }, reject)
  }
}

var AsyncIteratorPrototype = Object.getPrototypeOf(function () {})
var ReadableStreamAsyncIteratorPrototype = Object.setPrototypeOf(
  ((_Object$setPrototypeO = {
    get stream () {
      return this[kStream]
    },

    next: function next (this: any) {
      var _this = this

      // if we have detected an error in the meanwhile
      // reject straight away
      var error = this[kError]

      if (error !== null) {
        return Promise.reject(error)
      }

      if (this[kEnded]) {
        return Promise.resolve(createIterResult(undefined, true))
      }

      if (this[kStream].destroyed) {
        // We need to defer via nextTick because if .destroy(err) is
        // called, the error will be emitted via nextTick, and
        // we cannot guarantee that there is no error lingering around
        // waiting to be emitted.
        return new Promise(function (resolve, reject) {
          nextTick(function () {
            if (_this[kError]) {
              reject(_this[kError])
            } else {
              resolve(createIterResult(undefined, true))
            }
          })
        })
      } // if we have multiple next() calls
      // we will wait for the previous Promise to finish
      // this logic is optimized to support for await loops,
      // where next() is only called once at a time

      var lastPromise = this[kLastPromise]
      var promise

      if (lastPromise) {
        promise = new Promise(wrapForNext(lastPromise, this))
      } else {
        // fast path needed to support multiple this.push()
        // without triggering the next() queue
        var data = this[kStream].read()

        if (data !== null) {
          return Promise.resolve(createIterResult(data, false))
        }

        promise = new Promise(this[kHandlePromise])
      }

      this[kLastPromise] = promise
      return promise
    }
  }),
  _defineProperty(_Object$setPrototypeO, Symbol.asyncIterator, function (this: any) {
    return this
  }),
  _defineProperty(_Object$setPrototypeO, 'return', function _return (this: any) {
    var _this2 = this

    // destroy(err, cb) is a private API
    // we can guarantee we have that here, because we control the
    // Readable class this is attached to
    return new Promise(function (resolve, reject) {
      _this2[kStream].destroy(null, function (err: any) {
        if (err) {
          reject(err)
          return
        }

        resolve(createIterResult(undefined, true))
      })
    })
  }),
  _Object$setPrototypeO),
  AsyncIteratorPrototype
)

export default function createReadableStreamAsyncIterator (stream: any) {
  var _Object$create

  var iterator = Object.create(
    ReadableStreamAsyncIteratorPrototype,
    ((_Object$create = {}),
    _defineProperty(_Object$create, kStream, {
      value: stream,
      writable: true
    }),
    _defineProperty(_Object$create, kLastResolve, {
      value: null,
      writable: true
    }),
    _defineProperty(_Object$create, kLastReject, {
      value: null,
      writable: true
    }),
    _defineProperty(_Object$create, kError, {
      value: null,
      writable: true
    }),
    _defineProperty(_Object$create, kEnded, {
      value: stream._readableState.endEmitted,
      writable: true
    }),
    _defineProperty(_Object$create, kHandlePromise, {
      value: function value (resolve: (value?: any) => void, reject: (reason: any) => void) {
        var data = iterator[kStream].read()

        if (data) {
          iterator[kLastPromise] = null
          iterator[kLastResolve] = null
          iterator[kLastReject] = null
          resolve(createIterResult(data, false))
        } else {
          iterator[kLastResolve] = resolve
          iterator[kLastReject] = reject
        }
      },
      writable: true
    }),
    _Object$create)
  )
  iterator[kLastPromise] = null
  finished(stream, function (err: any) {
    if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      var reject = iterator[kLastReject] // reject if we are waiting for data in the Promise
      // returned by next() and store the error

      if (reject !== null) {
        iterator[kLastPromise] = null
        iterator[kLastResolve] = null
        iterator[kLastReject] = null
        reject(err)
      }

      iterator[kError] = err
      return
    }

    var resolve = iterator[kLastResolve]

    if (resolve !== null) {
      iterator[kLastPromise] = null
      iterator[kLastResolve] = null
      iterator[kLastReject] = null
      resolve(createIterResult(undefined, true))
    }

    iterator[kEnded] = true
  })
  stream.on('readable', onReadable.bind(null, iterator))
  return iterator
}
