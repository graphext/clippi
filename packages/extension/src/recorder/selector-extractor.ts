/**
 * Selector extractor - generates multiple selector strategies for an element
 * Priority order: testId > aria > css > text (matching @clippi/core)
 */

import type {
  Selector,
  SelectorStrategy,
  SelectorType,
} from "../types/messages.js";

/**
 * Extract all possible selector strategies for an element
 * Returns strategies in priority order (most stable first)
 * Only includes selectors that uniquely identify the element
 */
export function extractSelectors(element: Element): Selector {
  const strategies: SelectorStrategy[] = [];

  // 1. data-testid (most stable) - only if unique
  const testId = extractTestId(element);
  if (testId && isUniqueSelectorForType("testId", testId)) {
    strategies.push({ type: "testId", value: testId });
  }

  // 2. aria-label - only if unique
  const ariaLabel = extractAriaLabel(element);
  if (ariaLabel && isUniqueSelectorForType("aria", ariaLabel)) {
    strategies.push({ type: "aria", value: ariaLabel });
  }

  // 3. CSS selector (id, class-based, or structural)
  const cssSelector = extractCssSelector(element);
  if (cssSelector) {
    strategies.push({ type: "css", value: cssSelector });
  }

  // 4. Text content (fragile fallback) - only if unique
  const textSelector = extractTextSelector(element);
  if (textSelector && isUniqueTextSelector(textSelector)) {
    strategies.push(textSelector);
  }

  return { strategies };
}

/**
 * Check if a selector type/value combination is unique in the document
 */
function isUniqueSelectorForType(type: SelectorType, value: string): boolean {
  let cssSelector: string;
  switch (type) {
    case "testId":
      cssSelector = `[data-testid="${CSS.escape(value)}"]`;
      break;
    case "aria":
      cssSelector = `[aria-label="${CSS.escape(value)}"]`;
      break;
    default:
      return true;
  }
  return isUniqueSelector(cssSelector);
}

/**
 * Check if a text selector is unique
 */
function isUniqueTextSelector(strategy: SelectorStrategy): boolean {
  if (strategy.type !== "text" || !strategy.tag) return false;

  const elements = document.querySelectorAll(strategy.tag);
  let matchCount = 0;

  for (const el of elements) {
    if (el.textContent?.trim().startsWith(strategy.value)) {
      matchCount++;
      if (matchCount > 1) return false;
    }
  }

  return matchCount === 1;
}

/**
 * Extract data-testid attribute
 */
function extractTestId(element: Element): string | null {
  return (
    element.getAttribute("data-testid") ||
    element.getAttribute("data-test-id") ||
    element.getAttribute("data-test") ||
    null
  );
}

/**
 * Extract aria-label attribute
 */
function extractAriaLabel(element: Element): string | null {
  return element.getAttribute("aria-label");
}

/**
 * Extract the best CSS selector for an element
 */
function extractCssSelector(element: Element): string | null {
  // Try ID first (if unique and stable-looking)
  if (element.id && !isGeneratedId(element.id)) {
    return `#${CSS.escape(element.id)}`;
  }

  // Try unique attribute selectors
  const uniqueAttr = findUniqueAttribute(element);
  if (uniqueAttr) {
    return uniqueAttr;
  }

  // Try class-based selector with parent context
  const classSelector = buildClassSelector(element);
  if (classSelector && isUniqueSelector(classSelector)) {
    return classSelector;
  }

  // Fallback to nth-child path (less stable but always works)
  return buildNthChildPath(element);
}

/**
 * Check if an ID looks auto-generated (and thus unstable)
 */
function isGeneratedId(id: string): boolean {
  // Common patterns for generated IDs
  return (
    /^[a-f0-9]{8,}$/i.test(id) || // Hex strings
    /^:r[0-9a-z]+:$/i.test(id) || // React generated
    /^[a-z]+-[a-f0-9-]{20,}$/i.test(id) || // UUID-like
    /^ember\d+$/i.test(id) || // Ember.js
    /^ext-gen\d+$/i.test(id) || // ExtJS
    /^\d+$/.test(id) // Pure numbers
  );
}

/**
 * Find a unique attribute selector for the element
 */
function findUniqueAttribute(element: Element): string | null {
  const stableAttributes = [
    "name",
    "data-id",
    "data-name",
    "data-value",
    "role",
    "type",
    "href",
  ];

  for (const attr of stableAttributes) {
    const value = element.getAttribute(attr);
    if (value) {
      const selector = `${element.tagName.toLowerCase()}[${attr}="${CSS.escape(value)}"]`;
      if (isUniqueSelector(selector)) {
        return selector;
      }
    }
  }

  return null;
}

/**
 * Build a class-based selector
 */
function buildClassSelector(element: Element): string | null {
  const classes = Array.from(element.classList).filter(
    (c) => !isGeneratedClass(c),
  );

  if (classes.length === 0) return null;

  const tagName = element.tagName.toLowerCase();
  const classSelector = classes.map((c) => `.${CSS.escape(c)}`).join("");

  return `${tagName}${classSelector}`;
}

/**
 * Check if a class name looks auto-generated
 */
function isGeneratedClass(className: string): boolean {
  return (
    /^[a-z]{1,3}-[a-f0-9]{5,}$/i.test(className) || // CSS modules hash
    /^css-[a-z0-9]+$/i.test(className) || // emotion/styled
    /^sc-[a-zA-Z]+-[a-zA-Z]+$/i.test(className) || // styled-components
    /^_[a-zA-Z0-9]{5,}$/i.test(className) // Next.js CSS modules
  );
}

/**
 * Build an nth-child path from root to element
 */
function buildNthChildPath(element: Element): string {
  const path: string[] = [];
  let current: Element | null = element;

  while (
    current &&
    current !== document.body &&
    current !== document.documentElement
  ) {
    const parent = current.parentElement;
    if (!parent) break;

    const siblings = Array.from(parent.children);
    const index = siblings.indexOf(current) + 1;
    const tagName = current.tagName.toLowerCase();

    // Count same-tag siblings for nth-of-type
    const sameTagSiblings = siblings.filter(
      (s) => s.tagName === current!.tagName,
    );
    if (sameTagSiblings.length === 1) {
      path.unshift(tagName);
    } else {
      const typeIndex = sameTagSiblings.indexOf(current) + 1;
      path.unshift(`${tagName}:nth-of-type(${typeIndex})`);
    }

    current = parent;

    // Limit depth to avoid overly long selectors
    if (path.length >= 5) break;
  }

  return path.join(" > ");
}

/**
 * Check if a selector is unique in the document
 */
function isUniqueSelector(selector: string): boolean {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

/**
 * Extract text-based selector (fragile fallback)
 */
function extractTextSelector(element: Element): SelectorStrategy | null {
  const text = element.textContent?.trim();
  if (!text || text.length > 100) return null;

  // Only use for interactive elements
  const interactiveTags = ["button", "a", "input", "select", "label"];
  const tagName = element.tagName.toLowerCase();

  if (!interactiveTags.includes(tagName)) return null;

  return {
    type: "text" as SelectorType,
    value: text.slice(0, 50),
    tag: tagName,
  };
}

/**
 * Get a human-readable description of the element
 */
export function describeElement(element: Element): string {
  const tagName = element.tagName.toLowerCase();
  const text = element.textContent?.trim().slice(0, 50);
  const ariaLabel = element.getAttribute("aria-label");
  const placeholder = element.getAttribute("placeholder");
  const title = element.getAttribute("title");

  if (ariaLabel) return ariaLabel;
  if (text) return text;
  if (placeholder) return placeholder;
  if (title) return title;

  return tagName;
}
