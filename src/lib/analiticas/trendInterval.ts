import { eachDayOfInterval, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";

export function getAnaliticasTrendDays(dateRange: DateRange | undefined) {
  if (dateRange?.from && dateRange?.to) {
    const end = dateRange.to >= dateRange.from ? dateRange.to : dateRange.from;
    return eachDayOfInterval({ start: dateRange.from, end });
  }
  return eachDayOfInterval({ start: subDays(new Date(), 13), end: new Date() });
}
