const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function CalendarWidget({
  year,
  month, // 0-11
  today,
  appointmentCountByDay, // dia do mês -> quantidade
  todayAppointmentsCount,
}: {
  year: number;
  month: number;
  today: number;
  appointmentCountByDay: Record<number, number>;
  todayAppointmentsCount: number;
}) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          {MONTH_NAMES[month]} / {year}
        </h2>
        <span className="text-xs text-muted">
          {todayAppointmentsCount === 0
            ? "Sem agendamentos hoje"
            : `${todayAppointmentsCount} agendamento${todayAppointmentsCount > 1 ? "s" : ""} hoje`}
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((d, di) => {
              if (d === null) return <div key={di} />;
              const isToday = d === today;
              const count = appointmentCountByDay[d] ?? 0;
              return (
                <div
                  key={di}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm ${
                    isToday ? "bg-accent text-accent-foreground font-semibold" : "bg-background"
                  }`}
                >
                  {d}
                  {count > 0 ? (
                    <span
                      aria-hidden
                      className={`absolute bottom-1 h-1.5 w-1.5 rounded-full ${
                        isToday ? "bg-accent-foreground" : "bg-accent"
                      }`}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
