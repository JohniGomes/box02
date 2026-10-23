"use client";

/** "Último KM registrado deste veículo: X [usar]" — sugestão, nunca valor fixo. */
export function LastMileageHint({
  lastMileage,
  current,
  onUse,
}: {
  lastMileage: number | null | undefined;
  current: string;
  onUse: (value: string) => void;
}) {
  if (lastMileage === null || lastMileage === undefined) return null;
  const text = String(lastMileage);
  return (
    <p className="text-xs text-muted">
      Último KM registrado deste veículo: <strong>{lastMileage.toLocaleString("pt-BR")} km</strong>
      {current.trim() !== text ? (
        <>
          {" "}
          <button type="button" onClick={() => onUse(text)} className="font-semibold text-accent underline">
            usar
          </button>
        </>
      ) : null}
      . O KM do painel costuma ser maior.
    </p>
  );
}
