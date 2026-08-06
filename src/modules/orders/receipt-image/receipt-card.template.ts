// Satori tree builder for the branded WhatsApp receipt card.
//
// Plain nested objects, not JSX — this project has no JSX/React pipeline
// configured, and satori accepts its native `{ type, props: { style,
// children } }` shape directly, so adding JSX support just for this one
// module would be pure overhead.
//
// IMPORTANT: satori requires every <div> whose `children` resolves to an
// element (not a plain text string) to declare an explicit
// `display: "flex" | "contents" | "none"` on itself — even a single-child
// wrapper. The row()/col() helpers below are the only sanctioned way to
// build a div with element children for exactly this reason; a bare
// `{ type: 'div', props: { children: someElement } }` without one of those
// will throw at render time. Leaf divs (no `children` key at all) are exempt.

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

const COLORS = {
  paper: '#fbf8f5',
  ink: '#241f1c',
  inkSoft: '#6e655d',
  line: '#e8e1d8',
  evergreen: '#2f4a3b',
  rust: '#a8481c',
  rustTint: '#f7e9e0',
  footerBg: '#f1ece5',
  kamaiText: '#a79c8f',
};

const OUTER_PAD = 64;

// Structural type for satori's native node shape — not React's ReactNode,
// just the plain-object tree satori itself accepts. Kept minimal (only
// what this template actually emits) so the helpers below stay type-safe
// without pulling in @types/react for a project that has no JSX pipeline.
interface Node {
  type: 'div' | 'img';
  props: {
    style?: Record<string, unknown>;
    children?: Node | Node[] | string;
    src?: string;
    width?: number;
    height?: number;
  };
}

