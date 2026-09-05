const REBAR_WEIGHT_TABLE = [
  '【鋼筋單位重】CNS／工地常用（kg/m）',
  'D10（#3）　0.56',
  'D13（#4）　0.994',
  'D16（#5）　1.56',
  'D19（#6）　2.25',
  'D22（#7）　3.04',
  'D25（#8）　3.98',
  'D29（#9）　5.08',
  'D32（#10）　6.39',
  'D36（#11）　7.90',
  '其他號數可估：直徑(mm)² ÷ 162',
  '實際以進場磅單為準。',
].join('\n')

export function isRebarWeightQuery(query: string): boolean {
  const text = query.replace(/\s+/g, '')
  if (!/鋼筋|钢筋|竹節|竹节|單位重|单位重/.test(text) && !/D\d{2}/.test(text)) return false
  return /重量|單位重|单位重|號數|号数|規格|规格|對照|对照|kg\/m|\bkg\b|公斤|多重|每米|每公尺/.test(text)
}

export function rebarWeightTable(): string {
  return REBAR_WEIGHT_TABLE
}
