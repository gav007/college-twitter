const MAX_ENTITY_DECODE_PASSES = 2;

function decodeNumericEntity(_match, base, rawNumber) {
  const numeric = Number.parseInt(rawNumber, base);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 0x10ffff) {
    return _match;
  }

  try {
    return String.fromCodePoint(numeric);
  } catch (_err) {
    return _match;
  }
}

function normalizeEntityTypos(value) {
  return value
    .replace(/&x([0-9a-f]+);?/gi, '&#x$1;')
    .replace(/&#x([0-9a-f]+)(?!;)/gi, '&#x$1;')
    .replace(/&#([0-9]+)(?!;)/g, '&#$1;');
}

function decodeEntitiesOnce(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => decodeNumericEntity(match, 16, hex))
    .replace(/&#([0-9]+);/g, (match, num) => decodeNumericEntity(match, 10, num));
}

function decodeExternalText(value, options = {}) {
  const input = typeof value === 'string' ? value : '';
  if (!input) {
    return '';
  }

  const maxPassesRaw = Number(options.maxPasses);
  const maxPasses =
    Number.isInteger(maxPassesRaw) && maxPassesRaw > 0
      ? Math.min(4, maxPassesRaw)
      : MAX_ENTITY_DECODE_PASSES;

  let output = normalizeEntityTypos(input);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const decoded = decodeEntitiesOnce(output);
    if (decoded === output) {
      break;
    }
    output = decoded;
  }

  return output;
}

module.exports = {
  decodeExternalText
};

