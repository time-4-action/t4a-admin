// Turns a standard 5-field cron expression into plain, non-technical English.
// Covers the shapes the portal actually uses (minute/hour steps, daily, weekly,
// monthly, lists/ranges of weekdays). Anything it can't confidently read falls
// back to the raw expression so the value is never silently wrong.

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// "09:26" from numeric hour + minute fields.
function timeOfDay(hour: string, minute: string): string {
  return `${pad(Number(hour))}:${pad(Number(minute))}`;
}

const isInt = (f: string) => /^\d+$/.test(f);
const stepOf = (f: string): number | null => {
  const m = /^\*\/(\d+)$/.exec(f);
  return m ? Number(m[1]) : null;
};

// Reads a weekday field (single, list, or range) into readable text, or null if unsupported.
function weekdayText(field: string): string | null {
  const norm = (n: number) => WEEKDAYS[n === 7 ? 0 : n];

  const range = /^(\d)-(\d)$/.exec(field);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a === 1 && b === 5) return "every weekday (Mon–Fri)";
    return `${norm(a)} to ${norm(b)}`;
  }

  if (field.includes(",")) {
    const days = field.split(",").map((d) => d.trim());
    if (!days.every(isInt)) return null;
    const names = days.map((d) => norm(Number(d)));
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }

  if (isInt(field)) return norm(Number(field));
  return null;
}

export function humanizeCron(expr?: string | null): string {
  if (!expr || !expr.trim()) return "Not scheduled";
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, dom, mon, dow] = parts;

  try {
    const everyDate = dom === "*" && mon === "*";
    const minStep = stepOf(min);
    const hourStep = stepOf(hour);

    // Every minute / every N minutes.
    if (min === "*" && hour === "*" && everyDate && dow === "*") return "Every minute";
    if (minStep && hour === "*" && everyDate && dow === "*") {
      return minStep === 1 ? "Every minute" : `Every ${minStep} minutes`;
    }

    // Hourly variants (minute fixed, hour wildcard).
    if (isInt(min) && hour === "*" && everyDate && dow === "*") {
      return Number(min) === 0 ? "Every hour, on the hour" : `Every hour at :${pad(Number(min))}`;
    }

    // Every N hours.
    if (isInt(min) && hourStep && everyDate && dow === "*") {
      const at = Number(min) === 0 ? "" : ` at :${pad(Number(min))}`;
      return hourStep === 1 ? `Every hour${at}` : `Every ${hourStep} hours${at}`;
    }

    // Fixed time of day.
    if (isInt(min) && isInt(hour)) {
      const time = timeOfDay(hour, min);

      // Weekly (specific weekday[s]).
      if (everyDate && dow !== "*") {
        const wd = weekdayText(dow);
        if (wd) {
          return wd.startsWith("every weekday")
            ? `Every weekday (Mon–Fri) at ${time}`
            : `Every ${wd} at ${time}`;
        }
      }

      // Daily.
      if (everyDate && dow === "*") return `Every day at ${time}`;

      // Monthly on a day-of-month.
      if (isInt(dom) && mon === "*" && dow === "*") {
        return `Monthly on the ${ordinal(Number(dom))} at ${time}`;
      }

      // Specific month + day.
      if (isInt(dom) && isInt(mon) && dow === "*") {
        return `On ${MONTHS[Number(mon) - 1]} ${ordinal(Number(dom))} at ${time}`;
      }
    }

    return expr;
  } catch {
    return expr;
  }
}
