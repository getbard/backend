import { isEmptyParagraph } from '../slate';

test('can detect an empty paragraph', () => {
  const detectedEmptyParagraph = isEmptyParagraph({
    type: 'paragraph',
    children: [{ text: '' }],
  });

  expect(detectedEmptyParagraph).toBe(true);
});