export function validIsoDate(value) {
  if (!validCalendarDate(value)) return "";
  return value <= todayIsoUtc() ? value : "";
}

export function validCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const year=Number(value.slice(0,4));
  const date = new Date(`${value}T00:00:00.000Z`);
  if (year<1900||year>2100||Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) return "";
  return value;
}

export function validTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "";
}

function todayIsoUtc() {
  return new Date().toISOString().slice(0, 10);
}
