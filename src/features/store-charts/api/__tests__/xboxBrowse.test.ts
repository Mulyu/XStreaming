import {base64Encode, encodeFilters, XboxBrowseSort} from '../xboxBrowse';

describe('base64Encode', () => {
  // RFC 4648 section 10 test vectors.
  const vectors: Array<[string, string]> = [
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg=='],
    ['fooba', 'Zm9vYmE='],
    ['foobar', 'Zm9vYmFy'],
  ];

  it.each(vectors)('encodes %j as %s', (input, expected) => {
    expect(base64Encode(input)).toBe(expected);
  });

  it('matches Buffer.from(...).toString("base64") across various ASCII strings', () => {
    const samples = [
      'Hi',
      'Man',
      'Ma',
      'M',
      'Hello, world!',
      JSON.stringify({
        PlayWith: {id: 'PlayWith', choices: [{id: 'CloudGaming'}]},
      }),
      'a'.repeat(37),
    ];
    for (const s of samples) {
      expect(base64Encode(s)).toBe(Buffer.from(s).toString('base64'));
    }
  });
});

describe('encodeFilters', () => {
  const sorts: XboxBrowseSort[] = [
    'MostPopular desc',
    'ReleaseDate desc',
    'DiscountPercentage desc',
  ];

  it.each(sorts)('round-trips to the expected filter shape for %s', sort => {
    const decoded = JSON.parse(
      Buffer.from(encodeFilters(sort), 'base64').toString(),
    );
    expect(decoded).toEqual({
      PlayWith: {id: 'PlayWith', choices: [{id: 'CloudGaming'}]},
      orderby: {id: 'orderby', choices: [{id: sort}]},
    });
  });
});
