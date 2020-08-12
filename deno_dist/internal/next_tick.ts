import process from 'https://deno.land/std@0.64.0/node/process.ts'

export type NextTickCallback = (...args: any[]) => void

export function nextTick (cb: NextTickCallback, ...args: any[]) {
  if (typeof process === 'object' && process && typeof (process as any).nextTick === 'function') {
    (process as any).nextTick(cb, ...args)

    return
  }

  queueMicrotask(cb.bind(cb, ...args))
}
