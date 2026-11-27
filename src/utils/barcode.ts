// Pure TypeScript Code-128B vector barcode encoder (no external dependency)
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
];

export interface BarcodeBars {
  totalWidth: number;
  bars: Array<{ x: number; width: number }>;
}

export function encodeCode128B(rawText: string): BarcodeBars {
  const sanitized = (rawText || '000000')
    .split('')
    .map((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code <= 126 ? ch : '-';
    })
    .join('');

  const startCode = 104; // Code B
  const stopCode = 106;
  const codes: number[] = [startCode];
  let checksum = startCode;

  for (let i = 0; i < sanitized.length; i += 1) {
    const val = sanitized.charCodeAt(i) - 32;
    codes.push(val);
    checksum += val * (i + 1);
  }
  codes.push(checksum % 103);
  codes.push(stopCode);

  const quietZone = 8;
  let cursor = quietZone;
  const bars: Array<{ x: number; width: number }> = [];

  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code] ?? CODE128_PATTERNS[0];
    for (let i = 0; i < pattern.length; i += 1) {
      const w = Number(pattern[i]);
      if (i % 2 === 0) {
        bars.push({ x: cursor, width: w });
      }
      cursor += w;
    }
  }

  return { totalWidth: cursor + quietZone, bars };
}
