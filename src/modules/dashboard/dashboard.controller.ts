import type { FastifyRequest, FastifyReply } from 'fastify';

import { InternalServerError } from '../../shared/errors/index.js';

import {
  getDashboardSummary,
  getCalendar as getCalendarService,
  getCalendarMonthsOverview as getCalendarMonthsOverviewService,
} from './dashboard.service.js';
import { getISTCalendarDate } from '../../shared/utils/ist-date.util.js';

export async function loadSummaryDashboard(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;

  if (!bakerId) {
    // This should never happen if the route is protected by the authenticate middleware
    throw new InternalServerError('Baker context is missing in authenticated request');
  }

  const summary = await getDashboardSummary(bakerId);

  return reply.code(200).send({
    success: true,
    data: {
      todayDeliveries: summary.todayDeliveries,
      activeOrders: summary.activeOrders,
      outstandingBalance: summary.outstandingBalance,
      totalRevenue: summary.totalRevenue,
      todayOrders: summary.todayOrders.map((order) => ({
        id: order.id,
        bakerId: order.bakerId,
        orderNumber: order.orderNumber,
        deliveryDate: order.deliveryDate.toISOString(),
        status: order.status,
        totalPrice: order.totalPrice,
        balanceDue: order.balanceDue,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      })),
      upcomingOrders: {
        month: summary.upcomingOrders.month,
        orders: summary.upcomingOrders.orders.map((order) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          cakeCategory: order.cakeCategory,
          deliveryDate: order.deliveryDate.toISOString().slice(0, 10),
          deliveryTime: order.deliveryTime,
          status: order.status,
          totalPrice: order.totalPrice,
          balanceDue: order.balanceDue,
        })),
      },
      monthlyFinancials: summary.monthlyFinancials,
    },
  });
}

export async function getCalendar(
  req: FastifyRequest<{ Querystring: import('./dashboard.schemas.js').GetCalendarQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;

  if (!bakerId) {
    throw new InternalServerError('Baker context is missing in authenticated request');
  }

  const query = req.query;
  const result = await getCalendarService(bakerId, query);

  return reply.code(200).send({
    success: true,
    data: result,
  });
}

export async function getCalendarMonthsOverview(
  req: FastifyRequest<{ Querystring: import('./dashboard.schemas.js').GetCalendarMonthsOverviewQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;

  if (!bakerId) {
    throw new InternalServerError('Baker context is missing in authenticated request');
  }

  const centerMonth =
    req.query.month ??
    (() => {
      const { year, month } = getISTCalendarDate();
      return `${year}-${String(month + 1).padStart(2, '0')}`;
    })();

  const months = await getCalendarMonthsOverviewService(bakerId, centerMonth);

  return reply.code(200).send({
    success: true,
    data: { months },
  });
}
