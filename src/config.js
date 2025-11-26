export const CONFIG = {
  // Network settings
  network: 'stokenet',
  networkId: 2,
  
  // Gateway API endpoint
  gatewayUrl: 'https://stokenet.radixdlt.com',
  
  // Replace with your deployed Hypercave component address
  componentAddress: 'component_tdx_2_1cq6msn5wndhnjg8aa256fc6mvhjp9u27kxfjy77lvl4pr43sgex6p2',
  
  // Replace with your dApp definition account address
  dAppDefinitionAddress: 'account_tdx_2_12ypnf68metvh2jgfp9zd4asc3aha0agjdmnxdzev2pczxl6hz5d20m',
  
  // Cache time-to-live settings (milliseconds)
  cacheTtl: {
    // Resource metadata rarely changes - cache indefinitely (manual invalidation only)
    resourceMetadata: Infinity,
    // Account balances - cache indefinitely, invalidate after transactions only
    accountResources: Infinity,
  },
  
  // Rate limiting for Gateway API calls
  rateLimit: {
    maxRequests: 10,
    windowMs: 1000
  }
};

// For mainnet deployment, change to:
// networkId: 1,
// gatewayUrl: 'https://mainnet.radixdlt.com',
// XRD: 'resource_rdx1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxradxrd'