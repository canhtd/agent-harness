export interface TokenRecord {
  task: string
  date: string
  model: string
  turns: number
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  estimated_cost_usd: number
}
