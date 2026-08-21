import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

export type PdfParty = {
  name: string;
  nif: string;
  countryCode?: string | null;
  addressStreet: string;
  addressCity: string;
  addressProvince: string;
  addressZip: string;
  addressCountry: string;
  email?: string | null;
  phone?: string | null;
};

export type PdfLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  discountPct: number;
  lineSubtotal: number;
};

export type InvoicePdfProps = {
  title: string;
  number: string;
  issueDate: string;
  dueDate?: string | null;
  status?: string;
  issuer: PdfParty;
  client: PdfParty;
  lines: PdfLine[];
  subtotal: number;
  vatAmount: number;
  irpfRate?: number;
  irpfAmount?: number;
  total: number;
  notes?: string | null;
  paymentMethod?: string | null;
  bankIban?: string | null;
  bankName?: string | null;
  bizumPhone?: string | null;
  /** Si false, no muestra forma de pago (p. ej. presupuestos). */
  showPayment?: boolean;
  logoUrl?: string | null;
  brandName?: string | null;
  specialDiscountPct?: number;
  specialDiscountAmount?: number;
  earlyPaymentDiscountPct?: number;
  earlyPaymentDiscountAmount?: number;
  /** Veri*Factu: data URL PNG del QR tributario (solo facturas). */
  verifactuQrDataUrl?: string | null;
  verifactuHash?: string | null;
  verifactuSentAt?: Date | string | null;
};

/**
 * Paleta alineada con la UX del panel (violeta + neutros fríos).
 * En @react-pdf el overflow:hidden NO recorta hijos: el radio debe
 * aplicarse también en las esquinas de los hijos con fondo.
 */
