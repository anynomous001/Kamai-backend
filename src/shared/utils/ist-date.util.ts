// Bakers operate in India; "today"/"this month" throughout dashboard and
// calendar views must be computed against IST wall-clock time, not UTC or
// server-local time — explicitly specified, UTC was explicitly ruled out.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function getISTCalendarDate(now: Date = new Date()): { year: number; month: number; day: number } {
  const istShifted = new Date(now.getTime() + IST_OFFSET_MS);
  return {
    year: istShifted.getUTCFullYear(),
    month: istShifted.getUTCMonth(),
    day: istShifted.getUTCDate(),
  };
}
