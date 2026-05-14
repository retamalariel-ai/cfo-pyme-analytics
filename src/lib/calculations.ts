import type { HealthAnalysis, BreakevenResult, StrategicKPIs } from './types';

export const calculateStrategicKPIs = (
  breakEvenSales: number,
  projectedSales: number,
  fixedCosts: number,
  contributionMarginRatio: number, // 0–1
  targetProfit: number
): StrategicKPIs => {
  const safetyMargin =
    projectedSales > 0
      ? ((projectedSales - breakEvenSales) / projectedSales) * 100
      : null;

  const breakEvenDay =
    projectedSales > 0 && breakEvenSales <= projectedSales
      ? Math.ceil((breakEvenSales / projectedSales) * 30)
      : null;

  const salesForTargetProfit =
    contributionMarginRatio > 0
      ? (fixedCosts + targetProfit) / contributionMarginRatio
      : null;

  const ebitda =
    isFinite(contributionMarginRatio) && contributionMarginRatio > 0
      ? projectedSales * contributionMarginRatio - fixedCosts
      : null;

  return { safetyMargin, breakEvenDay, salesForTargetProfit, ebitda };
};

export const getFinancialHealth = (result: BreakevenResult): HealthAnalysis => {
  const margin = result.averageContributionMargin;

  if (!isFinite(margin) || isNaN(margin)) {
    return {
      status: 'insufficient',
      label: 'Datos insuficientes',
      message: 'Completá precios y mix de productos para obtener el análisis.',
    };
  }
  if (margin > 40) {
    return {
      status: 'healthy',
      label: 'Estructura Saludable',
      message: `Margen de contribución del ${margin.toFixed(1)}%. Cada venta cubre los costos variables con amplio excedente para absorber costos fijos. Posición competitiva sólida.`,
    };
  }
  if (margin > 20) {
    return {
      status: 'moderate',
      label: 'Estructura Moderada',
      message: `Margen de contribución del ${margin.toFixed(1)}%. Hay oportunidades de mejora. Analizá si es posible optimizar precios o renegociar costos variables clave.`,
    };
  }
  return {
    status: 'risk',
    label: 'Estructura en Riesgo',
    message: `Margen de contribución del ${margin.toFixed(1)}%. Cada venta cubre poco más que su costo directo. Revisar la estructura de precios es prioritario antes de escalar.`,
  };
};

export const calculateBreakeven = (
  products: import('./types').Product[],
  fixedCosts: number,
  variableTax: number, // Percentage
  isOptimistic: boolean = false
): import('./types').BreakevenResult => {
  const taxMultiplier = 1 + variableTax / 100;
  const scenarioMultiplier = isOptimistic ? 1.1 : 0.9; // 10% optimistic, -10% pessimistic

  let totalWeightedContributionMargin = 0;
  let totalMixPercentage = 0;

  products.forEach(p => {
    const adjustedPrice = p.price * scenarioMultiplier;
    const contributionMargin = adjustedPrice - p.variableCost;
    totalWeightedContributionMargin += contributionMargin * (p.mixPercentage / 100);
    totalMixPercentage += p.mixPercentage;
  });

  if (Math.round(totalMixPercentage) !== 100) {
    console.warn(`La suma de los porcentajes de mezcla es ${totalMixPercentage}%. El cálculo puede ser impreciso.`);
  }

  const averageContributionMargin = (totalWeightedContributionMargin / (products.reduce((acc, p) => acc + p.price * (p.mixPercentage / 100), 0))) * 100;

  const breakEvenSales = fixedCosts / (totalWeightedContributionMargin / (products.reduce((acc, p) => acc + p.price * (p.mixPercentage / 100), 0)));

  const unitsPerProduct: { [productName: string]: number } = {};
  let totalVariableCosts = 0;
  let totalSales = 0;

  products.forEach(p => {
    const salesForProduct = breakEvenSales * (p.mixPercentage / 100);
    const units = salesForProduct / p.price;
    unitsPerProduct[p.name] = units;
    totalVariableCosts += p.variableCost * units;
    totalSales += salesForProduct;
  });

  totalVariableCosts *= taxMultiplier;

  const breakEvenUnits = Object.values(unitsPerProduct).reduce((sum, u) => sum + u, 0);

  const weightedAvgAdjustedPrice = products.reduce(
    (acc, p) => acc + p.price * scenarioMultiplier * (p.mixPercentage / 100), 0
  );
  const weightedAvgVariableCostPerUnit = products.reduce(
    (acc, p) => acc + p.variableCost * (p.mixPercentage / 100), 0
  ) * taxMultiplier;

  const maxUnits = Math.ceil(breakEvenUnits * 2.5);
  const steps = 30;
  const chartData: import('./types').ChartDataPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const units = Math.round((maxUnits / steps) * i);
    chartData.push({
      units,
      totalSales: units * weightedAvgAdjustedPrice,
      totalCosts: fixedCosts + units * weightedAvgVariableCostPerUnit,
      fixedCosts,
    });
  }

  return {
    breakEvenSales,
    breakEvenUnits,
    averageContributionMargin,
    unitsPerProduct,
    totalFixedCosts: fixedCosts,
    totalVariableCosts,
    totalSales,
    chartData,
  };
};
