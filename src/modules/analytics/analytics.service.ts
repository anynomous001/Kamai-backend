import { prisma } from '../../shared/database/prisma.js';
import { getISTCalendarDate } from '../../shared/utils/ist-date.util.js';

export interface MonthlyAnalytics {
  month: string; // YYYY-MM
  revenue: number;
  expenses: number;
  profit: number;
  orderCount: number;
}

export interface CategoryBreakdown {
  category: string;
  amount: number;
}

export interface AnalyticsSummary {
  months: MonthlyAnalytics[];
  expensesByCategory: CategoryBreakdown[];
}

function monthKey(year: number, monthIdx: number): string {
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
}

/**
 * Monthly revenue/expenses/profit/orderCount trend plus an expense-category
 * breakdown, both scoped to the same `months`-sized trailing window
 * (including the current, in-progress month) — "this month only" is just
 * months=1. Two queries total (orders + investments over the whole window),
 * bucketed in-memory per calendar month, mirroring the calendar endpoint's
 * own single-fetch-then-bucket approach rather than one query per month.
 *
 * Revenue uses the same non-Cancelled exclusion the dashboard's totalRevenue
 * figure already uses, so a baker's current-month number here always
 * matches what they see on the Dashboard.
 */
export async function getAnalyticsSummary(bakerId: string, months: number): Promise<AnalyticsSummary> {
  const { year: currentYear, month: currentMonthIdx } = getISTCalendarDate();

  const windowStart = new Date(Date.UTC(currentYear, currentMonthIdx - (months - 1), 1));
  const windowEnd = new Date(Date.UTC(currentYear, currentMonthIdx + 1, 0, 23, 59, 59, 999));

  const [orders, expenses] = await Promise.all([
    prisma.order.findMany({
      where: {
        bakerId,
        deliveryDate: { gte: windowStart, lte: windowEnd },
        orderStatus: { not: 'Cancelled' },
      },
      select: { deliveryDate: true, totalPrice: true },
    }),
    prisma.investment.findMany({
      where: {
        bakerId,
        deletedAt: null,
        purchaseDate: { gte: windowStart, lte: windowEnd },
      },
      select: { purchaseDate: true, totalCost: true, category: true },
    }),
  ]);

  // Pre-seed every month in the window, zero-filled, oldest first - a gap
  // month with no orders/expenses must still be a $0 point, not a missing
  // one, so the trend stays evenly spaced (one point per month, as scoped).
  const monthsMap = new Map<string, MonthlyAnalytics>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(currentYear, currentMonthIdx - i, 1));
    const key = monthKey(d.getUTCFullYear(), d.getUTCMonth());
    monthsMap.set(key, { month: key, revenue: 0, expenses: 0, profit: 0, orderCount: 0 });
  }

  for (const order of orders) {
    const key = monthKey(order.deliveryDate.getUTCFullYear(), order.deliveryDate.getUTCMonth());
    const bucket = monthsMap.get(key);
    if (!bucket) continue; // outside the seeded window - shouldn't happen given the query bounds
    bucket.revenue += Number(order.totalPrice);
    bucket.orderCount += 1;
  }

  const categoryTotals = new Map<string, number>();
  for (const expense of expenses) {
    const amount = Number(expense.totalCost);
    const key = monthKey(expense.purchaseDate.getUTCFullYear(), expense.purchaseDate.getUTCMonth());
    const bucket = monthsMap.get(key);
    if (bucket) bucket.expenses += amount;
    categoryTotals.set(expense.category, (categoryTotals.get(expense.category) ?? 0) + amount);
  }

  const monthsArray = Array.from(monthsMap.values()).map((m) => ({
    month: m.month,
    revenue: Math.round(m.revenue * 100) / 100,
    expenses: Math.round(m.expenses * 100) / 100,
    profit: Math.round((m.revenue - m.expenses) * 100) / 100,
    orderCount: m.orderCount,
  }));

  const expensesByCategory = Array.from(categoryTotals.entries())
    .map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);

  return { months: monthsArray, expensesByCategory };
}