const INK = "#1A1528";
const MUTED = "#6B6578";
const BG = "#FFFFFF";
const SURFACE = "#FFFFFF";
const SOFT = "#EFE8FF";
const SOFT_MID = "#E8E4F2";
const LINE = "#E2DEEA";
const ACCENT = "#7B2CFE";
const ACCENT_HOVER = "#6518E0";
const R = 6; // radio realista en PDF (12 se ve mal / se “corta”)

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 120,
    paddingHorizontal: 40,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: INK,
    backgroundColor: BG,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
  },
  logoWrap: { width: 150 },
  logoImg: { width: 130, height: 48, objectFit: "contain" },
  brandText: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    color: ACCENT,
    letterSpacing: 0.3,
  },
  brandSub: {
    fontSize: 7,
    color: MUTED,
    marginTop: 3,
    letterSpacing: 0.3,
  },
  issuerBlock: { maxWidth: 250, alignItems: "flex-end" },
  issuerName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    textAlign: "right",
    marginBottom: 4,
    color: INK,
  },
  issuerLine: {
    fontSize: 8,
    color: MUTED,
    textAlign: "right",
    lineHeight: 1.4,
  },

  docBarRow: {
    flexDirection: "row",
    marginBottom: 14,
    gap: 10,
  },
  docBarSpacer: { flex: 1 },
  docBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: R,
  },
  docLabel: {
    backgroundColor: ACCENT,
    minWidth: 118,
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: "center",
    alignItems: "center",
    borderTopLeftRadius: R,
    borderBottomLeftRadius: R,
  },
  docLabelText: {
    color: SURFACE,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  docNumber: {
    flex: 1,
    backgroundColor: SOFT,
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: "center",
    alignItems: "center",
    borderTopRightRadius: R,
    borderBottomRightRadius: R,
  },
  docNumberText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: INK,
    textAlign: "center",
  },

  metaRow: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 10,
    alignItems: "stretch",
  },
  metaCol: {
    flex: 1,
    justifyContent: "flex-start",
  },
  fieldBox: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: R,
    marginBottom: 8,
    backgroundColor: SURFACE,
  },
  fieldBoxLast: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: R,
    marginBottom: 0,
    backgroundColor: SURFACE,
  },
  fieldLabel: {
    backgroundColor: SOFT,
    fontSize: 7,
    color: MUTED,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.3,
    borderTopLeftRadius: R,
    borderTopRightRadius: R,
  },
  fieldValue: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 9,
    color: INK,
    borderBottomLeftRadius: R,
    borderBottomRightRadius: R,
  },
  clientBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: R,
    minHeight: 76,
    backgroundColor: SURFACE,
  },
  clientBody: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomLeftRadius: R,
    borderBottomRightRadius: R,
  },
  clientName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginBottom: 3,
    color: INK,
  },
  clientLine: { fontSize: 9, lineHeight: 1.4, color: MUTED },

  table: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: R,
    backgroundColor: SURFACE,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: SOFT,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    borderTopLeftRadius: R,
    borderTopRightRadius: R,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 8,
    minHeight: 24,
    borderBottomWidth: 1,
    borderBottomColor: SOFT_MID,
  },
  tableRowLast: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 8,
    minHeight: 24,
    borderBottomWidth: 0,
    borderBottomLeftRadius: R,
    borderBottomRightRadius: R,
  },
  th: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: MUTED,
    letterSpacing: 0.3,
  },
  colDesc: { flex: 3.2, paddingRight: 4 },
  colQty: { width: 55, textAlign: "right" },
  colPrice: { width: 70, textAlign: "right" },
  colDisc: { width: 60, textAlign: "right" },
  colTotal: { width: 70, textAlign: "right" },

  bottomRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 2,
  },
  bottomLeft: { flex: 1.15 },
  bottomRight: { width: 198 },

  totalRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: R,
    marginBottom: 6,
    backgroundColor: SURFACE,
  },
  totalLabel: {
    flex: 1,
    backgroundColor: SOFT,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    borderTopLeftRadius: R,
    borderBottomLeftRadius: R,
  },
  totalValue: {
    width: 78,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 9,
    textAlign: "right",
    color: INK,
    borderTopRightRadius: R,
    borderBottomRightRadius: R,
  },
  totalFinalLabel: {
    flex: 1,
    backgroundColor: ACCENT,
    color: SURFACE,
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    borderTopLeftRadius: R,
    borderBottomLeftRadius: R,
  },
  totalFinalValue: {
    width: 78,
    backgroundColor: ACCENT_HOVER,
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    color: SURFACE,
    borderTopRightRadius: R,
    borderBottomRightRadius: R,
  },

  dualField: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: R,
    marginBottom: 6,
    backgroundColor: SURFACE,
  },
  dualLabel: {
    width: 98,
    backgroundColor: SOFT,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    borderTopLeftRadius: R,
    borderBottomLeftRadius: R,
  },
  dualPct: {
    width: 48,
    paddingHorizontal: 4,
    paddingVertical: 6,
    fontSize: 8,
    textAlign: "right",
    borderLeftWidth: 1,
    borderLeftColor: LINE,
    color: INK,
  },
  dualAmt: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 8,
    textAlign: "right",
    borderLeftWidth: 1,
    borderLeftColor: LINE,
    color: INK,
    borderTopRightRadius: R,
    borderBottomRightRadius: R,
  },

  obsBox: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: R,
    marginTop: 2,
    minHeight: 52,
    backgroundColor: SURFACE,
  },
  obsLabel: {
    backgroundColor: SOFT,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    letterSpacing: 0.3,
    borderTopLeftRadius: R,
    borderTopRightRadius: R,
  },
  obsBody: {
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontSize: 8,
    lineHeight: 1.4,
    color: INK,
    borderBottomLeftRadius: R,
    borderBottomRightRadius: R,
  },

  footer: {
    position: "absolute",
    bottom: 18,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
    fontSize: 6.5,
    color: MUTED,
  },
  footerLegal: {
    flex: 1,
    flexDirection: "column",
    gap: 2,
    paddingRight: 8,
  },
  footerLine: {
    fontSize: 6.5,
    color: MUTED,
    lineHeight: 1.35,
  },
  footerPage: {
    fontSize: 7,
    color: MUTED,
  },
  verifactuBlock: {
    position: "absolute",
    bottom: 52,
    right: 40,
    width: 95,
    alignItems: "center",
  },
  verifactuLabel: {
    fontSize: 6,
    color: MUTED,
    marginBottom: 3,
    textAlign: "center",
  },
  verifactuQr: {
    width: 85,
    height: 85,
  },
  verifactuHash: {
    marginTop: 3,
    fontSize: 5,
    color: MUTED,
    textAlign: "center",
  },
});

function num(n: number, digits = 2): string {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n || 0);
}

function money(n: number): string {
  return `${num(n)} €`;
}

function formatClientTaxId(client: PdfParty): string {
  const nif = (client.nif || "").trim();
  const code = (client.countryCode || "").toUpperCase();
  if (!nif) return "—";
  if (
    code &&
    code !== "ES" &&
    code !== "OTHER" &&
    !nif.toUpperCase().startsWith(code)
  ) {
    return `${code}${nif}`;
  }
  return nif;
}

