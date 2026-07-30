import { prisma } from '../../shared/database/prisma.js';
import { getISTCalendarDate } from '../../shared/utils/ist-date.util.js';

export interface DashboardOrderSummary {
  id: string;
  bakerId: string;
  orderNumber: string;
  deliveryDate: Date;
  status: string;
  totalPrice: number;
  balanceDue: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardUpcomingOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  cakeCategory: string;
  deliveryDate: Date;
  deliveryTime: string | null;
  status: string;
  totalPrice: number;
  balanceDue: number;
}

export interface DashboardSummary {
  todayDeliveries: number;
  activeOrders: number;
  outstandingBalance: number;
  totalRevenue: number;
  todayOrders: DashboardOrderSummary[];
  // Per the "Upcoming Lookahead" feature doc: no fixed lookahead window.
  // Shows the rest of the current month's (non-today) upcoming orders; if
  // none remain this month, falls forward to the nearest future month that
  // actually has at least one non-cancelled order rather than assuming
  // "next calendar month" is populated. `month` is null when there is no
  // upcoming order at all.
  upcomingOrders: {
    month: string | null;
    orders: DashboardUpcomingOrder[];
  };
}

const ACTIVE_ORDER_STATUSES = ['Pending', 'Confirmed', 'In Progress', 'Ready'];

