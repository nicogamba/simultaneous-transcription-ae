export function createSseReader(url: string): {
  next(): Promise<string>;
  close(): void;
} {
  const controller = new AbortController();
  const queue: string[] = [];
  const waiters: Array<{
    resolve: (value: string) => void;
    reject: (error: Error) => void;
  }> = [];
  let done = false;
  let error: Error | null = null;

  const pump = (reader: ReadableStreamDefaultReader<Uint8Array>) => {
    const decoder = new TextDecoder();
    let buffer = '';
    const process = async () => {
      try {
        while (true) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data:')) {
              const data = trimmed.slice(5).trim();
              if (data) {
                if (waiters.length > 0) {
                  waiters.shift()?.resolve(data);
                } else {
                  queue.push(data);
                }
              }
            }
          }
        }
        finish();
      } catch (err) {
        error = err as Error;
        finish();
      }
    };
    void process();
  };

  const finish = () => {
    if (done) {
      return;
    }
    done = true;
    for (const waiter of waiters) {
      waiter.reject(error ?? new Error('SSE stream closed'));
    }
    waiters.length = 0;
  };

  void fetch(url, { signal: controller.signal })
    .then((response) => {
      if (!response.ok || !response.body) {
        throw new Error(`SSE request failed: ${response.status}`);
      }
      pump(response.body.getReader());
    })
    .catch((err) => {
      error = err as Error;
      finish();
    });

  return {
    next(): Promise<string> {
      if (done) {
        return Promise.reject(error ?? new Error('SSE stream closed'));
      }
      if (queue.length > 0) {
        return Promise.resolve(queue.shift() as string);
      }
      return new Promise((resolve, reject) => {
        waiters.push({ resolve, reject });
      });
    },
    close() {
      controller.abort();
      finish();
    },
  };
}