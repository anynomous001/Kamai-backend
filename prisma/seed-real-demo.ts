/**
 * Seeds one REAL (non-TEST-prefixed) demo baker for manual OTP-login
 * testing with a real email address. Reuses the exact realism logic from
 * prisma/seed.ts (Indian names, mixed order statuses/dates, occasion
 * spread, customers, investments, inventory) but targets a single named
 * account instead of the 3 throwaway "TEST — " bakers, so it reads as a
 * normal account and is NOT touched by prisma/seed-teardown.ts (which only
 * matches the "TEST — " businessName prefix).
 *
 * Run: npx tsx prisma/seed-real-demo.ts
 */
import 'dotenv/config';

import { prisma } from '../src/shared/database/prisma.js';
import { ordersService } from '../src/modules/orders/orders.service.js';
import { createInvestment } from '../src/modules/investments/investments.service.js';
import { inventoryService } from '../src/modules/inventory/inventory.service.js';

// ── RNG helpers ──────────────────────────────────────────────
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
function weightedPick<T>(items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [item, w] of items) {
    if (r < w) return item;
    r -= w;
  }
  return items[items.length - 1][0];
}
function round(n: number, step: number): number {
  return Math.round(n / step) * step;
}

// ── Data pools (identical to prisma/seed.ts) ────────────────
const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Rohan',
  'Priya', 'Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Kavya', 'Myra', 'Anika', 'Riya', 'Isha',
  'Pooja', 'Neha', 'Sneha', 'Divya', 'Meera', 'Rahul', 'Amit', 'Vikram', 'Rajesh', 'Suresh',
  'Karthik', 'Deepak', 'Manoj', 'Sanjay', 'Anjali', 'Sunita', 'Geeta', 'Kiran', 'Nisha', 'Aisha',
];
const LAST_NAMES = [
  'Sharma', 'Verma', 'Gupta', 'Kumar', 'Singh', 'Patel', 'Reddy', 'Rao', 'Nair', 'Iyer',
  'Menon', 'Joshi', 'Mehta', 'Shah', 'Agarwal', 'Bansal', 'Chopra', 'Malhotra', 'Kapoor', 'Desai',
  'Pillai', 'Naidu', 'Das', 'Sen', 'Bose',
];
const AREAS = [
  'MG Road', 'Koramangala', 'Indiranagar', 'Whitefield', 'HSR Layout', 'Andheri West', 'Bandra',
  'Powai', 'Salt Lake', 'Park Street', 'Anna Nagar', 'T Nagar', 'Banjara Hills', 'Jubilee Hills',
  'Sector 18', 'Rajouri Garden', 'Civil Lines', 'Vastrapur',
];
const CITIES = ['Bengaluru', 'Mumbai', 'Kolkata', 'Chennai', 'Hyderabad', 'Delhi', 'Pune', 'Ahmedabad'];

const CAKE_CATEGORIES = [
  'Chocolate Truffle', 'Red Velvet', 'Butterscotch', 'Black Forest', 'Pineapple', 'Vanilla',
  'Fresh Fruit', 'Rainbow', 'Photo Cake', 'Cheesecake', 'Fondant', 'Designer',
];
const FLAVOURS = [
  'Chocolate', 'Vanilla', 'Butterscotch', 'Red Velvet', 'Pineapple', 'Mango', 'Strawberry',
  'Coffee', 'Black Forest', 'Nutella', 'Blueberry', 'Caramel',
];
const OCCASIONS_WEIGHTED = [
  ['Birthday', 55],
  ['Anniversary', 15],
  ['Wedding', 10],
  ["Valentine's Day", 8],
  ['Diwali', 6],
  ['Christmas', 3],
  ['Other Festival', 3],
] as const;

const CUSTOM_FIELD_SAMPLES: { label: string; value: string }[][] = [
  [{ label: 'Cake Message', value: 'Happy Birthday!' }],
  [{ label: 'Allergy Note', value: 'No nuts please' }],
  [{ label: 'Theme', value: 'Superhero' }],
  [{ label: 'Topping', value: 'Extra chocolate shavings' }],
  [{ label: 'Cake Message', value: 'Congratulations!' }, { label: 'Candles', value: 'Number candle - 25' }],
];

const PAYMENT_MODES_WEIGHTED = [
  ['UPI', 55],
  ['CASH', 30],
  ['CARD', 10],
  ['BANK_TRANSFER', 5],
] as const;

