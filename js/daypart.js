export function daypart(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 6 && hour < 15) return { key: "mañana", title: "Mi mañana", range: "06:00–15:00" };
  if (hour >= 15 && hour < 20) return { key: "extra", title: "Un cuidado extra", range: "15:00–20:00" };
  return { key: "noche", title: "Mi noche", range: "20:00–06:00" };
}
