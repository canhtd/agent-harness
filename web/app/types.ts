export interface TokenRecord {
  session_id: string;
  task: string;
  date: string;
  model: string;
  turns: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  estimated_cost_usd: number;
}