const INVESTMENT_CATEGORIES_WEIGHTED = [
  ['ingredients', 45],
  ['packaging', 20],
  ['equipment', 15],
  ['delivery', 10],
  ['utilities', 10],
] as const;
const INVESTMENT_MATERIALS: Record<string, { name: string; unit: string; priceRange: [number, number] }[]> = {
  ingredients: [
    { name: 'Maida (Refined Flour)', unit: 'kg', priceRange: [40, 60] },
    { name: 'Sugar', unit: 'kg', priceRange: [45, 65] },
    { name: 'Butter', unit: 'kg', priceRange: [450, 650] },
    { name: 'Eggs', unit: 'piece', priceRange: [6, 10] },
    { name: 'Cocoa Powder', unit: 'kg', priceRange: [500, 800] },
    { name: 'Whipping Cream', unit: 'litre', priceRange: [350, 500] },
    { name: 'Fresh Fruits', unit: 'kg', priceRange: [80, 200] },
    { name: 'Chocolate Compound', unit: 'kg', priceRange: [350, 600] },
    { name: 'Vanilla Essence', unit: 'ml', priceRange: [1, 3] },
  ],
  packaging: [
    { name: 'Cake Boxes', unit: 'piece', priceRange: [15, 40] },
    { name: 'Cake Boards', unit: 'piece', priceRange: [10, 25] },
    { name: 'Ribbons', unit: 'piece', priceRange: [5, 15] },
    { name: 'Candles', unit: 'packet', priceRange: [20, 50] },
    { name: 'Cake Toppers', unit: 'piece', priceRange: [30, 100] },
  ],
  equipment: [
    { name: 'Piping Bags', unit: 'packet', priceRange: [100, 300] },
    { name: 'Cake Tins', unit: 'piece', priceRange: [200, 800] },
    { name: 'Turntable', unit: 'piece', priceRange: [500, 1500] },
    { name: 'Oven Thermometer', unit: 'piece', priceRange: [200, 500] },
  ],
  delivery: [
    { name: 'Fuel', unit: 'litre', priceRange: [95, 105] },
    { name: 'Insulated Delivery Bags', unit: 'piece', priceRange: [300, 700] },
    { name: 'Ice Packs', unit: 'piece', priceRange: [50, 150] },
  ],
  utilities: [
    { name: 'Electricity Bill', unit: 'unit', priceRange: [8, 12] },
    { name: 'LPG Cylinder', unit: 'piece', priceRange: [900, 1100] },
  ],
};
const SUPPLIERS = ['Local Kirana Store', 'Metro Cash & Carry', 'Sharma Bakery Supplies', 'Wholesale Market', 'Bakers Corner'];

const INVENTORY_ITEMS: { name: string; unit: string; stockRange: [number, number]; hasThreshold: boolean }[] = [
  { name: 'Maida (Flour)', unit: 'kg', stockRange: [5, 40], hasThreshold: true },
  { name: 'Sugar', unit: 'kg', stockRange: [5, 30], hasThreshold: true },
  { name: 'Butter', unit: 'kg', stockRange: [2, 15], hasThreshold: true },
  { name: 'Eggs', unit: 'piece', stockRange: [20, 200], hasThreshold: true },
  { name: 'Cocoa Powder', unit: 'kg', stockRange: [1, 10], hasThreshold: true },
  { name: 'Whipping Cream', unit: 'litre', stockRange: [1, 12], hasThreshold: false },
  { name: 'Food Color', unit: 'ml', stockRange: [50, 500], hasThreshold: false },
  { name: 'Cake Boards', unit: 'piece', stockRange: [5, 60], hasThreshold: true },
  { name: 'Cake Boxes', unit: 'piece', stockRange: [5, 80], hasThreshold: true },
  { name: 'Ribbons', unit: 'piece', stockRange: [10, 100], hasThreshold: false },
  { name: 'Candles', unit: 'packet', stockRange: [3, 40], hasThreshold: false },
  { name: 'Chocolate Chips', unit: 'kg', stockRange: [1, 8], hasThreshold: true },
  { name: 'Vanilla Essence', unit: 'ml', stockRange: [50, 400], hasThreshold: false },
  { name: 'Baking Powder', unit: 'kg', stockRange: [0.5, 5], hasThreshold: true },
  { name: 'Milk', unit: 'litre', stockRange: [2, 20], hasThreshold: false },
];

