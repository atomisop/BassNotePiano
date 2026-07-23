const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

export function StreakDots({ currentStreak }: { currentStreak: number }) {
  const filled = Math.min(currentStreak, 7);
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return { letter: DAY_LETTERS[d.getDay()], isToday: i === 6, isFilled: i >= 7 - filled };
  });

  return (
    <div className="mt-2 flex items-center gap-1.5">
      {days.map((day, i) => (
        <span
          key={i}
          title={day.isToday ? "Today" : undefined}
          className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold transition ${
            day.isFilled
              ? "bg-amber-400 text-slate-950"
              : `border text-slate-600 ${day.isToday ? "border-amber-400/50" : "border-white/10"}`
          }`}
        >
          {day.letter}
        </span>
      ))}
    </div>
  );
}
