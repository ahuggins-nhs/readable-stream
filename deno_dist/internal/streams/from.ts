export default function from (...args: any[]): never {
  throw new Error('Readable.from is not available in the browser or Deno')
}
