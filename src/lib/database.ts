import { createBrowserClient } from '@supabase/ssr';
import { Product, CostItem } from './types';

// createBrowserClient stores the session in cookies (not localStorage)
// so the Next.js middleware can read it server-side via @supabase/ssr createServerClient.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const getInitialProducts = (): Product[] => [
  { id: 1, name: 'Producto A', price: 150, variableCost: 70, mixPercentage: 40 },
  { id: 2, name: 'Producto B', price: 200, variableCost: 90, mixPercentage: 60 },
];

export interface ScenarioRecord {
  id: string;
  name: string;
  created_at: string;
  products: Product[];
  fixed_costs: number;
  variable_tax: number;
  observations: string | null;
  cost_items: CostItem[] | null;
}

export interface ScenarioPayload {
  clientId: string;
  name?: string;
  products: Product[];
  costItems: CostItem[];
  fixedCosts: number;
  variableTax: number;
  observations?: string;
}

export const getScenarios = async (
  clientId: string
): Promise<{ data: ScenarioRecord[]; error: string | null }> => {
  const { data, error } = await supabase
    .from('scenarios')
    .select('id, name, created_at, products, fixed_costs, variable_tax, observations, cost_items')
    .eq('user_id', clientId)
    .order('created_at', { ascending: false })
    .limit(20);
  return { data: (data as ScenarioRecord[]) ?? [], error: error?.message ?? null };
};

export const saveScenario = async (
  data: ScenarioPayload
): Promise<{ error: string | null }> => {
  const { error } = await supabase.from('scenarios').insert({
    user_id: data.clientId,
    name: data.name ?? `Escenario ${new Date().toLocaleString('es-AR')}`,
    products: data.products,
    cost_items: data.costItems,
    fixed_costs: data.fixedCosts,
    variable_tax: data.variableTax,
    observations: data.observations ?? null,
  });
  return { error: error?.message ?? null };
};
