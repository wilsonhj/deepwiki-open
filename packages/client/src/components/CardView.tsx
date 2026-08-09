/**
 * The card in play.
 *
 * The whole puzzle is here: the category carries a colour, and exactly
 * one of the three letters wears the same one. Colour is never the only
 * cue — each colour is paired with a shape, so the card still reads for
 * a colour-blind player (and in a screenshot printed in greyscale).
 */

import { CATEGORIES, COLOR_SHAPES, type ColorId, type LanguageId, type PublicCard } from '@lexo/core';

function Shape({ color }: { color: ColorId }) {
  const shape = COLOR_SHAPES[color];
  return (
    <svg className="shape" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      {shape === 'circle' && <circle cx="6" cy="6" r="5" />}
      {shape === 'triangle' && <polygon points="6,1 11,11 1,11" />}
      {shape === 'square' && <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" />}
    </svg>
  );
}

export interface CardViewProps {
  card: PublicCard;
  language: LanguageId;
  /** Per-letter reveal offsets, mirroring a card being turned over. */
  revealDelaysMs: number[];
  /** Dim the card once the round is decided. */
  settled?: boolean;
}

export function CardView({ card, language, revealDelaysMs, settled = false }: CardViewProps) {
  const category = CATEGORIES[card.category];

  return (
    <div className={`card${settled ? ' card-settled' : ''}`}>
      <div className={`card-category tone-${card.categoryColor}`}>
        <Shape color={card.categoryColor} />
        <span className="card-category-icon" aria-hidden="true">
          {category.icon}
        </span>
        <span className="card-category-label" lang={language}>
          {category.label[language]}
        </span>
      </div>

      <ul className="card-letters">
        {card.letters.map((letter, index) => (
          <li
            key={letter.initial.id}
            className={`letter tone-${letter.color}`}
            style={{ animationDelay: `${revealDelaysMs[index] ?? 0}ms` }}
          >
            <Shape color={letter.color} />
            <span className="letter-display" lang={language}>
              {letter.initial.display}
            </span>
            {letter.initial.hint && <span className="letter-hint">{letter.initial.hint}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
