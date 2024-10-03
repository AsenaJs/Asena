// Create corn parser class

export interface CronField {
  value: string;
  description: string;
}

export interface CronParsed {
  seconds: CronField;
  minutes: CronField;
  hours: CronField;
  daysOfMonth: CronField;
  months: CronField;
  daysOfWeek: CronField;
}

export const parseCron = (cronString: string): CronParsed => {
  const cronParts = cronString.trim().split(/\s+/);

  if (cronParts.length < 5 || cronParts.length > 6) {
    throw new Error('Invalid cron string. It must have 5 or 6 fields.');
  }

  const [seconds, minutes, hours, daysOfMonth, months, daysOfWeek] =
    cronParts.length === 5 ? ['0', ...cronParts] : cronParts;

  return {
    seconds: { value: seconds, description: `Seconds: ${seconds}` },
    minutes: { value: minutes, description: `Minutes: ${minutes}` },
    hours: { value: hours, description: `Hours: ${hours}` },
    daysOfMonth: { value: daysOfMonth, description: `Days of Month: ${daysOfMonth}` },
    months: { value: months, description: `Months: ${months}` },
    daysOfWeek: { value: daysOfWeek, description: `Days of Week: ${daysOfWeek}` },
  };
};
