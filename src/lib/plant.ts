import { RATED_PER_HOUR, ShiftCode } from './config';

/**
 * The plant roster, exactly as the /design export defines it.
 * The ORDER of this array matters: the deterministic simulator seeds its
 * random stream from the machine index, so changing the order changes the data.
 */
const ROSTER: [string, string, string, string, string, string][] = [
  ['M-01', 'A', 'CNC Lathe', 'Lakshmi Devi', 'Ajay Singh', 'Suresh Gowda'],
  ['M-02', 'A', 'VMC', 'Nagaraj H', 'Pradeep Kumar', 'Manjunath R'],
  ['M-03', 'A', 'CNC Lathe', 'Yogesh B', 'Syed Ahmed', 'Imran Pasha'],
  ['M-04', 'A', 'VMC', 'Rekha M', 'Vijay Kumar', 'Venkatesh B'],
  ['M-12', 'A', 'CNC Lathe', 'Chandrashekar R', 'Sandeep Rao', 'Santosh Patil'],
  ['M-06', 'B', 'VMC', 'Girish T', 'Mallikarjun S', 'Prakash Naik'],
  ['M-07', 'B', 'CNC Lathe', 'Ashok Kumar', 'Keshav Murthy', 'Ravi Kumar'],
  ['M-08', 'B', 'CNC Lathe', 'Ramesh Pai', 'Arun Prasad', 'Anil Yadav'],
  ['M-09', 'B', 'VMC', 'Deepa Shetty', 'Sudha R', 'Mohammed Irfan'],
  ['M-18', 'B', 'CNC Lathe', 'Vinod Kulkarni', 'Jagadish K', 'Arjun Rao'],
  ['M-10', 'C', 'Injection Moulder', 'Harish Gowda', 'Manoj Pandey', 'Kiran Hegde'],
  ['M-11', 'C', 'Injection Moulder', 'Kavitha S', 'Nandini P', 'Rajesh Kamath'],
  ['M-13', 'C', 'Injection Moulder', 'Sunil Joshi', 'Sathish Kumar', 'Naveen Reddy'],
  ['M-14', 'C', 'Injection Moulder', 'Fathima Banu', 'Abdul Rahim', 'Shivakumar M'],
  ['M-15', 'C', 'Injection Moulder', 'Meena Iyer', 'Hemanth G', 'Ganesh Murthy'],
  ['M-05', 'D', 'Flow Wrapper', 'Sangeetha V', 'Thimmaiah K', 'Dinesh Kumar'],
  ['M-16', 'D', 'Cartoner', 'Shobha Patil', 'Darshan R', 'Basavaraj K'],
  ['M-17', 'D', 'Shrink Wrapper', 'Priya Nair', 'Ramya K', 'Raghu N'],
  ['M-19', 'D', 'Case Packer', 'Bhavya N', 'Usha Rani', 'Mahesh Babu'],
  ['M-20', 'D', 'Labeller', 'Anitha Rao', 'Sanjay Kulkarni', 'Lokesh S'],
];

export type Machine = {
  id: string;
  line: string;
  type: string;
  ratedPerHour: number;
  /** Operator name by shift. */
  ops: Record<ShiftCode, string>;
  /** Index in the roster. Seeds the simulator's random stream. */
  i: number;
};

export const LINES: { key: string; name: string; desc: string }[] = [
  { key: 'A', name: 'Line A', desc: 'CNC machining' },
  { key: 'B', name: 'Line B', desc: 'CNC machining' },
  { key: 'C', name: 'Line C', desc: 'Injection moulding' },
  { key: 'D', name: 'Line D', desc: 'Packaging' },
];

export const MACHINES: Machine[] = ROSTER.map((r, i) => ({
  id: r[0],
  line: r[1],
  type: r[2],
  ratedPerHour: RATED_PER_HOUR,
  ops: { A: r[3], B: r[4], C: r[5] },
  i,
}));

export const MACHINE_INDEX: Record<string, number> = {};
MACHINES.forEach((m, i) => {
  MACHINE_INDEX[m.id] = i;
});

export const LINE_C_IDS = MACHINES.filter((m) => m.line === 'C').map((m) => m.id);

/** Two-letter initials, used for the operator avatars. */
export function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** The role shown on the Operators page, as the design derives it. */
export function operatorRole(machineIndex: number, shift: ShiftCode): string {
  const m = MACHINES[machineIndex];
  if (m.line === 'C') return 'Setter-operator';
  return (machineIndex + ['A', 'B', 'C'].indexOf(shift)) % 4 === 0
    ? 'Senior operator'
    : 'Machine operator';
}

export function operatorId(machineId: string, shift: ShiftCode): string {
  return `OP-${machineId}-${shift}`;
}
