import { EDITORIAL_NOTES, READING_TASKS } from "@aihot/industry/reading-guide";
import { isSupplementaryResearch } from "@aihot/industry/reader-curation";
import type { GeoDailyItem } from "../types.ts";
export { READING_TASKS, GEO_GLOSSARY } from "@aihot/industry/reading-guide";
export function itemTasks(
  item: Pick<GeoDailyItem, "id" | "title" | "summary" | "brief">,
) {
  const text = [item.title, item.summary, item.brief?.conclusion].join(" ");
  const selected = EDITORIAL_NOTES[item.id]?.task;
  return READING_TASKS.filter(
    (task) => task.id === selected || task.pattern.test(text),
  );
}
export function readingNote(item: GeoDailyItem) {
  const curated = EDITORIAL_NOTES[item.id];
  const task =
    READING_TASKS.find((t) => t.id === curated?.task) ?? itemTasks(item)[0];
  return {
    task,
    why:
      curated?.why ??
      (task
        ? `帮助判断：${task.name}。可在站内查看来源结论、证据和限制。`
        : "已整理来源结论与适用范围，可先判断是否与你的工作相关。"),
    curated: !!curated,
  };
}
export const isCompleteReading = (item: GeoDailyItem) =>
  item.brief?.coverage === "full-article" && !item.brief.automated;
export function chooseReading(items: GeoDailyItem[]) {
  const order = Object.keys(EDITORIAL_NOTES);
  return [
    ...new Map(
      items
        .filter((i) => isCompleteReading(i) && !isSupplementaryResearch(i.url))
        .map((i) => [i.id, i]),
    ).values(),
  ].sort((a, b) => {
    const ai = order.indexOf(a.id),
      bi = order.indexOf(b.id);
    return (
      (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) ||
      Date.parse(b.publishedAt ?? b.brief!.updatedAt) -
        Date.parse(a.publishedAt ?? a.brief!.updatedAt) ||
      a.id.localeCompare(b.id)
    );
  });
}
