
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Product } from "./types";

export const generatePDFReport = (
  breakEvenPoint: number,
  marginOfSafety: number,
  products: Product[],
) => {
  const doc = new jsPDF();

  // Header
  doc.setFontSize(18);
  doc.setTextColor("#2d3748"); // Dark Gray
  doc.text("Informe de Diagnóstico Financiero", 14, 22);
  doc.setFontSize(14);
  doc.setTextColor("#718096"); // Medium Gray
  doc.text("CFO Tech Partners", 14, 30);

  // Executive Summary
  doc.setFontSize(12);
  doc.setTextColor("#2d3748");
  doc.text("Resumen Ejecutivo", 14, 45);
  doc.setFontSize(11);
  doc.setTextColor("#4a5568"); // Gray
  const summaryText = `Para cubrir la totalidad de sus costos operativos y comenzar a generar ganancias, su empresa necesita alcanzar un punto de facturación de $${breakEvenPoint.toFixed(2)} mensuales. Este es su punto de equilibrio.`;
  const splitSummary = doc.splitTextToSize(summaryText, 180);
  doc.text(splitSummary, 14, 53);

  // Risk Analysis
  doc.setFontSize(12);
  doc.setTextColor("#2d3748");
  doc.text("Análisis de Riesgo", 14, 75);
  doc.setFontSize(11);
  doc.setTextColor("#4a5568");
  let riskAnalysisText = "";
  if (marginOfSafety < 10) {
    riskAnalysisText =
      "Su margen de seguridad actual es CRÍTICO. Un ${marginOfSafety.toFixed(2)}% indica que cualquier pequeña caída en las ventas lo pondrá en zona de pérdidas. Es urgente revisar su estructura de costos, optimizar precios y potenciar la estrategia comercial.";
  } else if (marginOfSafety >= 10 && marginOfSafety < 25) {
    riskAnalysisText =
      `Su margen de seguridad es MODERADO (${marginOfSafety.toFixed(2)}%). Si bien no está en una zona de riesgo inminente, no hay mucho espacio para imprevistos. Se recomienda implementar estrategias proactivas para aumentar este colchón financiero.`;
  } else {
    riskAnalysisText =
      `¡Felicitaciones! Su margen de seguridad es SALUDABLE (${marginOfSafety.toFixed(2)}%). Esto le brinda una sólida posición para reinvertir, innovar y planificar el crecimiento a largo plazo con tranquilidad.`;
  }
  const splitRiskText = doc.splitTextToSize(riskAnalysisText, 180);
  doc.text(splitRiskText, 14, 83);

  // Product Mix Table
  doc.setFontSize(12);
  doc.setTextColor("#2d3748");
  doc.text("Mix de Ventas Actual", 14, 110);

  const tableData = products.map((p) => [
    p.name,
    `$${p.price.toFixed(2)}`,
    `$${p.variableCost.toFixed(2)}`,
    `${p.mixPercentage.toFixed(2)}%`,
    `$${(p.price - p.variableCost).toFixed(2)}`
  ]);

  autoTable(doc, {
    head: [["Producto", "Precio Venta", "Costo Variable", "% Mix Ventas", "Margen Contrib."]],
    body: tableData,
    startY: 115,
    headStyles: { fillColor: "#2d3748" },
    styles: { font: "helvetica", fontSize: 10 },
    didDrawPage: (data) => {
      // Footer
      const pageCount = (doc.internal as any).getNumberOfPages?.() ?? doc.getNumberOfPages();
      doc.setFontSize(9);
      doc.setTextColor("#a0aec0"); // Light Gray
      doc.text(
        `Página ${data.pageNumber} de ${pageCount}`,
        data.settings.margin.left,
        doc.internal.pageSize.height - 10
      );
      doc.text(
        "Consultoría estratégica por Ariel Retamal - www.retamal.com.ar",
        doc.internal.pageSize.width - data.settings.margin.right - 100,
        doc.internal.pageSize.height - 10,
        { align: "left" }
      );
    },
  });

  doc.save("Diagnostico_Financiero_CFO_Tech.pdf");
};
