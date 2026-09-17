const { Op } = require('sequelize');
const { Reservation, RestaurantNotification } = require('../models/restaurant');

async function ensureReservationReminders(now = new Date()) {
  const horizon = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const reservations = await Reservation.findAll({
    where: { status: { [Op.in]: ['BOOKED', 'CONFIRMED'] }, startsAt: { [Op.between]: [now, horizon] } },
    limit: 1000
  });
  let created = 0;
  for (const reservation of reservations) {
    const [, wasCreated] = await RestaurantNotification.findOrCreate({
      where: { tenantId: reservation.tenantId, dedupeKey: `reservation-reminder:${reservation.id}` },
      defaults: {
        tenantId: reservation.tenantId,
        branchId: reservation.branchId,
        role: 'BRANCH_MANAGER',
        type: 'RESERVATION_DUE',
        title: `Reservation due: ${reservation.guestName}`,
        message: `${reservation.partySize} guests at ${new Date(reservation.startsAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.`,
        entityType: 'Reservation',
        entityId: reservation.id,
        dedupeKey: `reservation-reminder:${reservation.id}`
      }
    });
    if (wasCreated) created += 1;
  }
  return { scanned: reservations.length, created };
}

module.exports = { ensureReservationReminders };
