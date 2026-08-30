export type PSBoxStatus = "ON" | "OFF" | "OFFLINE";

export type PSBox = {
  id: string;
  name: string;
  status: PSBoxStatus;
  todayUsageMinutes: number;
  monthUsageMinutes: number;
  currentSessionStartedAt?: string;
  lastActivity: string;
};
