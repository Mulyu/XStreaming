import {runPool} from '../pool';

describe('runPool', () => {
  it('never runs more than the limit at once and visits every item', async () => {
    let active = 0;
    let peak = 0;
    const seen: number[] = [];
    await runPool([1, 2, 3, 4, 5, 6, 7], 3, async n => {
      active++;
      peak = Math.max(peak, active);
      await new Promise(r => setTimeout(r, 5));
      seen.push(n);
      active--;
    });
    expect(peak).toBe(3);
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps going after a worker rejects', async () => {
    const seen: number[] = [];
    await runPool([1, 2, 3], 2, async n => {
      if (n === 2) {
        throw new Error('boom');
      }
      seen.push(n);
    });
    expect(seen.sort()).toEqual([1, 3]);
  });

  it('resolves for an empty list', async () => {
    await expect(runPool([], 3, async () => {})).resolves.toBeUndefined();
  });
});
