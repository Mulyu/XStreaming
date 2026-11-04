import {parseQueueStatus} from '../queueStatus';

const NOW = 1_800_000_000;
const payload = (entry: any) => ({data: {'NP-TYO-01': entry}});

describe('parseQueueStatus', () => {
  it('reads the queue length and the tracker eta (ms) as minutes, rounded up', () => {
    expect(
      parseQueueStatus(
        payload({QueuePosition: 78, 'Last Updated': NOW - 60, eta: 588000}),
        'NP-TYO-01',
        NOW,
      ),
    ).toEqual({waiting: 78, etaMinutes: 10});
  });

  it('works the eta out itself (6 s a person + 2 min) when the entry has none', () => {
    expect(
      parseQueueStatus(
        payload({QueuePosition: 10, 'Last Updated': NOW}),
        'NP-TYO-01',
        NOW,
      ),
    ).toEqual({waiting: 10, etaMinutes: 3});
  });

  it('shows an empty queue as zero people, about a minute', () => {
    expect(
      parseQueueStatus(
        payload({QueuePosition: 0, 'Last Updated': NOW, eta: 0}),
        'NP-TYO-01',
        NOW,
      ),
    ).toEqual({waiting: 0, etaMinutes: 2});
  });

  it('gives no figure for a stale, missing or malformed entry', () => {
    const old = payload({QueuePosition: 5, 'Last Updated': NOW - 7200});
    expect(parseQueueStatus(old, 'NP-TYO-01', NOW)).toBeNull();
    expect(parseQueueStatus(old, 'NP-OSA-01', NOW)).toBeNull();
    expect(parseQueueStatus({}, 'NP-TYO-01', NOW)).toBeNull();
    expect(parseQueueStatus(null, 'NP-TYO-01', NOW)).toBeNull();
    expect(
      parseQueueStatus(
        payload({QueuePosition: 'x', 'Last Updated': NOW}),
        'NP-TYO-01',
        NOW,
      ),
    ).toBeNull();
  });
});
