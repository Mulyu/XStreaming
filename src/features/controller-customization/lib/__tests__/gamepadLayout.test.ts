import {LAYOUT_SNAP_GRID, snapCenterToGrid, snapToGrid} from '../gamepadLayout';

describe('snapCenterToGrid', () => {
  it('puts the center of the element on a grid point', () => {
    // A 60x60 button dropped with its top-left at (33, 47): its center is
    // (63, 77), which snaps to (60, 80), so the top-left is (30, 50).
    expect(snapCenterToGrid(33, 47, 60, 60)).toEqual({x: 30, y: 50});
  });

  it('is independent of the element size: the center always snaps', () => {
    for (const size of [50, 60, 70, 100, 123]) {
      const {x, y} = snapCenterToGrid(137, 211, size, size);
      expect((x + size / 2) % LAYOUT_SNAP_GRID).toBe(0);
      expect((y + size / 2) % LAYOUT_SNAP_GRID).toBe(0);
    }
  });

  it('handles non-square elements', () => {
    const {x, y} = snapCenterToGrid(11, 11, 300, 260);
    expect(x + 150).toBe(snapToGrid(11 + 150));
    expect(y + 130).toBe(snapToGrid(11 + 130));
  });

  it('leaves an element that is already centered on the grid where it is', () => {
    expect(snapCenterToGrid(70, 50, 60, 60)).toEqual({x: 70, y: 50});
  });
});
