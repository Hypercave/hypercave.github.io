import { CONFIG } from './config.js';
import { cache, sessionCache } from './cache.js';
import { shortenAddress } from './utils.js';

const rateLimiter = {
  tokens: CONFIG.rateLimit.maxRequests,
  lastRefill: Date.now(),
  
  async acquire() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    
    if (elapsed >= CONFIG.rateLimit.windowMs) {
      this.tokens = CONFIG.rateLimit.maxRequests;
      this.lastRefill = now;
    }
    
    if (this.tokens <= 0) {
      const waitTime = CONFIG.rateLimit.windowMs - elapsed;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.acquire();
    }
    
    this.tokens--;
    return true;
  }
};

/**
 * Make a rate-limited request to the Gateway API
 * @param {string} endpoint - API endpoint path
 * @param {object} body - Request body
 * @returns {Promise<object>} - Response JSON
 */
async function gatewayFetch(endpoint, body) {
  await rateLimiter.acquire();
  
  const response = await fetch(`${CONFIG.gatewayUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Gateway error: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Fetch current network status to get epoch
 * @returns {Promise<{epoch: number, round: number}>}
 */
export async function getNetworkStatus() {
  const data = await gatewayFetch('/status/gateway-status', {});
  
  return {
    epoch: data.ledger_state.epoch,
    round: data.ledger_state.round
  };
}

/**
 * Extract metadata values from Gateway response items
 * @param {Array} items - Metadata items array
 * @returns {object} - Key-value metadata
 */
function extractMetadata(items) {
  const result = {};
  
  for (const item of items) {
    const typedValue = item.value?.typed;
    if (typedValue && typedValue.value !== undefined) {
      result[item.key] = typedValue.value;
    }
  }
  
  return result;
}

/**
 * Fetch metadata for multiple resources (with caching)
 * Includes divisibility from fungible resource details
 * @param {string[]} addresses - Resource addresses
 * @returns {Promise<object>} - Map of address -> metadata
 */
export async function getResourceMetadata(addresses) {
  const results = {};
  const toFetch = [];
  
  for (const addr of addresses) {
    const cached = cache.get(`resource:${addr}`);
    if (cached) {
      results[addr] = cached;
    } else {
      toFetch.push(addr);
    }
  }
  
  if (toFetch.length > 0) {
    const data = await gatewayFetch('/state/entity/details', {
      addresses: toFetch,
      aggregation_level: 'Global',
      opt_ins: {
        explicit_metadata: ['name', 'symbol', 'icon_url', 'description']
      }
    });
    
    for (const item of data.items) {
      const meta = extractMetadata(item.explicit_metadata?.items || []);
      
      // Extract divisibility from fungible resource details
      let divisibility = 18; // Default for fungibles
      if (item.details?.type === 'FungibleResource') {
        divisibility = item.details.divisibility ?? 18;
      }
      
      const resourceData = {
        address: item.address,
        name: meta.name || shortenAddress(item.address, 15, 6),
        symbol: meta.symbol || '',
        iconUrl: meta.icon_url || null,
        description: meta.description || '',
        entityType: item.details?.type,
        divisibility
      };
      
      results[item.address] = resourceData;
      
      cache.set(
        `resource:${item.address}`, 
        resourceData, 
        CONFIG.cacheTtl.resourceMetadata
      );
    }
  }
  
  return results;
}

/**
 * Get all fungible resources for an account
 * @param {string} accountAddress 
 * @returns {Promise<Array>} - Array of fungible resource objects with divisibility
 */
export async function getAccountFungibles(accountAddress) {
  const cacheKey = `fungibles:${accountAddress}`;
  const cached = sessionCache.get(cacheKey);
  if (cached) return cached;
  
  const items = [];
  let cursor = null;
  
  do {
    const requestBody = {
      address: accountAddress,
      aggregation_level: 'Global'
    };
    
    if (cursor) {
      requestBody.cursor = cursor;
    }
    
    const data = await gatewayFetch('/state/entity/page/fungibles/', requestBody);
    
    for (const item of data.items) {
      items.push({
        resourceAddress: item.resource_address,
        amount: item.amount
      });
    }
    
    cursor = data.next_cursor;
  } while (cursor);
  
  const addresses = items.map(item => item.resourceAddress);
  const metadata = await getResourceMetadata(addresses);
  
  const result = items.map(item => ({
    ...item,
    ...metadata[item.resourceAddress]
  }));
  
  sessionCache.set(cacheKey, result, CONFIG.cacheTtl.accountResources);
  
  return result;
}

/**
 * Get all non-fungible resources for an account
 * @param {string} accountAddress 
 * @returns {Promise<Array>} - Array of NFT collection objects with IDs
 */
export async function getAccountNonFungibles(accountAddress) {
  const cacheKey = `nfts:${accountAddress}`;
  const cached = sessionCache.get(cacheKey);
  if (cached) return cached;
  
  const collections = [];
  let cursor = null;
  
  do {
    const requestBody = {
      address: accountAddress,
      aggregation_level: 'Vault',
      opt_ins: {
        non_fungible_include_nfids: true
      }
    };
    
    if (cursor) {
      requestBody.cursor = cursor;
    }
    
    const data = await gatewayFetch('/state/entity/page/non-fungibles/', requestBody);
    
    for (const item of data.items) {
      for (const vault of (item.vaults?.items || [])) {
        collections.push({
          resourceAddress: item.resource_address,
          vaultAddress: vault.vault_address,
          totalCount: vault.total_count,
          nfIds: vault.items || [],
          nextCursor: vault.next_cursor || null
        });
      }
    }
    
    cursor = data.next_cursor;
  } while (cursor);
  
  const uniqueAddresses = [...new Set(collections.map(c => c.resourceAddress))];
  const metadata = await getResourceMetadata(uniqueAddresses);
  
  const result = collections.map(collection => ({
    ...collection,
    ...metadata[collection.resourceAddress]
  }));
  
  sessionCache.set(cacheKey, result, CONFIG.cacheTtl.accountResources);
  
  return result;
}

/**
 * Get additional NFT IDs from a vault (for pagination)
 * @param {string} accountAddress 
 * @param {string} vaultAddress 
 * @param {string} resourceAddress 
 * @param {string} cursor 
 * @returns {Promise<{ids: string[], nextCursor: string|null}>}
 */
export async function getMoreNftIds(accountAddress, vaultAddress, resourceAddress, cursor) {
  const data = await gatewayFetch('/state/entity/page/non-fungible-vault/ids', {
    address: accountAddress,
    vault_address: vaultAddress,
    resource_address: resourceAddress,
    cursor
  });
  
  return {
    ids: data.items || [],
    nextCursor: data.next_cursor || null
  };
}

/**
 * Preview a transaction to query cave balances
 * Fetches current epoch and sets appropriate epoch window
 * @param {string} manifest - Transaction manifest string
 * @returns {Promise<object>} - Preview result with receipt
 */
export async function previewTransaction(manifest) {
  const status = await getNetworkStatus();
  const currentEpoch = status.epoch;
  
  const data = await gatewayFetch('/transaction/preview', {
    manifest,
    start_epoch_inclusive: currentEpoch,
    end_epoch_exclusive: currentEpoch + 2,
    tip_percentage: 0,
    nonce: Math.floor(Math.random() * 1000000),
    signer_public_keys: [],
    flags: {
      assume_all_signature_proofs: true,
      skip_epoch_check: false,
      use_free_credit: true
    }
  });
  
  return data;
}

/**
 * Parse balance values from transaction preview receipt
 * @param {object} receipt - Transaction receipt
 * @param {string[]} resourceAddresses - Addresses in same order as query
 * @returns {object} - Map of address -> balance string or null
 */
export function parseBalancesFromReceipt(receipt, resourceAddresses) {
  const balances = {};

  for (const addr of resourceAddresses) {
    balances[addr] = null;
  }

  try {
    if (receipt?.status !== 'Succeeded') {
      console.warn('Preview transaction failed:', receipt?.status);
      return balances;
    }

    const outputs = receipt.output || [];
    if (outputs.length === 0) return balances;

    const lastOutput = outputs[outputs.length - 1];
    const programmaticJson = lastOutput?.programmatic_json;

    if (!programmaticJson) return balances;

    const elements = programmaticJson.elements || programmaticJson.fields || [];

    for (let i = 0; i < resourceAddresses.length && i < elements.length; i++) {
      const element = elements[i];

      if (element.variant_id === '1' || element.variant_name === 'Some') {
        const decimalValue = element.fields?.[0]?.value;
        balances[resourceAddresses[i]] = decimalValue || '0';
      }
    }
  } catch (e) {
    console.error('Failed to parse balances from receipt:', e);
  }

  return balances;
}

/**
 * Get all unique resource addresses stored in the cave's KVS
 * The KVS keys are ResourceAddress values directly
 * Uses session cache to avoid repeated API calls
 * @returns {Promise<string[]>} - Array of unique resource addresses in cave
 */
export async function getAllCaveTokens() {
  const cacheKey = 'cave_tokens';

  // Check session cache first
  const cached = sessionCache.get(cacheKey);
  if (cached) {
    console.log('Using cached cave tokens:', cached);
    return cached;
  }

  const resourceAddresses = new Set();
  let cursor = null;

  try {
    do {
      const requestBody = {
        key_value_store_address: CONFIG.caveKvsAddress,
        limit_per_page: 100
      };

      if (cursor) {
        requestBody.cursor = cursor;
      }

      const data = await gatewayFetch('/state/key-value-store/keys', requestBody);

      // Parse each key to extract resource addresses
      for (const item of data.items || []) {
        try {
          // The key is directly a ResourceAddress
          const keyData = item.key?.programmatic_json;

          if (keyData && keyData.kind === 'Reference' && keyData.type_name === 'ResourceAddress') {
            if (keyData.value) {
              resourceAddresses.add(keyData.value);
            }
          }
        } catch (e) {
          console.warn('Failed to parse KVS key:', e);
        }
      }

      cursor = data.next_cursor;
    } while (cursor);

    const result = Array.from(resourceAddresses);
    console.log('Found tokens in cave:', result);

    // Cache for the session (invalidated after IN CAVE transactions)
    sessionCache.set(cacheKey, result, CONFIG.cacheTtl.accountResources);

    return result;
  } catch (e) {
    console.error('Failed to fetch cave tokens from KVS:', e);
    return [];
  }
}