export async function getDashboardSummary(bakerId: string): Promise<DashboardSummary> {
  // "Today" computed in IST (Asia/Kolkata) consistently with getCalendar
  // below — the old implementation used server-local time here but UTC in
  // the calendar endpoint, so the same order could count as "today" in one
  // view and not the other. Fixed to IST everywhere (bakers operate in
  // India; IST is the specified timezone, not UTC).
  const { year: todayYear, month: todayMonth, day: todayDay } = getISTCalendarDate();
  const startOfToday = new Date(Date.UTC(todayYear, todayMonth, todayDay));
  const endOfToday = new Date(Date.UTC(todayYear, todayMonth, todayDay, 23, 59, 59, 999));

  const endOfCurrentMonth = new Date(Date.UTC(todayYear, todayMonth + 1, 0, 23, 59, 59, 999));

  const [
    todayDeliveriesCount,
    activeOrdersCount,
    outstandingBalanceAggr,
    totalRevenueAggr,
    todayOrdersList,
    restOfMonthOrders,
  ] = await Promise.all([
    prisma.order.count({
      where: {
        bakerId,
        deliveryDate: { gte: startOfToday, lte: endOfToday },
        orderStatus: { not: 'Cancelled' },
      },
    }),

    prisma.order.count({
      where: { bakerId, orderStatus: { in: ACTIVE_ORDER_STATUSES } },
    }),

    // Outstanding balance / total revenue now both exclude Cancelled orders,
    // matching the exclusion rule already used everywhere else (customer
    // LTV, calendar view) — the old dashboard summary was the one place
    // that counted a cancelled order's balance/price, which was inconsistent.
    prisma.order.aggregate({
      _sum: { balanceDue: true },
      where: { bakerId, balanceDue: { gt: 0 }, orderStatus: { not: 'Cancelled' } },
    }),

    prisma.order.aggregate({
      _sum: { totalPrice: true },
      where: { bakerId, orderStatus: { not: 'Cancelled' } },
    }),

    prisma.order.findMany({
      where: {
        bakerId,
        deliveryDate: { gte: startOfToday, lte: endOfToday },
        orderStatus: { not: 'Cancelled' },
      },
      orderBy: { deliveryDate: 'asc' },
    }),

    // "Upcoming Lookahead": rest of the current month, excluding today
    // (today's own orders are already covered by todayOrders above).
    prisma.order.findMany({
      where: {
        bakerId,
        deliveryDate: { gt: endOfToday, lte: endOfCurrentMonth },
        orderStatus: { not: 'Cancelled' },
      },
      orderBy: { deliveryDate: 'asc' },
      include: { customer: { select: { name: true } } },
    }),
  ]);

  let upcomingMonth: string | null = `${todayYear}-${String(todayMonth + 1).padStart(2, '0')}`;
  let upcomingOrdersRaw = restOfMonthOrders;

  if (upcomingOrdersRaw.length === 0) {
    // Nothing left this month — find the nearest future month that
    // actually has a non-cancelled order, rather than assuming next
    // calendar month is populated (a baker could have a gap of several
    // months between bookings).
    const nextOrder = await prisma.order.findFirst({
      where: {
        bakerId,
        deliveryDate: { gt: endOfCurrentMonth },
        orderStatus: { not: 'Cancelled' },
      },
      orderBy: { deliveryDate: 'asc' },
    });

    if (nextOrder) {
      const nextYear = nextOrder.deliveryDate.getUTCFullYear();
      const nextMonthIdx = nextOrder.deliveryDate.getUTCMonth();
      const monthStart = new Date(Date.UTC(nextYear, nextMonthIdx, 1));
      const monthEnd = new Date(Date.UTC(nextYear, nextMonthIdx + 1, 0, 23, 59, 59, 999));
      upcomingMonth = `${nextYear}-${String(nextMonthIdx + 1).padStart(2, '0')}`;

      upcomingOrdersRaw = await prisma.order.findMany({
        where: {
          bakerId,
          deliveryDate: { gte: monthStart, lte: monthEnd },
          orderStatus: { not: 'Cancelled' },
        },
        orderBy: { deliveryDate: 'asc' },
        include: { customer: { select: { name: true } } },
      });
    } else {
      upcomingMonth = null;
    }
  }

  return {
    todayDeliveries: todayDeliveriesCount,
    activeOrders: activeOrdersCount,
    outstandingBalance: outstandingBalanceAggr._sum.balanceDue ? Number(outstandingBalanceAggr._sum.balanceDue) : 0,
    totalRevenue: totalRevenueAggr._sum.totalPrice ? Number(totalRevenueAggr._sum.totalPrice) : 0,
    todayOrders: todayOrdersList.map((order) => ({
      id: order.id,
      bakerId: order.bakerId,
      orderNumber: order.displayId,
      deliveryDate: order.deliveryDate,
      status: order.orderStatus,
      totalPrice: Number(order.totalPrice),
      balanceDue: Number(order.balanceDue),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    })),
    upcomingOrders: {
      month: upcomingMonth,
      orders: upcomingOrdersRaw.map((order) => ({
        id: order.id,
        orderNumber: order.displayId,
        customerName: order.customer.name,
        cakeCategory: order.cakeCategory,
        deliveryDate: order.deliveryDate,
        deliveryTime: order.deliveryTime ? order.deliveryTime.toISOString().slice(11, 16) : null,
        status: order.orderStatus,
        totalPrice: Number(order.totalPrice),
        balanceDue: Number(order.balanceDue),
      })),
    },
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

  const dayOfWeek = targetDate.getUTCDay();
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
    const { year, month } = getISTCalendarDate();
    const bounds = getMonthBounds(`${year}-${String(month + 1).padStart(2, '0')}`);
    startDate = bounds.startDate;
    endDate = bounds.endDate;
  }

  const daysArray: any[] = [];
  const current = new Date(startDate);
  current.setUTCHours(0, 0, 0, 0);

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

  const activeOrders = await prisma.order.findMany({
    where: {
      bakerId,
      deliveryDate: { gte: startDate, lte: endDate },
      orderStatus: { not: 'Cancelled' },
    },
    select: { deliveryDate: true, orderStatus: true, balanceDue: true },
  });

  for (const order of activeOrders) {
    const dateKey = order.deliveryDate.toISOString().split('T')[0];
    const day = daysMap.get(dateKey);
    if (!day) continue;

    day.totalOrders++;

    if (order.orderStatus === 'Pending') day.pending++;
    else if (order.orderStatus === 'Confirmed') day.confirmed++;
    else if (order.orderStatus === 'In Progress') day.inProgress++;
    else if (order.orderStatus === 'Ready') day.ready++;
    else if (order.orderStatus === 'Delivered') day.delivered++;

    const balanceDue = Number(order.balanceDue);
    if (balanceDue > 0) {
      day.outstandingBalance += balanceDue;
    }
  }

  return {
    view,
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
    days: Array.from(daysMap.values()),
  };
}
