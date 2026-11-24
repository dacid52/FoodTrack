const SCALE = 1_000_000n;

export function parseQuantity(value: string): number {
  const input = value.trim();
  const match = input.match(/^(\d+)(?:\.(\d{1,6}))?$/);
  if (!match) throw new Error('Nhập số lượng không âm, tối đa 6 chữ số thập phân.');
  const fractional = (match[2] ?? '').padEnd(6, '0');
  const scaled = BigInt(match[1]) * SCALE + BigInt(fractional || '0');
  const result = Number(scaled);
  if (!Number.isSafeInteger(result)) throw new Error('Số lượng vượt giới hạn hỗ trợ.');
  return result;
}

export function formatQuantity(micros: number): string {
  if (!Number.isSafeInteger(micros) || micros < 0) return '—';
  const whole = Math.floor(micros / 1_000_000);
  const fractional = String(micros % 1_000_000).padStart(6, '0').replace(/0+$/, '');
  return fractional ? `${whole}.${fractional}` : String(whole);
}
