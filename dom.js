// @ts-check
/* Daytrip — the DOM helpers the page and the game share. */

/** @typedef {string | number | Node | null | undefined} Leaf */
/** @typedef {Leaf | Array<Leaf | Array<Leaf | Leaf[]>>} Kid */
/** @typedef {Record<string, string | number | boolean | EventListener | null | undefined>} Attrs */

/**
 * Type guard for filtering the `null`s out of a child list before `replaceChildren`.
 * @template T
 * @param {T | null | undefined} value
 * @returns {value is T}
 */
export const present = value => value !== null && value !== undefined;

/**
 * Query one element and throw if it is missing: every selector used here is in our own markup.
 * @template {Element} [T=HTMLElement]
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {T}
 */
export function must(selector, root = document) {
  const node = root.querySelector(selector);
  if (!node) throw new Error(`Missing element: ${selector}`);
  return /** @type {T} */ (node);
}

/**
 * Create an element. `class` sets className, `on<event>` adds a listener, anything else is an
 * attribute. Children may be nested arrays; null and undefined are skipped.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Attrs} [attrs]
 * @param {...Kid} kids
 * @returns {HTMLElementTagNameMap[K]}
 */
export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  appendKids(node, kids);
  return node;
}

/**
 * @param {Element} node
 * @param {readonly unknown[]} kids nested arrays of Leaf
 */
function appendKids(node, kids) {
  for (const kid of kids) {
    if (kid === null || kid === undefined) continue;
    if (Array.isArray(kid)) appendKids(node, kid);
    else node.append(kid instanceof Node ? kid : String(kid));
  }
}

/**
 * A 2D context, or an error: every canvas here is one we created ourselves.
 * @param {HTMLCanvasElement} canvas
 * @returns {CanvasRenderingContext2D}
 */
export function ctx2d(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  return ctx;
}
