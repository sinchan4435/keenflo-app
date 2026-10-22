import { ShiftCode } from './config';

export type LineRow = {
  id: string;
  name: string;
  process_type: string;
};

export type MachineRow = {
  id: string;
  line_id: string;
  type: string;
  rated_per_hour: number;
};

export type OperatorRow = {
  id: string;
  name: string;
  role: string;
  avatar_initials: string;
};

export type ShiftAssignmentRow = {
  machine_id: string;
  operator_id: string;
  shift: ShiftCode;
};

export type HourlyRow = {
  machine_id: string;
  date: string;
  shift: ShiftCode;
  hour: number;
  target: number;
  produced: number;
  rejects: number;
  stopped_min: number;
  slow_min: number;
  changeover_min: number;
  idle_min: number;
};

export type DowntimeStatus = 'open' | 'acknowledged' | 'resolved';

export type DowntimeRowDb = {
  id: string;
  machine_id: string;
  operator_id: string | null;
  date: string;
  shift: ShiftCode;
  start_at: string;
  duration_min: number;
  cause: string;
  status: DowntimeStatus;
  occurrences: number;
};

export type ActionStatus = 'todo' | 'in_progress' | 'done';

export type ActionItemRow = {
  id: string;
  machine_id: string | null;
  title: string;
  severity: string;
  rupees_per_week: number;
  evidence: string;
  likely_causes: string[];
  fix_steps: string[];
  owner_team: string;
  due_date: string | null;
  status: ActionStatus;
  resolved_at: string | null;
  machines: string[];
  who: string;
  suggested_fix: string;
  opened_on: string | null;
  started_on: string | null;
  closed_on: string | null;
  support_name: string | null;
  support_where: string | null;
  support_text: string | null;
  sort_order: number;
};

/** Everything the app loads from Supabase once, at start-up. */
export type PlantData = {
  lines: LineRow[];
  machines: MachineRow[];
  operators: OperatorRow[];
  assignments: ShiftAssignmentRow[];
  hourly: HourlyRow[];
  downtime: DowntimeRowDb[];
  actions: ActionItemRow[];
  /** The most recent date in hourly_output. The app treats this as "today". */
  today: string;
};
