const CLUSTER_ID = new Uint8Array([0x1f, 0x43, 0xb6, 0x75]);

/**
 * Extracts the WebM/EBML header (everything before the first Cluster element)
 * from a MediaRecorder blob. Chrome's MediaRecorder only includes the EBML
 * header in the first `dataavailable` chunk; subsequent chunks are bare
 * Clusters. Prepending this header makes every chunk an independently
 * decodable WebM for ffmpeg.
 */
export async function extractWebmHeader(blob: Blob): Promise<Blob | null> {
  const buffer = await readAsArrayBuffer(blob);
  const bytes = new Uint8Array(buffer);
  const index = findClusterId(bytes);
  if (index <= 0) {
    return null;
  }
  const headerBytes = new Uint8Array(index);
  headerBytes.set(bytes.subarray(0, index));
  return new Blob([headerBytes], { type: blob.type });
}

function readAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export function findClusterId(bytes: Uint8Array): number {
  const first = CLUSTER_ID[0];
  const last = bytes.length - CLUSTER_ID.length;
  for (let i = 0; i <= last; i++) {
    if (bytes[i] !== first) {
      continue;
    }
    let match = true;
    for (let j = 1; j < CLUSTER_ID.length; j++) {
      if (bytes[i + j] !== CLUSTER_ID[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return i;
    }
  }
  return -1;
}