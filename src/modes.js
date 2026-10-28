const str = (v) => String(v ?? '').trim();

function ensureList(list, file) {
  if (!Array.isArray(list)) throw new Error(`${file} phải là danh sách (mỗi dòng bắt đầu bằng "- ")`);
  return list;
}

export function normalizeVocab(list) {
  return ensureList(list, 'vocab.yml')
    .map((r) => ({
      kanji: str(r?.kanji),
      spelling: str(r?.spelling),
      meaning: str(r?.meaning),
    }))
    .filter((w) => w.kanji || w.spelling);
}

export function normalizeGrammar(list) {
  return ensureList(list, 'grammar.yml')
    .map((r) => ({
      formula: str(r?.formula),
      structure: str(r?.structure),
      meaning: str(r?.meaning),
      example: (Array.isArray(r?.example) ? r.example : [r?.example]).map(str).filter(Boolean),
    }))
    .filter((g) => g.formula);
}
