import { PSBox } from "@/types/psbox";

export const mockPSBoxes: PSBox[] = [
  {
    id: "PS01",
    name: "PS01",
    status: "ON",
    todayUsageMinutes: 332,
    monthUsageMinutes: 7602,
    currentSessionStartedAt: "2026-08-21T10:32:15",
    lastActivity: "2 minutes ago",
  },
  {
    id: "PS02",
    name: "PS02",
    status: "OFF",
    todayUsageMinutes: 225,
    monthUsageMinutes: 6495,
    lastActivity: "18 minutes ago",
  },
  {
    id: "PS03",
    name: "PS03",
    status: "ON",
    todayUsageMinutes: 432,
    monthUsageMinutes: 8525,
    currentSessionStartedAt: "2026-08-21T08:45:12",
    lastActivity: "1 minute ago",
  },
  {
    id: "PS04",
    name: "PS04",
    status: "OFF",
    todayUsageMinutes: 138,
    monthUsageMinutes: 5852,
    lastActivity: "42 minutes ago",
  },
  {
    id: "PS05",
    name: "PS05",
    status: "ON",
    todayUsageMinutes: 296,
    monthUsageMinutes: 7160,
    currentSessionStartedAt: "2026-08-21T11:20:30",
    lastActivity: "3 minutes ago",
  },
];
