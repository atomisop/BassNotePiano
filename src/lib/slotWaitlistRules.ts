export const MAX_WAITLIST_ENTRIES = 5;
/** After telling one person about a freed time, wait this long before offering it to the next in line. */
export const WAITLIST_HOLD_HOURS = 24;
export const WAITLIST_KEEP_DAYS = 90;
export const slotKey = (scheduleId: string, chunkIndex: number) => `${scheduleId}:${chunkIndex}`;
