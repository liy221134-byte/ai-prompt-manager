export const PROMPT_TRASH_RETENTION_DAYS = 30;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function parseDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("日期格式无效。");
  }

  return date;
}

export function getTrashExpiresAt(deletedAt: string) {
  const expiresAt = new Date(
    parseDate(deletedAt).getTime() +
      PROMPT_TRASH_RETENTION_DAYS * DAY_IN_MILLISECONDS,
  );

  return expiresAt.toISOString();
}

export function getRemainingTrashDays(deletedAt: string, now = new Date()) {
  const remainingMilliseconds =
    parseDate(getTrashExpiresAt(deletedAt)).getTime() - now.getTime();

  return Math.max(0, Math.ceil(remainingMilliseconds / DAY_IN_MILLISECONDS));
}

export function isTrashExpired(deletedAt: string, now = new Date()) {
  return parseDate(getTrashExpiresAt(deletedAt)).getTime() <= now.getTime();
}
