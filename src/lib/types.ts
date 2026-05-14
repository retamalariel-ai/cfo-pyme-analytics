export interface Product {
  id: number;
  name: string;
  price: number;
  variableCost: number;
  mixPercentage: number;
}

export interface ChartDataPoint {
  units: number;
  totalSales: number;
  totalCosts: number;
  fixedCosts: number;
}

export interface BreakevenResult {
  breakEvenSales: number;
  breakEvenUnits: number;
  averageContributionMargin: number;
  unitsPerProduct: { [productName: string]: number };
  totalFixedCosts: number;
  totalVariableCosts: number;
  totalSales: number;
  chartData: ChartDataPoint[];
}

export interface CostItem {
  id: number;
  name: string;
  amount: number;
}

export type HealthStatus = 'healthy' | 'moderate' | 'risk' | 'insufficient';

export interface HealthAnalysis {
  status: HealthStatus;
  label: string;
  message: string;
}

export interface StrategicKPIs {
  safetyMargin: number | null;
  breakEvenDay: number | null;
  salesForTargetProfit: number | null;
  ebitda: number | null;
}
