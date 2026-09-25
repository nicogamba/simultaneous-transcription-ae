const WORKLET_CODE = `
class MicPcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }
    const channels = input;
    const frames = channels[0].length;
    const mono = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (let c = 0; c < channels.length; c++) {
        const sample = channels[c] && channels[c][i];
        sum += sample || 0;
      }
      mono[i] = sum / channels.length;
    }
    this.port.postMessage(mono, [mono.buffer]);
    return true;
  }
}
registerProcessor('mic-pcm', MicPcmProcessor);
`;

export async function createMicWorklet(
  context: AudioContext,
  source: MediaStreamAudioSourceNode,
  onPcm: (mono: Float32Array) => void,
): Promise<AudioWorkletNode> {
  const moduleUrl = URL.createObjectURL(
    new Blob([WORKLET_CODE], { type: 'application/javascript' }),
  );
  try {
    await context.audioWorklet.addModule(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
  const node = new AudioWorkletNode(context, 'mic-pcm');
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    onPcm(event.data);
  };
  source.connect(node);
  node.connect(context.destination);
  return node;
}