/**
 * Category definitions and their labels.
 *
 * Labels are part of the game surface, not the UI chrome, so they live
 * next to the game rules rather than in the client's i18n bundle.
 */

import type { CategoryId, LanguageId } from './types.js';
import { CATEGORY_IDS } from './types.js';

export interface CategoryDef {
  id: CategoryId;
  /** Pictogram shown alongside the label — never the only cue. */
  icon: string;
  /** Label per playable language, plus English for docs and tooling. */
  label: Record<LanguageId | 'en', string>;
  /** Included in the simplified set used by kids mode. */
  simple: boolean;
}

export const CATEGORIES: Record<CategoryId, CategoryDef> = {
  animal: {
    id: 'animal',
    icon: '🐾',
    label: { es: 'Animal', fr: 'Animal', pt: 'Animal', ja: '動物', en: 'Animal' },
    simple: true,
  },
  country: {
    id: 'country',
    icon: '🌍',
    label: { es: 'País', fr: 'Pays', pt: 'País', ja: '国', en: 'Country' },
    simple: true,
  },
  city: {
    id: 'city',
    icon: '🏙️',
    label: { es: 'Ciudad', fr: 'Ville', pt: 'Cidade', ja: '都市', en: 'City' },
    simple: false,
  },
  food: {
    id: 'food',
    icon: '🍽️',
    label: { es: 'Comida', fr: 'Nourriture', pt: 'Comida', ja: '食べ物', en: 'Food' },
    simple: true,
  },
  object: {
    id: 'object',
    icon: '🧩',
    label: { es: 'Objeto', fr: 'Objet', pt: 'Objeto', ja: 'もの', en: 'Object' },
    simple: true,
  },
  profession: {
    id: 'profession',
    icon: '👷',
    label: { es: 'Profesión', fr: 'Métier', pt: 'Profissão', ja: '職業', en: 'Profession' },
    simple: false,
  },
  plant: {
    id: 'plant',
    icon: '🌿',
    label: { es: 'Planta', fr: 'Plante', pt: 'Planta', ja: '植物', en: 'Plant' },
    simple: false,
  },
  name: {
    id: 'name',
    icon: '🙋',
    label: { es: 'Nombre', fr: 'Prénom', pt: 'Nome', ja: '名前', en: 'First name' },
    simple: true,
  },
};

/** Categories offered to young players. */
export const SIMPLE_CATEGORY_IDS: CategoryId[] = CATEGORY_IDS.filter(
  (id) => CATEGORIES[id].simple,
);

export function categoryLabel(id: CategoryId, language: LanguageId | 'en'): string {
  return CATEGORIES[id].label[language];
}