function row(children: Node[], style: Record<string, unknown> = {}): Node {
  return { type: 'div', props: { style: { display: 'flex', flexDirection: 'row', ...style }, children } };
}
function col(children: Node[], style: Record<string, unknown> = {}): Node {
  return { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', ...style }, children } };
}
function text(value: string, style: Record<string, unknown> = {}): Node {
  return { type: 'div', props: { style, children: value } };
}
function dashedRule(style: Record<string, unknown> = {}): Node {
  return { type: 'div', props: { style: { width: '100%', height: 0, borderTop: `2px dashed ${COLORS.line}`, ...style } } };
}

export interface ReceiptCardData {
  businessName: string;
  /** Base64 data: URI for the baker's logo, already fetched server-side. Null renders an initial-letter monogram instead. */
  logoDataUri: string | null;
  orderNumber: string;
  customerName: string;
  itemName: string;
  /** e.g. "2 lb · 1 unit" — already formatted, empty string to omit the line entirely. */
  itemMeta: string;
  /** "Delivery on" | "Pickup on" */
  deliveryLabel: string;
  deliveryDateText: string;
  totalText: string;
  advancePaidText: string;
  /** Formatted balance string, or null when the order is fully paid (renders the paid-in-full badge instead). */
  balanceDueText: string | null;
}

function logoNode(data: ReceiptCardData): Node {
  if (data.logoDataUri != null) {
    return { type: 'img', props: { src: data.logoDataUri, width: 132, height: 132, style: { borderRadius: 999, objectFit: 'cover' } } };
  }
  const initial = (data.businessName.trim()[0] || '?').toUpperCase();
  return col(
    [text(initial, { fontFamily: 'Fraunces', fontWeight: 600, fontSize: 56, color: COLORS.paper })],
    { width: 132, height: 132, borderRadius: 999, background: COLORS.evergreen, alignItems: 'center', justifyContent: 'center' },
  );
}

export function buildReceiptCardTree(data: ReceiptCardData): Node {
  return col(
    [
      col(
        [
          logoNode(data),
          text(data.businessName, {
            fontFamily: 'Fraunces', fontWeight: 600, fontSize: 56, color: COLORS.ink,
            marginTop: 28, textAlign: 'center',
          }),
          text(`RECEIPT · #${data.orderNumber}`, {
            fontFamily: 'IBM Plex Sans', fontWeight: 400, fontSize: 26, letterSpacing: 2,
            color: COLORS.inkSoft, marginTop: 14,
          }),
        ],
        { alignItems: 'center', paddingTop: 58 },
      ),
      dashedRule({ margin: `44px ${OUTER_PAD}px 0` }),
      col(
        [
          text('Billed to', {
            fontFamily: 'IBM Plex Sans', fontWeight: 600, fontSize: 24, letterSpacing: 2,
            textTransform: 'uppercase', color: COLORS.evergreen, marginBottom: 16,
          }),
          text(data.customerName, { fontFamily: 'IBM Plex Sans', fontWeight: 600, fontSize: 38 }),
        ],
        { paddingTop: 52, paddingLeft: OUTER_PAD, paddingRight: OUTER_PAD },
      ),
      col(
        [
          text('Order', {
            fontFamily: 'IBM Plex Sans', fontWeight: 600, fontSize: 24, letterSpacing: 2,
            textTransform: 'uppercase', color: COLORS.evergreen, marginBottom: 16,
          }),
          text(data.itemName, { fontFamily: 'IBM Plex Sans', fontWeight: 500, fontSize: 34 }),
          ...(data.itemMeta.length > 0
            ? [text(data.itemMeta, { fontFamily: 'IBM Plex Sans', fontWeight: 400, fontSize: 26, color: COLORS.inkSoft, marginTop: 10 })]
            : []),
          row(
            [
              text(data.deliveryLabel, { fontSize: 26, color: COLORS.inkSoft, marginRight: 8 }),
              text(data.deliveryDateText, { fontSize: 26, fontWeight: 600, color: COLORS.ink }),
            ],
            { marginTop: 16 },
          ),
        ],
        { paddingTop: 48, paddingLeft: OUTER_PAD, paddingRight: OUTER_PAD },
      ),
      col(
        [
          col(
            [
              row(
                [text('Total', { color: COLORS.ink, fontWeight: 600, fontSize: 30 }), text(data.totalText, { color: COLORS.ink, fontWeight: 600, fontSize: 30 })],
                { justifyContent: 'space-between' },
              ),
              row(
                [text('Advance paid', { color: COLORS.inkSoft, fontSize: 26 }), text(data.advancePaidText, { color: COLORS.ink, fontWeight: 500, fontSize: 26 })],
                { justifyContent: 'space-between', marginTop: 18 },
              ),
              { type: 'div', props: { style: { width: '100%', height: 1, background: COLORS.line, margin: '18px 0' } } },
              data.balanceDueText != null
                ? row(
                    [text('Balance due', { fontWeight: 600, fontSize: 26 }), text(data.balanceDueText, { fontWeight: 600, fontSize: 26 })],
                    {
                      justifyContent: 'space-between', background: COLORS.rustTint, color: COLORS.rust,
                      borderRadius: 14, padding: '20px 24px',
                    },
                  )
                : row(
                    [text('✓ Paid in full', { fontWeight: 600, fontSize: 26 })],
                    {
                      justifyContent: 'center', background: '#e7eee8', color: COLORS.evergreen,
                      borderRadius: 14, padding: '20px 24px',
                    },
                  ),
            ],
            { background: COLORS.footerBg, borderRadius: 20, padding: 32 },
          ),
          col(
            [
              text('Thank you', { fontFamily: 'Fraunces', fontWeight: 600, fontSize: 34, color: COLORS.ink, textAlign: 'center' }),
              text('for baking this order with us', { fontSize: 26, color: COLORS.inkSoft, textAlign: 'center', marginTop: 8 }),
            ],
            { alignItems: 'center', marginTop: 34 },
          ),
        ],
        { marginTop: 46, paddingLeft: OUTER_PAD, paddingRight: OUTER_PAD },
      ),
      row(
        [
          { type: 'div', props: { style: { width: 22, height: 22, borderRadius: 6, background: COLORS.kamaiText } } },
          text('Powered by', { fontSize: 26, color: COLORS.kamaiText, marginLeft: 12, marginRight: 6 }),
          text('Kamai', { fontSize: 26, fontWeight: 600, color: COLORS.kamaiText }),
        ],
        {
          marginTop: 26, borderTop: `2px solid ${COLORS.line}`, background: COLORS.footerBg,
          padding: `28px ${OUTER_PAD}px 30px`, alignItems: 'center', justifyContent: 'center',
        },
      ),
    ],
    { width: CARD_WIDTH, height: CARD_HEIGHT, background: COLORS.paper, fontFamily: 'IBM Plex Sans' },
  );
}
