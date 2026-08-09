import { describe, expect, it } from 'vitest';
import {
  allowedTypos,
  analyse,
  editDistance,
  foldDiacritics,
  getLanguage,
  isAllKana,
  kanaFold,
  rowIdOf,
} from '@lexo/core';

describe('foldDiacritics', () => {
  it('drops accents and case', () => {
    expect(foldDiacritics('Águila')).toBe('aguila');
    expect(foldDiacritics('CAFÉ')).toBe('cafe');
    expect(foldDiacritics('Açúcar')).toBe('acucar');
    expect(foldDiacritics('mañana')).toBe('manana');
  });

  it('expands ligatures NFD leaves alone', () => {
    expect(foldDiacritics('œuf')).toBe('oeuf');
    expect(foldDiacritics('Œuf')).toBe('oeuf');
  });
});

describe('kanaFold', () => {
  it('folds katakana onto hiragana', () => {
    expect(kanaFold('ネコ')).toBe('ねこ');
    expect(kanaFold('ライオン')).toBe('らいおん');
  });

  it('strips voicing so が counts as か行', () => {
    expect(kanaFold('ゴリラ')).toBe('こりら');
    expect(kanaFold('ぶどう')).toBe('ふとう');
  });

  it('folds small kana and drops the long mark', () => {
    expect(kanaFold('ギョウザ')).toBe('きようさ');
    expect(kanaFold('ラーメン')).toBe('らめん');
    expect(kanaFold('ヌー')).toBe('ぬ');
  });
});

describe('isAllKana', () => {
  it('separates readings from kanji', () => {
    expect(isAllKana('いぬ')).toBe(true);
    expect(isAllKana('ネコ')).toBe(true);
    expect(isAllKana('犬')).toBe(false);
    expect(isAllKana('')).toBe(false);
  });
});

describe('analyse', () => {
  it('strips Spanish articles', () => {
    expect(analyse(getLanguage('es'), 'el perro').key).toBe('perro');
    expect(analyse(getLanguage('es'), 'la vaca').initialId).toBe('v');
  });

  it('leaves words that merely start like an article alone', () => {
    expect(analyse(getLanguage('es'), 'lavanda').initialId).toBe('l');
    expect(analyse(getLanguage('fr'), 'lille').initialId).toBe('l');
  });

  it("handles the French elided article", () => {
    expect(analyse(getLanguage('fr'), "L'ours").key).toBe('ours');
    expect(analyse(getLanguage('fr'), 'L’ours').initialId).toBe('o');
  });

  it('files œuf under O, not U', () => {
    expect(analyse(getLanguage('fr'), 'œuf').initialId).toBe('o');
  });

  it('ignores spaces and hyphens in the key', () => {
    expect(analyse(getLanguage('es'), 'Costa Rica').key).toBe('costarica');
    expect(analyse(getLanguage('pt'), 'grão-de-bico').key).toBe('graodebico');
  });

  it('maps Japanese readings to kana rows', () => {
    const ja = getLanguage('ja');
    expect(analyse(ja, 'いぬ').initialId).toBe('a');
    expect(analyse(ja, 'ごりら').initialId).toBe('ka');
    expect(analyse(ja, 'ぱんだ').initialId).toBe('ha');
    expect(analyse(ja, 'ゆり').initialId).toBe('ya');
  });

  it('has no initial for kanji on its own', () => {
    expect(analyse(getLanguage('ja'), '犬').initialId).toBeNull();
  });
});

describe('rowIdOf', () => {
  it('covers every gojūon row', () => {
    expect(rowIdOf('あ')).toBe('a');
    expect(rowIdOf('き')).toBe('ka');
    expect(rowIdOf('す')).toBe('sa');
    expect(rowIdOf('て')).toBe('ta');
    expect(rowIdOf('の')).toBe('na');
    expect(rowIdOf('ひ')).toBe('ha');
    expect(rowIdOf('む')).toBe('ma');
    expect(rowIdOf('よ')).toBe('ya');
    expect(rowIdOf('れ')).toBe('ra');
    expect(rowIdOf('わ')).toBe('wa');
  });
});

describe('editDistance', () => {
  it('measures small edits', () => {
    expect(editDistance('elefante', 'elefnte')).toBe(1);
    expect(editDistance('gato', 'gato')).toBe(0);
  });

  it('gives up past the cap instead of scanning', () => {
    expect(editDistance('gato', 'elefante', 2)).toBeGreaterThan(2);
  });
});

describe('allowedTypos', () => {
  it('gives short words no slack', () => {
    expect(allowedTypos('oso')).toBe(0);
    expect(allowedTypos('gato')).toBe(0);
    expect(allowedTypos('elefante')).toBe(1);
    expect(allowedTypos('rinoceronte')).toBe(2);
  });
});
