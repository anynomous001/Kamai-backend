import { prisma } from '../../shared/database/prisma.js';
import type { Order } from '@prisma/client';

export interface DashboardSummary {
  todayDeliveries: number;
  activeOrders: number;
  outstandingBalance: number;
  totalRevenue: number;
  todayOrders: Order[];
}

export async function getDashboardSummary(bakerId: string): Promise<DashboardSummary> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  // Run all queries concurrently using Prisma's transaction API
  // or Promise.all. Promise.all is preferred here because these are independent read-only queries.
  
  const [
    todayDeliveriesCount,
    activeOrdersCount,
    outstandingBalanceAggr,
    totalRevenueAggr,
    todayOrdersList,
  ] = await Promise.all([
    // 1. Today's Deliveries (status != 'CANCELLED')
    prisma.order.count({
      where: {
        bakerId,
        deliveryDate: {
          gte: startOfToday,
          lte: endOfToday,
        },
        status: {
          not: 'CANCELLED',
        },
      },
    }),

    // 2. Active Orders ('PENDING', 'CONFIRMED', 'IN_PROGRESS', 'READY')
    prisma.order.count({
      where: {
        bakerId,
        status: {
          in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'READY'],
        },
      },
    }),

    // 3. Outstanding Balance (sum of balanceDue > 0)
    prisma.order.aggregate({
      _sum: {
        balanceDue: true,
      },
      where: {
        bakerId,
        balanceDue: {
          gt: 0,
        },
      },
    }),

    // 4. Total Revenue (sum of totalPrice)
    prisma.order.aggregate({
      _sum: {
        totalPrice: true,
      },
      where: {
        bakerId,
      },
    }),

    // 5. Today's Orders list (excluding cancelled, sorted by delivery time)
    prisma.order.findMany({
      where: {
        bakerId,
        deliveryDate: {
          gte: startOfToday,
          lte: endOfToday,
        },
        status: {
          not: 'CANCELLED',
        },
      },
      orderBy: {
        deliveryDate: 'asc',
      },
    }),
  ]);

  return {
    todayDeliveries: todayDeliveriesCount,
    activeOrders: activeOrdersCount,
    outstandingBalance: outstandingBalanceAggr._sum.balanceDue ?? 0,
    totalRevenue: totalRevenueAggr._sum.totalPrice ?? 0,
    todayOrders: todayOrdersList,
  };
}

/**
 * Parses YYYY-MM and returns UTC start and end dates for the month
 */
function getMonthBounds(monthStr: string) {
  const [year, month] = monthStr.split('-').map(Number);
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { startDate, endDate };
}

/**
 * Parses YYYY-MM-DD and returns UTC start (Monday) and end (Sunday) for the week
 */
function getWeekBounds(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const targetDate = new Date(Date.UTC(year, month - 1, day));
  
  // getUTCDay() returns 0 for Sunday, 1 for Monday, etc.
  const dayOfWeek = targetDate.getUTCDay();
  // We want Monday (1) to be start of week, Sunday (0) to be end.
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  const startDate = new Date(targetDate);
  startDate.setUTCDate(targetDate.getUTCDate() + diffToMonday);
  startDate.setUTCHours(0, 0, 0, 0);
  
  const endDate = new Date(startDate);
  endDate.setUTCDate(startDate.getUTCDate() + 6);
  endDate.setUTCHours(23, 59, 59, 999);
  
  return { startDate, endDate };
}

export async function getCalendar(bakerId: string, query: import('./dashboard.schemas.js').GetCalendarQuery) {
  const { view, month, date } = query;
  
  let startDate: Date;
  let endDate: Date;

  if (view === 'week' && date) {
    const bounds = getWeekBounds(date);
    startDate = bounds.startDate;
    endDate = bounds.endDate;
  } else if (month) {
    const bounds = getMonthBounds(month);
    startDate = bounds.startDate;
    endDate = bounds.endDate;
  } else {
    // Default to current month UTC
    const now = new Date();
    const bounds = getMonthBounds(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`);
    startDate = bounds.startDate;
    endDate = bounds.endDate;
  }

  // Generate an array of all dates in the range
  const daysArray: any[] = [];
  let current = new Date(startDate);
  current.setUTCHours(0,0,0,0);
  
  while (current <= endDate) {
    const dateKey = current.toISOString().split('T')[0];
    daysArray.push({
      date: dateKey,
      totalOrders: 0,
      pending: 0,
      confirmed: 0,
      inProgress: 0,
      ready: 0,
      delivered: 0,
      outstandingBalance: 0,
    });
    current.setUTCDate(current.getUTCDate() + 1);
  }

  const daysMap = new Map(daysArray.map((d) => [d.date, d]));

  // Fetch active orders within this date range
  const activeOrders = await prisma.order.findMany({
    where: {
      bakerId,
      deliveryDate: {
        gte: startDate,
        lte: endDate,
      },
      status: { not: 'CANCELLED' },
      deletedAt: null,
    },
    select: {
      deliveryDate: true,
      status: true,
      balanceDue: true,
    },
  });

  // Aggregate in memory
  for (const order of activeOrders) {
    const dateKey = order.deliveryDate.toISOString().split('T')[0];
    const day = daysMap.get(dateKey);
    if (!day) continue; // Should not happen given the range, but safe guard

    day.totalOrders++;
    
    if (order.status === 'PENDING') day.pending++;
    else if (order.status === 'CONFIRMED') day.confirmed++;
    else if (order.status === 'IN_PROGRESS') day.inProgress++;
    else if (order.status === 'READY') day.ready++;
    else if (order.status === 'DELIVERED') day.delivered++;

    if (order.balanceDue > 0) {
      day.outstandingBalance += order.balanceDue;
    }
  }

  return {
    view,
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
    days: Array.from(daysMap.values()),
  };
}
