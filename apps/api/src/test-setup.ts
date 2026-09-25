import {
  ReadableStream as NodeReadableStream,
  TransformStream as NodeTransformStream,
} from 'node:stream/web';

if (!globalThis.ReadableStream) {
  globalThis.ReadableStream = NodeReadableStream as typeof ReadableStream;
}

if (!globalThis.TransformStream) {
  globalThis.TransformStream = NodeTransformStream as typeof TransformStream;
}