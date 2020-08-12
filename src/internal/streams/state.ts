'use strict'

import { codes } from '../.././errors'

var ERR_INVALID_OPT_VALUE = codes.ERR_INVALID_OPT_VALUE

function highWaterMarkFrom (options: any, isDuplex: boolean, duplexKey: string | number | symbol) {
  return options.highWaterMark != null ? options.highWaterMark : isDuplex ? options[duplexKey] : null
}

export function getHighWaterMark (state: any, options: any, duplexKey: string | number | symbol, isDuplex?: boolean) {
  var hwm = highWaterMarkFrom(options, isDuplex, duplexKey)

  if (hwm != null) {
    if (!(isFinite(hwm) && Math.floor(hwm) === hwm) || hwm < 0) {
      var name = isDuplex ? duplexKey : 'highWaterMark'
      throw new ERR_INVALID_OPT_VALUE(name, hwm)
    }

    return Math.floor(hwm)
  } // Default value

  return state.objectMode ? 16 : 16 * 1024
}
