import {describeProvisionError} from '../streamAdapter';

describe('describeProvisionError', () => {
  it('puts a plain-language line in front of a refused session lock', () => {
    const out = describeProvisionError('[GAIKAI] step10 lock http 401');
    expect(out.endsWith('\n[GAIKAI] step10 lock http 401')).toBe(true);
    expect(out.length).toBeGreaterThan('[GAIKAI] step10 lock http 401'.length);
  });

  it('names the console-token requirement apart from a plain refused lock', () => {
    const plain = describeProvisionError('[GAIKAI] step10 lock http 401');
    const token = describeProvisionError(
      '[GAIKAI] step10 lock http 401 (console token required)',
    );
    expect(
      token.endsWith(
        '\n[GAIKAI] step10 lock http 401 (console token required)',
      ),
    ).toBe(true);
    // Different line in front of the same step text.
    expect(token.split('\n')[0]).not.toBe(plain.split('\n')[0]);
  });

  it('leaves every other failure as it is', () => {
    expect(describeProvisionError('[GAIKAI] step13 allocate http 409')).toBe(
      '[GAIKAI] step13 allocate http 409',
    );
    expect(describeProvisionError('provision error 1')).toBe(
      'provision error 1',
    );
  });
});
