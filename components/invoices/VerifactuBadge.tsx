export function VerifactuBadge({
  status,
}: {
  status:
    | "sin_sello"
    | "sellada"
    | "pendiente_remision"
    | "remitida"
    | "rechazada"
    | "anulada";
}) {
  const styles: Record<string, string> = {
    sin_sello: "bg-line/40 text-ink-muted",
    sellada: "bg-accent-soft text-accent",
    pendiente_remision: "bg-warning/15 text-warning",
    remitida: "bg-success/15 text-success",
    rechazada: "bg-danger/15 text-danger",
    anulada: "bg-line/40 text-ink-muted",
  };
  const labels: Record<string, string> = {
    sin_sello: "Veri*Factu: sin sello",
    sellada: "Veri*Factu: sellada",
    pendiente_remision: "Veri*Factu: pendiente remisión",
    remitida: "Veri*Factu: remitida",
    rechazada: "Veri*Factu: rechazada",
    anulada: "Veri*Factu: anulada",
  };
  return (
    <span className={`badge ${styles[status] ?? styles.sin_sello}`}>
      {labels[status] ?? status}
    </span>
  );
}
