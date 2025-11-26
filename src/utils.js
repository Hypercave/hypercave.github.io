/**
 * Shorten an address for display
 * @param {string} address 
 * @param {number} startLen 
 * @param {number} endLen 
 * @returns {string}
 */
export function shortenAddress(address, startLen = 12, endLen = 6) {
  if (!address || address.length <= startLen + endLen + 3) return address;
  return `${address.slice(0, startLen)}...${address.slice(-endLen)}`;
}

/**
 * Format a decimal amount for display
 * @param {string|number} amount 
 * @param {number} maxDecimals 
 * @returns {string}
 */
export function formatAmount(amount, maxDecimals = 6) {
  const num = parseFloat(amount);
  
  if (isNaN(num)) return '0';
  if (num === 0) return '0';
  
  if (num > 0 && num < 0.000001) {
    return '< 0.000001';
  }
  
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals
  });
}

/**
 * Debounce a function
 * @param {Function} fn 
 * @param {number} delayMs 
 * @returns {Function}
 */
export function debounce(fn, delayMs) {
  let timeoutId;
  
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delayMs);
  };
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str 
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Parse NFT local ID from Gateway response format to manifest format
 * @param {string|object} id 
 * @returns {string}
 */
export function parseNftLocalId(id) {
  if (typeof id === 'string') {
    return id;
  }
  
  if (!id || typeof id !== 'object') {
    return String(id);
  }
  
  const simpleRep = id.simple_rep || '';
  
  switch (id.id_type) {
    case 'Integer':
      return `#${simpleRep}#`;
    case 'String':
      return `<${simpleRep}>`;
    case 'Bytes':
      return `[${simpleRep}]`;
    case 'RUID':
      return `{${simpleRep}}`;
    default:
      return simpleRep || String(id);
  }
}

/**
 * Format NFT ID for display (shortened if too long)
 * @param {string|object} id 
 * @returns {string}
 */
export function formatNftId(id) {
  const parsed = parseNftLocalId(id);
  
  if (parsed.length > 24) {
    return parsed.slice(0, 12) + '...' + parsed.slice(-8);
  }
  
  return parsed;
}

/**
 * Default icon as inline SVG data URI
 */
export const DEFAULT_ICON = 'data:image/svg+xml,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="15" fill="#4A3520"/>
  <circle cx="16" cy="16" r="8" fill="#8B5A2B"/>
</svg>
`).trim();

/**
 * Get usable icon URL, handling IPFS and missing icons
 * @param {string|null} url 
 * @returns {string}
 */
export function getIconUrl(url) {
  if (!url) {
    return DEFAULT_ICON;
  }
  
  if (url.startsWith('ipfs://')) {
    const cid = url.slice(7);
    return `https://ipfs.io/ipfs/${cid}`;
  }
  
  return url;
}

/**
 * Count decimal places in a string number
 * @param {string} value 
 * @returns {number}
 */
function countDecimalPlaces(value) {
  if (!value || typeof value !== 'string') return 0;
  const parts = value.split('.');
  if (parts.length < 2) return 0;
  return parts[1].length;
}

/**
 * Truncate a decimal string to specified decimal places
 * @param {string} value 
 * @param {number} divisibility 
 * @returns {string}
 */
export function truncateToDecimals(value, divisibility) {
  if (!value || typeof value !== 'string') return value;

  const parts = value.split('.');
  if (parts.length < 2) return value;

  if (divisibility === 0) {
    return parts[0];
  }

  const truncatedDecimals = parts[1].slice(0, divisibility);
  // Preserve the decimal point even if no digits after it yet (user is typing)
  return `${parts[0]}.${truncatedDecimals}`;
}

/**
 * Validate a decimal amount string with divisibility enforcement
 * @param {string} value 
 * @param {string|null} maxAmount - Maximum allowed amount (null to skip balance check)
 * @param {number} divisibility - Maximum decimal places allowed (0-18)
 * @returns {{valid: boolean, error?: string}}
 */
export function validateAmount(value, maxAmount, divisibility = 18) {
  if (!value || value.trim() === '') {
    return { valid: false, error: 'Amount required' };
  }
  
  const trimmed = value.trim();
  
  // Check for valid decimal format
  if (!/^[0-9]*\.?[0-9]*$/.test(trimmed) || trimmed === '.') {
    return { valid: false, error: 'Invalid number' };
  }
  
  const num = parseFloat(trimmed);
  
  if (isNaN(num)) {
    return { valid: false, error: 'Invalid number' };
  }
  
  if (num <= 0) {
    return { valid: false, error: 'Must be greater than 0' };
  }
  
  // Check divisibility (decimal places)
  const decimalPlaces = countDecimalPlaces(trimmed);
  if (decimalPlaces > divisibility) {
    if (divisibility === 0) {
      return { valid: false, error: 'Must be a whole number' };
    }
    return { valid: false, error: `Max ${divisibility} decimal places` };
  }
  
  // Check max amount only if provided (skip for OUT CAVE mode)
  if (maxAmount !== null) {
    const max = parseFloat(maxAmount);
    if (!isNaN(max) && num > max) {
      return { valid: false, error: 'Exceeds available balance' };
    }
  }
  
  return { valid: true };
}