const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const TEENS = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion"];

function threeDigitsToWords(n) {
  let words = "";
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) words += `${ONES[hundreds]} Hundred`;
  if (rest) {
    if (words) words += " ";
    if (rest < 10) words += ONES[rest];
    else if (rest < 20) words += TEENS[rest - 10];
    else {
      words += TENS[Math.floor(rest / 10)];
      if (rest % 10) words += `-${ONES[rest % 10]}`;
    }
  }
  return words;
}

/** Converts a non-negative integer into English words. 0 -> "Zero". */
export function integerToWords(n) {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "Zero";
  const groups = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    const groupWords = threeDigitsToWords(groups[i]);
    parts.push(SCALES[i] ? `${groupWords} ${SCALES[i]}` : groupWords);
  }
  return parts.join(" ");
}

/**
 * Converts any Birr amount (number or numeric string) into words, e.g.
 * birrToWords(4530.5) -> "Four Thousand Five Hundred Thirty Birr and Fifty Cents Only"
 * birrToWords(0)      -> "Zero Birr Only"
 * Handles negative amounts, amounts with more than 2 decimal places
 * (rounds to the nearest cent), and non-finite/invalid input (throws,
 * on purpose — a receipt should never silently print a wrong amount).
 */
export function birrToWords(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) {
    throw new Error(`birrToWords: invalid amount "${amount}"`);
  }
  const negative = n < 0;
  const cents = Math.round(Math.abs(n) * 100);
  const birr = Math.floor(cents / 100);
  const remainderCents = cents % 100;

  let result = `${integerToWords(birr)} Birr`;
  if (remainderCents > 0) {
    result += ` and ${integerToWords(remainderCents)} Cents`;
  }
  result += " Only";
  if (negative) result = `Negative ${result}`;
  return result;
}

export default birrToWords;