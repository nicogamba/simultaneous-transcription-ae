import { downmixToMono, float32ToInt16 } from './pcm.utils';

describe('pcm.utils', () => {
  describe('downmixToMono', () => {
    it('averages channels per frame', () => {
      const left = new Float32Array([0.5, 1, 0]);
      const right = new Float32Array([0.5, -1, 0.4]);
      const mono = downmixToMono([left, right]);
      expect(mono[0]).toBeCloseTo(0.5);
      expect(mono[1]).toBeCloseTo(0);
      expect(mono[2]).toBeCloseTo(0.2);
    });

    it('returns a copy of the single channel', () => {
      const mono = downmixToMono([new Float32Array([1, -1, 0.5])]);
      expect(Array.from(mono)).toEqual([1, -1, 0.5]);
    });

    it('handles an empty channel list', () => {
      expect(downmixToMono([]).length).toBe(0);
    });
  });

  describe('float32ToInt16', () => {
    it('encodes 1 as max int16 and -1 as min int16', () => {
      const out = float32ToInt16(new Float32Array([1, -1]));
      const view = new DataView(out.buffer);
      expect(view.getInt16(0, true)).toBe(32767);
      expect(view.getInt16(2, true)).toBe(-32768);
    });

    it('produces two bytes per sample', () => {
      const out = float32ToInt16(new Float32Array(3));
      expect(out.byteLength).toBe(6);
    });

    it('clamps out-of-range samples', () => {
      const out = float32ToInt16(new Float32Array([2, -2]));
      const view = new DataView(out.buffer);
      expect(view.getInt16(0, true)).toBe(32767);
      expect(view.getInt16(2, true)).toBe(-32768);
    });

    it('encodes silence as zero', () => {
      const out = float32ToInt16(new Float32Array([0]));
      expect(new DataView(out.buffer).getInt16(0, true)).toBe(0);
    });
  });
});