function toDateOnlyString(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function indianMobile(used: Set<string>): string {
  let n: string;
  do {
    n = `${pick(['6', '7', '8', '9'])}${Array.from({ length: 9 }, () => randInt(0, 9)).join('')}`;
  } while (used.has(n));
  used.add(n);
  return n;
}

const BAKER_CONFIG = {
  businessName: "Pritam's Cake Studio",
  ownerName: 'Pritam Chakroborty',
  email: 'chakrobortypritam1@gmail.com',
  subscriptionStatus: 'ACTIVE',
  subscriptionPlan: 'EARLY_ADOPTER',
  isEarlyAdopter: true,
  razorpaySubscriptionId: null as string | null,
  trialEndsAt: null as Date | null,
};

async function backdatePaymentEventsForOrder(orderId: string, createdAt: Date, deliveryDate: Date, hasBalancePayment: boolean) {
  const events = await prisma.paymentEvent.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
  if (events.length === 0) return;

  const advanceJitterMs = randInt(0, 2) * 24 * 60 * 60 * 1000;
  const advanceAt = new Date(createdAt.getTime() + advanceJitterMs);
  await prisma.paymentEvent.update({
    where: { id: events[0].id },
    data: { occurredAt: advanceAt, createdAt: advanceAt },
  });

  if (hasBalancePayment && events[1]) {
    const nowUtc = new Date();
    const windowEnd = deliveryDate.getTime() < nowUtc.getTime() ? deliveryDate.getTime() : nowUtc.getTime();
    const span = Math.max(windowEnd - advanceAt.getTime(), 60 * 60 * 1000);
    const balanceAt = new Date(advanceAt.getTime() + randInt(0, 100) / 100 * span);
    await prisma.paymentEvent.update({
      where: { id: events[1].id },
      data: { occurredAt: balanceAt, createdAt: balanceAt },
    });
  }
}

async function createOneOrder(bakerId: string, customerName: string, customerPhone: string | null, customerAddress: string | undefined) {
  const nowUtc = new Date();

  const createdAt = new Date(nowUtc.getTime() - randInt(0, 180) * 24 * 60 * 60 * 1000);
  const deliveryDate = new Date(createdAt.getTime() + randInt(1, 45) * 24 * 60 * 60 * 1000);
  const isPastDelivery = deliveryDate.getTime() < nowUtc.getTime();

  const deliveryType = Math.random() < 0.6 ? 'pickup' : 'delivery';
  const totalPrice = round(randInt(400, 4000), 50);

  const advanceRoll = Math.random();
  let advancePaid: number;
  let forceConfirm = false;
  if (advanceRoll < 0.15) {
    advancePaid = 0;
    forceConfirm = Math.random() < 0.3;
  } else if (advanceRoll < 0.7) {
    advancePaid = round(totalPrice * (0.3 + Math.random() * 0.4), 10);
  } else {
    advancePaid = totalPrice;
  }
  if (advancePaid > totalPrice) advancePaid = totalPrice;

  const category = pick(CAKE_CATEGORIES);
  const occasion = weightedPick(OCCASIONS_WEIGHTED);
  const paymentMethod = weightedPick(PAYMENT_MODES_WEIGHTED);
  const hasCustomFields = Math.random() < 0.25;

  const payload = {
    customer: { name: customerName, phone: customerPhone, address: customerAddress },
    cake: {
      category,
      flavour: pick(FLAVOURS),
      weightInPounds: pick([0.5, 1, 1.5, 2, 2.5, 3, 4, 5]),
      quantity: Math.random() < 0.15 ? pick([6, 12, 18, 24]) : undefined,
    },
    occasion,
    customInstructions: undefined,
    delivery: {
      type: deliveryType as 'pickup' | 'delivery',
      date: toDateOnlyString(deliveryDate),
      time: Math.random() < 0.6 ? `${randInt(10, 19)}:00` : undefined,
      charge: deliveryType === 'delivery' ? pick([0, 40, 60, 80, 100, 150]) : 0,
    },
    payment: {
      totalPrice,
      advancePaid,
      paymentMethod: paymentMethod as 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER',
      forceConfirm,
    },
    referencePhotoUrl: undefined,
    internalNotes: undefined,
    customFields: hasCustomFields ? pick(CUSTOM_FIELD_SAMPLES) : undefined,
  };

  const created = await ordersService.createOrder(bakerId, payload as any);

  let hasBalancePayment = false;
  const statusRoll = Math.random();
  try {
    if (isPastDelivery) {
      if (statusRoll < 0.12) {
        await ordersService.cancelOrder(bakerId, created.orderNumber);
      } else if (statusRoll < 0.85) {
        if (created.status === 'Pending') await ordersService.updateOrderStatus(bakerId, created.orderNumber, 'Confirmed');
        await ordersService.updateOrderStatus(bakerId, created.orderNumber, 'In Progress');
        await ordersService.updateOrderStatus(bakerId, created.orderNumber, 'Ready');
        await ordersService.updateOrderStatus(bakerId, created.orderNumber, 'Delivered');
        if (created.balanceDue > 0 && Math.random() < 0.85) {
          await ordersService.recordPayment(bakerId, created.orderNumber, {
            amountReceived: created.balanceDue,
            paymentMethod: weightedPick(PAYMENT_MODES_WEIGHTED) as any,
          });
          hasBalancePayment = true;
        }
      } else {
        if (created.status === 'Pending') await ordersService.updateOrderStatus(bakerId, created.orderNumber, 'Confirmed');
        if (Math.random() < 0.5) await ordersService.updateOrderStatus(bakerId, created.orderNumber, 'In Progress');
      }
    } else {
      if (statusRoll < 0.08) {
        await ordersService.cancelOrder(bakerId, created.orderNumber);
      } else if (statusRoll < 0.35 && created.status === 'Pending') {
        await ordersService.updateOrderStatus(bakerId, created.orderNumber, 'Confirmed');
      } else if (statusRoll < 0.5) {
        if (created.status === 'Pending') await ordersService.updateOrderStatus(bakerId, created.orderNumber, 'Confirmed');
        await ordersService.updateOrderStatus(bakerId, created.orderNumber, 'In Progress');
      }
      if (created.balanceDue > 0 && Math.random() < 0.2) {
        const partial = round(created.balanceDue * (0.3 + Math.random() * 0.5), 10);
        await ordersService.recordPayment(bakerId, created.orderNumber, {
          amountReceived: Math.min(partial, created.balanceDue),
          paymentMethod: weightedPick(PAYMENT_MODES_WEIGHTED) as any,
        });
        hasBalancePayment = true;
      }
    }
  } catch (err) {
    // State machine or balance guards rejected an opportunistic transition — fine.
  }

  await prisma.order.update({ where: { id: created.orderId }, data: { createdAt } });
  await backdatePaymentEventsForOrder(created.orderId, createdAt, deliveryDate, hasBalancePayment);

  return created;
}

async function main() {
  const existing = await prisma.baker.findUnique({ where: { email: BAKER_CONFIG.email } });
  if (existing) {
    console.log(`Baker already exists for ${BAKER_CONFIG.email} (${existing.id}) — aborting to avoid duplicating data.`);
    return;
  }

  console.log(`\n=== Seeding real demo baker: ${BAKER_CONFIG.businessName} (${BAKER_CONFIG.email}) ===`);

  const baker = await prisma.baker.create({
    data: {
      businessName: BAKER_CONFIG.businessName,
      ownerName: BAKER_CONFIG.ownerName,
      email: BAKER_CONFIG.email,
      phoneNumber: `9${randInt(100000000, 999999999)}`,
      status: 'ACTIVE',
      subscriptionStatus: BAKER_CONFIG.subscriptionStatus,
      subscriptionPlan: BAKER_CONFIG.subscriptionPlan,
      isEarlyAdopter: BAKER_CONFIG.isEarlyAdopter,
      razorpaySubscriptionId: BAKER_CONFIG.razorpaySubscriptionId,
      trialEndsAt: BAKER_CONFIG.trialEndsAt,
      upiVpa: `${BAKER_CONFIG.ownerName.toLowerCase().replace(/\s+/g, '')}@okaxis`,
      isVerified: true,
      fssaiVerified: true,
      whatsappReceiptEnabled: true,
    },
  });
  console.log(`  baker created: ${baker.id} (${baker.displayId})`);

  const numCustomers = randInt(6, 8);
  const nullPhoneCount = 1;
  const phonedCount = numCustomers - nullPhoneCount;
  const repeatCount = 2;

  const usedPhones = new Set<string>();
  type CustomerPlan = { name: string; phone: string | null; address: string | undefined; orderCount: number };
  const plans: CustomerPlan[] = [];

  for (let i = 0; i < repeatCount; i++) {
    plans.push({
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      phone: indianMobile(usedPhones),
      address: `${randInt(1, 200)}, ${pick(AREAS)}, ${pick(CITIES)}`,
      orderCount: randInt(2, 3),
    });
  }
  for (let i = 0; i < phonedCount - repeatCount; i++) {
    plans.push({
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      phone: indianMobile(usedPhones),
      address: Math.random() < 0.7 ? `${randInt(1, 200)}, ${pick(AREAS)}, ${pick(CITIES)}` : undefined,
      orderCount: 1,
    });
  }
  for (let i = 0; i < nullPhoneCount; i++) {
    plans.push({
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      phone: null,
      address: undefined,
      orderCount: 1,
    });
  }

  let totalPlanned = plans.reduce((s, p) => s + p.orderCount, 0);
  const targetTotal = randInt(14, 18);
  let guard = 0;
  while (totalPlanned !== targetTotal && guard < 500) {
    const p = plans[randInt(0, plans.length - 1)];
    if (totalPlanned < targetTotal && p.orderCount < 5) {
      p.orderCount++;
      totalPlanned++;
    } else if (totalPlanned > targetTotal && p.orderCount > 1) {
      p.orderCount--;
      totalPlanned--;
    } else {
      break;
    }
    guard++;
  }

  console.log(`  ${plans.length} customers planned (${nullPhoneCount} phone-less), ${totalPlanned} orders planned`);

  const CONCURRENCY = 2;
  let ordersCreated = 0;
  for (let i = 0; i < plans.length; i += CONCURRENCY) {
    const batch = plans.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (p) => {
        for (let o = 0; o < p.orderCount; o++) {
          await createOneOrder(baker.id, p.name, p.phone, p.address);
          ordersCreated++;
        }
      }),
    );
    console.log(`  ... ${Math.min(i + CONCURRENCY, plans.length)}/${plans.length} customers done, ${ordersCreated} orders so far`);
  }
  console.log(`  orders complete: ${ordersCreated}`);

  const numInvestments = randInt(8, 10);
  for (let i = 0; i < numInvestments; i++) {
    const category = weightedPick(INVESTMENT_CATEGORIES_WEIGHTED);
    const material = pick(INVESTMENT_MATERIALS[category]);
    const quantity = category === 'utilities' ? 1 : round(1 + Math.random() * 9, 0.5);
    const pricePerUnit = randInt(material.priceRange[0], material.priceRange[1]);
    const purchaseDate = new Date(Date.now() - randInt(0, 180) * 24 * 60 * 60 * 1000);

    await createInvestment(baker.id, {
      category,
      description: Math.random() < 0.3 ? `Restock for upcoming orders` : undefined,
      materialName: material.name,
      quantity,
      unit: material.unit,
      pricePerUnit,
      supplierName: Math.random() < 0.6 ? pick(SUPPLIERS) : undefined,
      purchaseDate: toDateOnlyString(purchaseDate),
    } as any);
  }
  console.log(`  investments complete: ${numInvestments}`);

  const shuffledItems = [...INVENTORY_ITEMS].sort(() => Math.random() - 0.5);
  const numItems = randInt(8, 10);
  for (const item of shuffledItems.slice(0, numItems)) {
    const currentStock = round(item.stockRange[0] + Math.random() * (item.stockRange[1] - item.stockRange[0]), 0.5);
    const lowStockThreshold = item.hasThreshold
      ? Math.random() < 0.25
        ? round(currentStock * (1 + Math.random() * 0.3), 0.5)
        : round(item.stockRange[0] * (0.8 + Math.random() * 0.4), 0.5)
      : undefined;

    await inventoryService.createItem(baker.id, {
      name: item.name,
      unit: item.unit,
      currentStock,
      lowStockThreshold,
      supplierName: Math.random() < 0.6 ? pick(SUPPLIERS) : undefined,
      lastPurchaseDate: toDateOnlyString(new Date(Date.now() - randInt(0, 60) * 24 * 60 * 60 * 1000)),
    } as any);
  }
  console.log(`  inventory items complete: ${numItems}`);

  console.log(`\nDone. ${BAKER_CONFIG.email} is ready for real OTP login.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
