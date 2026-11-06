import { boxToView } from '../boxLayout';

test('same aspect: plain scaling', () => {
  expect(boxToView([0.25, 0.5, 0.75, 1], { width: 480, height: 640 }, { width: 240, height: 320 })).toEqual({
    left: 60, top: 160, width: 120, height: 160,
  });
});

test('taller view: frame is scaled up to the height and cropped at the sides', () => {
  // 480×640 frame on a 400×1000 view → scale 1.5625, frame 750 wide, 175 px cropped each side
  const r = boxToView([0, 0, 1, 1], { width: 480, height: 640 }, { width: 400, height: 1000 });
  expect(r.left).toBeCloseTo(-175);
  expect(r.width).toBeCloseTo(750);
  expect(r.top).toBeCloseTo(0);
  expect(r.height).toBeCloseTo(1000);
});
