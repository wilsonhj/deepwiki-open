/**
 * `@lexo/core` — rules, words and validation.
 *
 * Pure and dependency-free on purpose: the server imports it to be the
 * authority, and the client imports the same code to keep the UI honest
 * without a round trip.
 */

export * from './types.js';
export * from './rng.js';
export * from './normalize.js';
export * from './languages.js';
export * from './categories.js';
export * from './bank.js';
export * from './deck.js';
export * from './modes.js';
export * from './validate.js';
export * from './protocol.js';
