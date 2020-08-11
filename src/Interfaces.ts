import type { Readable } from './_stream_readable'
import type { Writable } from './_stream_writable'
import type { Duplex } from './_stream_duplex'
import type { Transform } from './_stream_transform'

type BufferEncoding = "ascii" | "utf8" | "utf-8" | "utf16le" | "ucs2" | "ucs-2" | "base64" | "latin1" | "binary" | "hex"

export type TransformCallback = (error?: Error | null, data?: any) => void

export interface Class<T> {
  new(...args: any[]): T
}

export interface ReadableOptions {
  highWaterMark?: number;
  encoding?: BufferEncoding;
  objectMode?: boolean;
  read?(this: Readable, size: number): void;
  destroy?(this: Readable, error: Error | null, callback: (error: Error | null) => void): void;
  autoDestroy?: boolean;
}

export interface WritableOptions {
  highWaterMark?: number;
  decodeStrings?: boolean;
  defaultEncoding?: BufferEncoding;
  objectMode?: boolean;
  emitClose?: boolean;
  write?(this: Writable, chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void;
  writev?(this: Writable, chunks: Array<{ chunk: any, encoding: BufferEncoding }>, callback: (error?: Error | null) => void): void;
  destroy?(this: Writable, error: Error | null, callback: (error: Error | null) => void): void;
  final?(this: Writable, callback: (error?: Error | null) => void): void;
  autoDestroy?: boolean;
}

export interface DuplexOptions extends ReadableOptions, WritableOptions {
  allowHalfOpen?: boolean;
  readableObjectMode?: boolean;
  writableObjectMode?: boolean;
  readableHighWaterMark?: number;
  writableHighWaterMark?: number;
  writableCorked?: number;
  readable?: boolean
  writable?: boolean
  read?(this: Duplex, size: number): void;
  write?(this: Duplex, chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void;
  writev?(this: Duplex, chunks: Array<{ chunk: any, encoding: BufferEncoding }>, callback: (error?: Error | null) => void): void;
  final?(this: Duplex, callback: (error?: Error | null) => void): void;
  destroy?(this: Duplex, error: Error | null, callback: (error: Error | null) => void): void;
}

export interface TransformOptions extends DuplexOptions {
    read?(this: Transform, size: number): void;
    write?(this: Transform, chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void;
    writev?(this: Transform, chunks: Array<{ chunk: any, encoding: BufferEncoding }>, callback: (error?: Error | null) => void): void;
    final?(this: Transform, callback: (error?: Error | null) => void): void;
    destroy?(this: Transform, error: Error | null, callback: (error: Error | null) => void): void;
    transform?(this: Transform, chunk: any, encoding: BufferEncoding, callback: TransformCallback): void;
    flush?(this: Transform, callback: TransformCallback): void;
}
