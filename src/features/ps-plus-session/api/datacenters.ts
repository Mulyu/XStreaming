// The PS Plus cloud datacenters this device has seen. Every connection attempt
// that gets as far as Sony's datacenter list returns it (merged with the
// earlier runs' ping results) as JSON: one row per datacenter with its name
// (`dataCenter`), the round-trip time it measured (`rtt`, ms) and whether it was
// actually `measured`. Settings keeps the latest and offers it as the choice of
// which server to connect to.

export type PsDatacenter = {
  name: string;
  /** Round-trip time in ms, or null when it was never measured. */
  rttMs: number | null;
};

// Measured ones first (fastest first), then the never-measured ones by name.
export const parseDatacenters = (json: string | undefined): PsDatacenter[] => {
  if (!json) {
    return [];
  }
  let raw: any;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const list: PsDatacenter[] = [];
  raw.forEach(row => {
    const name = typeof row?.dataCenter === 'string' ? row.dataCenter : '';
    if (!name || seen.has(name)) {
      return;
    }
    seen.add(name);
    const rtt = Number(row?.rtt);
    list.push({
      name,
      rttMs: row?.measured === true && rtt > 0 ? Math.round(rtt) : null,
    });
  });
  return list.sort((a, b) => {
    if (a.rttMs !== null && b.rttMs !== null) {
      return a.rttMs - b.rttMs || a.name.localeCompare(b.name);
    }
    if (a.rttMs !== null) {
      return -1;
    }
    if (b.rttMs !== null) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });
};

// The Settings choices: Auto (nothing forced), then each known datacenter with
// its measured round-trip time. A server that is chosen but not (or no longer) in
// the list stays selectable so the setting never silently reads as Auto.
export const buildDatacenterOptions = (
  json: string | undefined,
  selected: string,
  autoLabel: string,
): {value: string; text: string}[] => {
  const known = parseDatacenters(json);
  const options = [
    {value: '', text: autoLabel},
    ...known.map(dc => ({
      value: dc.name,
      text: dc.rttMs === null ? dc.name : `${dc.name} · ${dc.rttMs} ms`,
    })),
  ];
  if (selected && !known.some(dc => dc.name === selected)) {
    options.push({value: selected, text: selected});
  }
  return options;
};
