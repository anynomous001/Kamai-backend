import { describe, it, expect } from 'vitest';
import satori from 'satori';
import sharp from 'sharp';

import { buildReceiptCardTree, CARD_WIDTH, CARD_HEIGHT, type ReceiptCardData } from '../../src/modules/orders/receipt-image/receipt-card.template.js';
import { loadReceiptCardFonts } from '../../src/modules/orders/receipt-image/fonts.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectText(node: any, out: string[] = []): string[] {
  if (node === null || node === undefined) return out;
  const children = node?.props?.children;
  if (typeof children === 'string') {
    out.push(children);
  } else if (Array.isArray(children)) {
    children.forEach((c) => collectText(c, out));
  } else if (children !== undefined) {
    collectText(children, out);
  }
  return out;
}

function hasNodeOfType(node: unknown, type: string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n = node as any;
  if (n === null || n === undefined) return false;
  if (n.type === type) return true;
  const children = n?.props?.children;
  if (Array.isArray(children)) return children.some((c) => hasNodeOfType(c, type));
  if (typeof children === 'object') return hasNodeOfType(children, type);
  return false;
}

const baseData: ReceiptCardData = {
  businessName: "Ananya's Home Bakery",
  logoDataUri: null,
  orderNumber: 'ORD-000482',
  customerName: 'Priya Sharma',
  itemName: 'Chocolate Truffle Cake',
  itemMeta: '2 lb · 1 unit',
  deliveryLabel: 'Delivery on',
  deliveryDateText: '18 August 2026',
  totalText: '₹1,800',
  advancePaidText: '₹500',
  balanceDueText: '₹1,300',
};

describe('buildReceiptCardTree — tree content (built object, not rendered SVG)', () => {
  // satori converts every glyph to an SVG <path> outline, not literal text
  // runs — so string content can only be asserted on the tree satori is
  // given, not on its rendered SVG output. <img> is the one case that DOES
  // produce a literal SVG element, checked separately below.
  it('includes the balance-due row and its amount when balanceDueText is set', () => {
    const texts = collectText(buildReceiptCardTree(baseData));
    expect(texts).toContain('Balance due');
    expect(texts).toContain('₹1,300');
    expect(texts).not.toContain('✓ Paid in full');
  });

  it('replaces the balance row with a paid-in-full badge when balanceDueText is null', () => {
    const texts = collectText(buildReceiptCardTree({ ...baseData, balanceDueText: null }));
    expect(texts).toContain('✓ Paid in full');
    expect(texts).not.toContain('Balance due');
  });

  it('renders a monogram (no <img> node) when logoDataUri is null', () => {
    const tree = buildReceiptCardTree(baseData);
    expect(hasNodeOfType(tree, 'img')).toBe(false);
    // first letter of the business name, as the fallback mark
    expect(collectText(tree)).toContain('A');
  });

  it('renders an <img> node when logoDataUri is provided', () => {
    const tree = buildReceiptCardTree({ ...baseData, logoDataUri: 'data:image/png;base64,AAAA' });
    expect(hasNodeOfType(tree, 'img')).toBe(true);
  });

  it('omits the item-meta line entirely when itemMeta is empty', () => {
    const withMeta = collectText(buildReceiptCardTree(baseData));
    const withoutMeta = collectText(buildReceiptCardTree({ ...baseData, itemMeta: '' }));
    expect(withMeta).toContain('2 lb · 1 unit');
    expect(withoutMeta).not.toContain('2 lb · 1 unit');
  });
});

// Regression guard for a real failure mode hit while building this
// template: satori throws at render time (not at type-check time) if any
// <div> with element children is missing an explicit `display` style —
// a mistake TypeScript cannot catch since satori's tree is plain objects.
// Actually rendering through satori is the only thing that catches it.
describe('buildReceiptCardTree — actually renders through satori', () => {
  it('renders the balance-due state to a valid PNG at the specified dimensions', async () => {
    const fonts = await loadReceiptCardFonts();
    const svg = await satori(buildReceiptCardTree(baseData), { width: CARD_WIDTH, height: CARD_HEIGHT, fonts });
    expect(svg).toContain('<svg');

    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(CARD_WIDTH);
    expect(meta.height).toBe(CARD_HEIGHT);
  });

  it('renders the paid-in-full state without throwing', async () => {
    const fonts = await loadReceiptCardFonts();
    const svg = await satori(buildReceiptCardTree({ ...baseData, balanceDueText: null }), { width: CARD_WIDTH, height: CARD_HEIGHT, fonts });
    expect(svg).toContain('<svg');
  });

  it('renders with a real embedded logo image without throwing', async () => {
    const fonts = await loadReceiptCardFonts();
    const tinyPngDataUri =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const svg = await satori(buildReceiptCardTree({ ...baseData, logoDataUri: tinyPngDataUri }), { width: CARD_WIDTH, height: CARD_HEIGHT, fonts });
    expect(svg).toContain('<image');
  });

  it('renders with an empty itemMeta without throwing', async () => {
    const fonts = await loadReceiptCardFonts();
    const svg = await satori(buildReceiptCardTree({ ...baseData, itemMeta: '' }), { width: CARD_WIDTH, height: CARD_HEIGHT, fonts });
    expect(svg).toContain('<svg');
  });
});
