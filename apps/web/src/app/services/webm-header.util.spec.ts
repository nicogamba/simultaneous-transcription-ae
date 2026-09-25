import { extractWebmHeader, findClusterId } from './webm-header.util';

function withCluster(at: number, size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  bytes[at] = 0x1f;
  bytes[at + 1] = 0x43;
  bytes[at + 2] = 0xb6;
  bytes[at + 3] = 0x75;
  return bytes;
}

describe('webm-header', () => {
  it('finds the first Cluster id', () => {
    const bytes = withCluster(40, 100);
    expect(findClusterId(bytes)).toBe(40);
  });

  it('finds the first Cluster id even with bytes before it', () => {
    const bytes = withCluster(16, 64);
    expect(findClusterId(bytes)).toBe(16);
  });

  it('returns -1 when no Cluster id is present', () => {
    expect(findClusterId(new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44]))).toBe(
      -1,
    );
  });

  it('does not match a partial cluster id', () => {
    const bytes = new Uint8Array([0x1f, 0x43, 0xb6, 0x00, 0x00]);
    expect(findClusterId(bytes)).toBe(-1);
  });

  it('extracts the header as the bytes before the first Cluster', async () => {
    const bytes = withCluster(32, 96);
    bytes[0] = 0x1a;
    bytes[1] = 0x45;
    bytes[2] = 0xdf;
    bytes[3] = 0xa3;

    const header = await extractWebmHeader(new Blob([bytes]));
    expect(header).not.toBeNull();
    expect(header!.size).toBe(32);
  });

  it('returns null when the blob has no Cluster', async () => {
    const header = await extractWebmHeader(new Blob([new Uint8Array(64)]));
    expect(header).toBeNull();
  });

  it('returns null for an empty blob', async () => {
    expect(await extractWebmHeader(new Blob([]))).toBeNull();
  });
});