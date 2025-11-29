/**
 * LocalStorage cache for persistent data (resource metadata)
 * Data survives browser refresh
 */

const CACHE_PREFIX = 'hypercave_';

export const cache = {
  /**
   * Get cached value if not expired
   * @param {string} key
   * @returns {any|null}
   */
  get(key) {
    try {
      const item = localStorage.getItem(CACHE_PREFIX + key);
      if (!item) return null;

      const { value, expiry } = JSON.parse(item);

      // If expiry is Infinity, never expire
      if (expiry !== Infinity && Date.now() > expiry) {
        localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }

      return value;
    } catch {
      return null;
    }
  },

  /**
   * Set cached value with TTL
   * @param {string} key 
   * @param {any} value 
   * @param {number} ttlMs - Time to live in milliseconds
   */
  set(key, value, ttlMs) {
    try {
      const item = {
        value,
        expiry: Date.now() + ttlMs
      };
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(item));
    } catch (e) {
      console.warn('Cache write failed:', e);
    }
  },

  /**
   * Remove specific key
   * @param {string} key 
   */
  remove(key) {
    localStorage.removeItem(CACHE_PREFIX + key);
  },

  /**
   * Clear all hypercave cache entries
   */
  clearAll() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        keys.push(key);
      }
    }
    keys.forEach(k => localStorage.removeItem(k));
  }
};


/**
 * In-memory session cache for transient data (account resources)
 * Data lost on browser refresh - suitable for frequently changing data
 */

export const sessionCache = {
  data: new Map(),

  /**
   * Get cached value if not expired
   * @param {string} key
   * @returns {any|null}
   */
  get(key) {
    const item = this.data.get(key);
    if (!item) return null;

    // If expiry is Infinity, never expire
    if (item.expiry !== Infinity && Date.now() > item.expiry) {
      this.data.delete(key);
      return null;
    }

    return item.value;
  },

  /**
   * Set cached value with TTL
   * @param {string} key 
   * @param {any} value 
   * @param {number} ttlMs - Time to live in milliseconds
   */
  set(key, value, ttlMs) {
    this.data.set(key, {
      value,
      expiry: Date.now() + ttlMs
    });
  },

  /**
   * Remove specific key
   * @param {string} key 
   */
  remove(key) {
    this.data.delete(key);
  },

  /**
   * Clear all session cache
   */
  clear() {
    this.data.clear();
  }
};

// NOTE: permanentResourceCache has been removed
// Token discovery now happens by querying the cave's KeyValueStore directly via the Gateway API
// See getAllCaveTokens() in gateway.js