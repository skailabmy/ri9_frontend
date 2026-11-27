import katex from 'katex';

/**
 * Decode escaped character sequences from API strings (like `\n`, `\r`, `\t`, `\"`, `\'`, unicode `\uXXXX`).
 */
export function decodeEscapedCharacters(text: string): string {
  if (!text) return '';
  return text.replace(/\\(u[0-9a-fA-F]{4}|n|r|t|b|f|\\|"|')/g, (match, token) => {
    switch (token) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case '\\':
        return '\\';
      case '"':
        return '"';
      case "'":
        return "'";
      default:
        if (token.startsWith('u') && token.length === 5) {
          const code = parseInt(token.slice(1), 16);
          if (!isNaN(code)) {
            return String.fromCharCode(code);
          }
        }
        return match;
    }
  });
}

/**
 * Escapes standard HTML special characters.
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return str.replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c] || c));
}

/**
 * Helper to unescape double backslashes in math to protect LaTeX characters.
 */
function decodeMathText(text: string): string {
  return text.replace(/\\(\\|u[0-9a-fA-F]{4})/g, (match, token) => {
    if (token === '\\') {
      return '\\';
    } else if (token.startsWith('u')) {
      const code = parseInt(token.slice(1), 16);
      if (!isNaN(code)) {
        return String.fromCharCode(code);
      }
    }
    return match;
  });
}

/**
 * Delimiter definitions matching Flutter's `MathText`:
 * - `\[ ... \]` (display math)
 * - `\( ... \)` (inline math)
 * - `$$ ... $$` (display math)
 * - `$ ... $` (inline math)
 */
const DELIMITERS: [string, string, boolean][] = [
  ['\\[', '\\]', true],
  ['\\(', '\\)', false],
  ['$$', '$$', true],
  ['$', '$', false],
];

/**
 * Formats a text chunk: converts newlines to `<br/>` and escapes HTML.
 */
function formatPlainText(raw: string): string {
  const decoded = decodeEscapedCharacters(raw);
  return escapeHtml(decoded).replace(/\r\n|\n|\r/g, '<br/>');
}

/**
 * Parses mixed text, HTML escaped characters (`\n`, etc.), and mathematical LaTeX formulas.
 * Supports delimiters `\[ ... \]`, `\( ... \)`, `$$ ... $$`, and `$ ... $`.
 *
 * @param input Raw text string from API or questions.
 * @returns Safe HTML string with KaTeX markup and preserved newlines.
 */
export function formatMathAndText(input: string | null | undefined): string {
  if (!input) return '';

  let text = String(input);
  let html = '';
  let index = 0;

  while (index < text.length) {
    let earliestIndex = -1;
    let matchedDelimStart = '';
    let matchedDelimEnd = '';
    let isDisplay = false;

    for (const [startDelim, endDelim, display] of DELIMITERS) {
      const pos = text.indexOf(startDelim, index);
      if (pos !== -1) {
        if (earliestIndex === -1 || pos < earliestIndex) {
          earliestIndex = pos;
          matchedDelimStart = startDelim;
          matchedDelimEnd = endDelim;
          isDisplay = display;
        }
      }
    }

    if (earliestIndex === -1) {
      // No math delimiters left
      html += formatPlainText(text.slice(index));
      break;
    }

    // Text prior to the delimiter
    if (earliestIndex > index) {
      html += formatPlainText(text.slice(index, earliestIndex));
    }

    // Find the end delimiter
    const mathStartIdx = earliestIndex + matchedDelimStart.length;
    const mathEndIdx = text.indexOf(matchedDelimEnd, mathStartIdx);

    if (mathEndIdx === -1) {
      // Unmatched delimiter, format rest as regular text
      html += formatPlainText(text.slice(earliestIndex));
      break;
    }

    const mathContent = text.slice(mathStartIdx, mathEndIdx);
    const cleanedMath = decodeMathText(mathContent);

    try {
      const rendered = katex.renderToString(cleanedMath, {
        displayMode: isDisplay,
        throwOnError: false,
        output: 'htmlAndMathml',
      });
      html += `<span class="math-tex${isDisplay ? ' math-display' : ' math-inline'}">${rendered}</span>`;
    } catch {
      // Fallback
      html += `<span class="math-fallback">${escapeHtml(matchedDelimStart + cleanedMath + matchedDelimEnd)}</span>`;
    }

    index = mathEndIdx + matchedDelimEnd.length;
  }

  return html;
}
