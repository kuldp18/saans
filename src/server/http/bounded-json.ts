export class BodyTooLarge extends Error {}

export async function readBoundedBytes(body: ReadableStream<Uint8Array> | null, limit: number, signal?: AbortSignal): Promise<Uint8Array> {
  if (!body) throw new Error("Missing body");
  const reader = body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    signal?.throwIfAborted();
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new BodyTooLarge();
      chunks.push(value);
    }
    const data = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return data;
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

export async function readBoundedJson(body: ReadableStream<Uint8Array> | null, limit: number, signal?: AbortSignal): Promise<unknown> {
  const bytes = await readBoundedBytes(body, limit, signal);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export async function withDeadline<T>(ms: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error("Deadline exceeded");
        controller.abort(error);
        reject(error);
      }, ms);
    });
    return await Promise.race([deadline, work(controller.signal)]);
  } finally {
    clearTimeout(timer);
  }
}
