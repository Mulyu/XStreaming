import {planUrl, regionTag} from '../planLinks';

describe('planUrl', () => {
  it('points Xbox at the Microsoft account services page in the app language', () => {
    expect(planUrl('xbox', 'ja')).toBe(
      'https://account.microsoft.com/services?lang=ja-JP',
    );
  });

  it('uses a lower-case region path on the NVIDIA membership page', () => {
    expect(planUrl('gfn', 'ja')).toBe(
      'https://www.nvidia.com/ja-jp/geforce-now/premium-memberships/',
    );
    expect(planUrl('gfn', 'zht')).toContain('/zh-tw/');
  });

  it('has one PlayStation account management page for every language', () => {
    expect(planUrl('psplus', 'ja')).toBe(planUrl('psplus', 'en'));
  });

  it('falls back to US English for an unknown locale', () => {
    expect(regionTag('xx')).toBe('en-US');
    expect(regionTag(undefined)).toBe('en-US');
  });
});