function formatPaymentLines(opts: {
  paymentMethod?: string | null;
  bankIban?: string | null;
  bankName?: string | null;
  bizumPhone?: string | null;
}): string {
  const method = (opts.paymentMethod ?? "Transferencia").trim() || "Transferencia";
  const isBizum = /bizum/i.test(method);
  if (isBizum) {
    const phone = (opts.bizumPhone ?? "603024030").trim() || "603024030";
    return `Bizum al ${phone}`;
  }
  const lines = ["Transferencia bancaria"];
  if (opts.bankName?.trim()) lines.push(opts.bankName.trim());
  if (opts.bankIban?.trim()) lines.push(`IBAN: ${opts.bankIban.trim()}`);
  return lines.join("\n");
}

function primaryVatRate(lines: PdfLine[]): number {
  if (!lines.length) return 0;
  const rates = new Map<number, number>();
  for (const l of lines) {
    rates.set(l.vatRate, (rates.get(l.vatRate) ?? 0) + l.lineSubtotal);
  }
  let best = 0;
  let bestBase = -1;
  for (const [rate, base] of rates) {
    if (base > bestBase) {
      best = rate;
      bestBase = base;
    }
  }
  return best;
}

export function InvoicePdfDocument(props: InvoicePdfProps) {
  const {
    title,
    number,
    issueDate,
    issuer,
    client,
    lines,
    subtotal,
    vatAmount,
    irpfRate = 0,
    irpfAmount = 0,
    total,
    notes,
    paymentMethod,
    bankIban,
    bankName,
    bizumPhone,
    showPayment = true,
    logoUrl,
    brandName = "Empresa",
    specialDiscountPct = 0,
    specialDiscountAmount = 0,
    earlyPaymentDiscountPct = 0,
    earlyPaymentDiscountAmount = 0,
    verifactuQrDataUrl,
    verifactuHash,
    verifactuSentAt,
  } = props;

  const vatRate = primaryVatRate(lines);
  const totalLabel =
    title.toUpperCase() === "FACTURA"
      ? "Total Factura (€)"
      : title.toUpperCase() === "PROFORMA"
        ? "Total Proforma (€)"
        : "Total Presupuesto (€)";

  const issuerAddress = [
    issuer.addressStreet,
    `${issuer.addressZip} ${issuer.addressCity}${
      issuer.addressProvince ? ` (${issuer.addressProvince})` : ""
    } ${issuer.addressCountry}`.trim(),
  ]
    .filter(Boolean)
    .join("\n");

  const contactLine = [
    issuer.phone ? `Tel. ${issuer.phone}` : null,
    issuer.email || null,
  ]
    .filter(Boolean)
    .join(" - ");

  const clientAddressLines = [
    client.addressStreet,
    [client.addressZip, client.addressCity].filter(Boolean).join(" "),
    client.addressCountry,
  ].filter((l) => l && l !== "—");

  const displayLines =
    lines.length < 5
      ? [
          ...lines,
          ...Array.from({ length: 5 - lines.length }).map(() => null),
        ]
      : lines;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.topRow}>
          <View style={styles.logoWrap}>
            {logoUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={logoUrl} style={styles.logoImg} />
            ) : (
              <View>
                <Text style={styles.brandText}>{brandName}</Text>
                <Text style={styles.brandSub}>facturación</Text>
              </View>
            )}
          </View>
          <View style={styles.issuerBlock}>
            <Text style={styles.issuerName}>{issuer.name}</Text>
            <Text style={styles.issuerLine}>{issuerAddress}</Text>
            <Text style={styles.issuerLine}>C.I.F./N.I.F. {issuer.nif}</Text>
            {contactLine ? (
              <Text style={styles.issuerLine}>{contactLine}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.docBarRow}>
          <View style={styles.docBarSpacer} />
          <View style={styles.docBar}>
            <View style={styles.docLabel}>
              <Text style={styles.docLabelText}>{title.toUpperCase()}</Text>
            </View>
            <View style={styles.docNumber}>
              <Text style={styles.docNumberText}>{number}</Text>
            </View>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <View style={styles.fieldBox}>
              <Text style={styles.fieldLabel}>Fecha</Text>
              <Text style={styles.fieldValue}>{issueDate}</Text>
            </View>
            <View style={styles.fieldBoxLast}>
              <Text style={styles.fieldLabel}>C.I.F. / N.I.F.</Text>
              <Text style={styles.fieldValue}>{formatClientTaxId(client)}</Text>
            </View>
          </View>
          <View style={styles.clientBox}>
            <Text style={styles.fieldLabel}>Cliente</Text>
            <View style={styles.clientBody}>
              <Text style={styles.clientName}>{client.name}</Text>
              {clientAddressLines.map((line, i) => (
                <Text key={i} style={styles.clientLine}>
                  {line}
                </Text>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colDesc, styles.th]}>Descripción</Text>
            <Text style={[styles.colQty, styles.th]}>Cantidad</Text>
            <Text style={[styles.colPrice, styles.th]}>Precio</Text>
            <Text style={[styles.colDisc, styles.th]}>Descuento</Text>
            <Text style={[styles.colTotal, styles.th]}>Total</Text>
          </View>
          {displayLines.map((l, i) => {
            const isLast = i === displayLines.length - 1;
            const rowStyle = isLast ? styles.tableRowLast : styles.tableRow;
            if (!l) {
              return (
                <View key={`empty-${i}`} style={rowStyle}>
                  <Text style={styles.colDesc}> </Text>
                  <Text style={styles.colQty}> </Text>
                  <Text style={styles.colPrice}> </Text>
                  <Text style={styles.colDisc}> </Text>
                  <Text style={styles.colTotal}> </Text>
                </View>
              );
            }
            return (
              <View key={i} style={rowStyle} wrap={false}>
                <Text style={styles.colDesc}>{l.description}</Text>
                <Text style={styles.colQty}>{num(l.quantity)}</Text>
                <Text style={styles.colPrice}>{money(l.unitPrice)}</Text>
                <Text style={styles.colDisc}>{num(l.discountPct)}%</Text>
                <Text style={styles.colTotal}>{money(l.lineSubtotal)}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.bottomLeft}>
            <View style={styles.dualField}>
              <Text style={styles.dualLabel}>Dto. Especial</Text>
              <Text style={styles.dualPct}>{num(specialDiscountPct)}%</Text>
              <Text style={styles.dualAmt}>{money(specialDiscountAmount)}</Text>
            </View>
            <View style={styles.dualField}>
              <Text style={styles.dualLabel}>Dto. Pronto Pago</Text>
              <Text style={styles.dualPct}>
                {num(earlyPaymentDiscountPct)}%
              </Text>
              <Text style={styles.dualAmt}>
                {money(earlyPaymentDiscountAmount)}
              </Text>
            </View>
            {showPayment ? (
              <View style={styles.fieldBox}>
                <Text style={styles.fieldLabel}>Forma de pago</Text>
                <Text style={styles.fieldValue}>
                  {formatPaymentLines({
                    paymentMethod,
                    bankIban,
                    bankName,
                    bizumPhone,
                  })}
                </Text>
              </View>
            ) : null}
            <View style={styles.obsBox}>
              <Text style={styles.obsLabel}>Observaciones</Text>
              <Text style={styles.obsBody}>{notes?.trim() || " "}</Text>
            </View>
          </View>

          <View style={styles.bottomRight}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Base Imponible</Text>
              <Text style={styles.totalValue}>{money(subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                Total I.V.A. ({num(vatRate)}%)
              </Text>
              <Text style={styles.totalValue}>{money(vatAmount)}</Text>
            </View>
            {irpfAmount > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  I.R.P.F. (−{num(irpfRate)}%)
                </Text>
                <Text style={styles.totalValue}>−{money(irpfAmount)}</Text>
              </View>
            ) : null}
            <View style={styles.totalRow}>
              <Text style={styles.totalFinalLabel}>{totalLabel}</Text>
              <Text style={styles.totalFinalValue}>{money(total)}</Text>
            </View>
          </View>
        </View>

        {title.toUpperCase() === "FACTURA" && verifactuQrDataUrl ? (
          <View style={styles.verifactuBlock} fixed>
            <Text style={styles.verifactuLabel}>QR tributario:</Text>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={verifactuQrDataUrl} style={styles.verifactuQr} />
            {verifactuHash ? (
              <Text style={styles.verifactuHash}>
                {verifactuHash.slice(0, 16)}…
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <View style={styles.footerLegal}>
            <Text style={styles.footerLine}>
              De acuerdo con la LOPD los datos serán de uso exclusivo de la
              empresa.
            </Text>
            {title.toUpperCase() === "FACTURA" ? (
              <Text style={styles.footerLine}>
                {verifactuQrDataUrl
                  ? verifactuSentAt
                    ? "Registro Veri*Factu remitido a la AEAT (QR verificable)."
                    : "Registro Veri*Factu local (modalidad no verificable): huella SHA-256 encadenada y QR tributario AEAT. Aún no se remite en línea a la sede. Obligación plena autónomos: 1 jul 2027."
                  : "Factura no remitida al sistema Veri*Factu de la AEAT. Documento emitido con software de facturación pendiente de adaptación plena al RRSIF (obligación autónomos: 1 jul 2027)."}
              </Text>
            ) : null}
          </View>
          <Text
            style={styles.footerPage}
            render={({ pageNumber, totalPages }) =>
              `PÁGINA ${pageNumber} de ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
