import { 
  RadixDappToolkit, 
  RadixNetwork, 
  DataRequestBuilder 
} from '@radixdlt/radix-dapp-toolkit';

import { CONFIG } from './config.js';
import { sessionCache } from './cache.js';
import {
  getAccountFungibles,
  getAccountNonFungibles,
  getResourceMetadata,
  previewTransaction,
  parseBalancesFromReceipt,
  getAllCaveTokens
} from './gateway.js';
import { 
  buildInCaveManifest, 
  buildOutCaveManifest,
  buildLookCaveManifest 
} from './manifests.js';
import { ModalUI, setStatus, hideStatus } from './ui.js';

// Global state
let rdt = null;
let currentAccount = null;
let allAccounts = [];
let modalUI = null;

// DOM elements
let btnInCave = null;
let btnLookCave = null;
let btnOutCave = null;
let accountSelector = null;
let accountSelectorBtn = null;
let currentAccountText = null;
let accountDropdown = null;

/**
 * Initialize the application
 */
async function init() {
  // Cache DOM elements
  btnInCave = document.getElementById('btn-in-cave');
  btnLookCave = document.getElementById('btn-look-cave');
  btnOutCave = document.getElementById('btn-out-cave');
  accountSelector = document.getElementById('account-selector');
  accountSelectorBtn = document.getElementById('account-selector-btn');
  currentAccountText = document.getElementById('current-account-text');
  accountDropdown = document.getElementById('account-dropdown');

  // Initialize Radix dApp Toolkit
  rdt = RadixDappToolkit({
    networkId: RadixNetwork.Stokenet,
    applicationName: 'Hypercave',
    applicationVersion: '1.0.0',
    applicationDappDefinitionAddress: CONFIG.dAppDefinitionAddress
  });

  // After rdt = RadixDappToolkit(...)
  rdt.buttonApi.setTheme('radix-blue');

  // Configure what data to request from wallet on connect
  rdt.walletApi.setRequestData(
    DataRequestBuilder.accounts().atLeast(1)
  );

  // Subscribe to wallet connection state changes
  rdt.walletApi.walletData$.subscribe((walletData) => {
    console.log('Wallet data updated:', walletData);

    if (walletData.accounts && walletData.accounts.length > 0) {
      allAccounts = walletData.accounts;

      // If no account is selected or current account not in list, select first
      if (!currentAccount || !allAccounts.find(acc => acc.address === currentAccount.address)) {
        currentAccount = allAccounts[0];
      }

      updateAccountSelector();
      onAccountConnected();
    } else {
      allAccounts = [];
      currentAccount = null;
      updateAccountSelector();
      onAccountDisconnected();
    }
  });

  // Initialize modal UI
  modalUI = new ModalUI();
  modalUI.onSubmit = handleTransaction;
  modalUI.onLookup = handleLookup;

  // Bind button click events
  btnInCave.addEventListener('click', () => openModal('in'));
  btnLookCave.addEventListener('click', () => openModal('look'));
  btnOutCave.addEventListener('click', () => openModal('out'));

  // Bind account selector events
  accountSelectorBtn.addEventListener('click', () => toggleAccountDropdown());

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!accountSelector.contains(e.target)) {
      accountDropdown.classList.add('hidden');
    }
  });

  console.log('Hypercave initialized');
}

/**
 * Update the account selector UI
 */
function updateAccountSelector() {
  if (!currentAccount || allAccounts.length === 0) {
    // Hide selector when no accounts
    accountSelector.classList.add('hidden');
    currentAccountText.textContent = 'NO ACCOUNT';
    return;
  }

  // Show selector when accounts are connected
  accountSelector.classList.remove('hidden');

  // Update current account display with label/name
  const accountIndex = allAccounts.findIndex(acc => acc.address === currentAccount.address);
  const accountName = currentAccount.label || `ACCOUNT ${accountIndex + 1}`;
  currentAccountText.textContent = accountName;

  // Render account dropdown
  renderAccountDropdown();
}

/**
 * Toggle the account dropdown visibility
 */
function toggleAccountDropdown() {
  accountDropdown.classList.toggle('hidden');
}

/**
 * Render the account dropdown list
 */
function renderAccountDropdown() {
  if (allAccounts.length === 0) {
    accountDropdown.innerHTML = '<div class="account-dropdown-empty">NO ACCOUNT</div>';
    return;
  }

  let html = '';

  allAccounts.forEach((account, index) => {
    const isSelected = currentAccount && account.address === currentAccount.address;
    const selectedClass = isSelected ? 'selected' : '';
    const label = account.label || `ACCOUNT ${index + 1}`;
    const address = account.address;

    html += `
      <div class="account-dropdown-item ${selectedClass}" data-address="${address}">
        <div>
          <div class="account-label">${label}</div>
          <div class="account-address">${address}</div>
        </div>
      </div>
    `;
  });

  accountDropdown.innerHTML = html;

  // Bind click events to switch accounts
  accountDropdown.querySelectorAll('.account-dropdown-item').forEach(el => {
    el.addEventListener('click', () => {
      const address = el.dataset.address;
      selectAccount(address);
    });
  });
}

/**
 * Select a specific account by address
 */
function selectAccount(address) {
  const account = allAccounts.find(acc => acc.address === address);
  if (!account) return;

  currentAccount = account;

  // Update UI
  updateAccountSelector();

  // Close dropdown
  accountDropdown.classList.add('hidden');

  // Clear caches as we've switched accounts
  sessionCache.clear();

  console.log('Switched to account:', currentAccount.address);
}

/**
 * Called when wallet connects and shares an account
 */
function onAccountConnected() {
  // Enable action buttons
  btnInCave.disabled = false;
  btnLookCave.disabled = false;
  btnOutCave.disabled = false;


  // Clear any stale session cache
  sessionCache.clear();
}

/**
 * Called when wallet disconnects
 */
function onAccountDisconnected() {
  // Disable action buttons
  btnInCave.disabled = true;
  btnLookCave.disabled = true;
  btnOutCave.disabled = true;
  
  // Clear state
  currentAccount = null;
  sessionCache.clear();
  
  // Hide modal if open
  if (modalUI) {
    modalUI.hide();
  }
  
  hideStatus();
}

/**
 * Open the modal for a specific operation
 * @param {string} mode - 'in', 'out', or 'look'
 */
async function openModal(mode) {
  if (!currentAccount) {
    setStatus('ME NEED WALLET!', 'error');
    return;
  }
  
  setStatus('LOOK FOR STUFF...', 'info');
  
  try {
    let fungibles = [];
    let nftCollections = [];
    
    if (mode === 'in') {
      // IN CAVE: Load user account resources
      [fungibles, nftCollections] = await Promise.all([
        getAccountFungibles(currentAccount.address),
        getAccountNonFungibles(currentAccount.address)
      ]);
      
      // Validate we have NFTs (required for all operations)
      if (nftCollections.length === 0) {
        setStatus('NO NFT! ME NEED NFT USE CAVE.', 'error');
        return;
      }
      
    } else {
      // OUT CAVE & LOOK CAVE: Load all tokens from cave KVS + NFTs from account
      nftCollections = await getAccountNonFungibles(currentAccount.address);

      // Validate we have NFTs
      if (nftCollections.length === 0) {
        setStatus('NO NFT! ME NEED NFT USE CAVE.', 'error');
        return;
      }

      // Query all unique resource addresses stored in the cave
      const resourceAddresses = await getAllCaveTokens();

      // Fetch metadata for all discovered tokens
      const metadata = await getResourceMetadata(resourceAddresses);

      // Convert to fungibles format
      fungibles = resourceAddresses.map(address => ({
        resourceAddress: address,
        symbol: metadata[address]?.symbol || metadata[address]?.name || 'UNKNOWN',
        iconUrl: metadata[address]?.iconUrl || null,
        name: metadata[address]?.name || '',
        amount: '0' // Not relevant for OUT/LOOK
      }));
    }
    
    hideStatus();
    modalUI.show(mode, nftCollections, fungibles);
    
  } catch (error) {
    console.error('Failed to load account data:', error);
    setStatus(`ME NO FIND DATA: ${error.message}`, 'error');
  }
}

/**
 * Handle IN CAVE or OUT CAVE transaction submission
 * @param {object} data - Transaction data from modal
 */
async function handleTransaction(data) {
  if (!currentAccount || !data.nft || data.resources.length === 0) {
    return;
  }
  
  const { mode, nft, resources } = data;
  
  modalUI.setLoading(true);
  
  try {
    // Build the appropriate manifest
    let manifest;
    
    if (mode === 'in') {
      manifest = buildInCaveManifest(
        currentAccount.address,
        nft.collection,
        nft.id,
        resources.map(r => ({
          resourceAddress: r.resourceAddress,
          amount: r.amount
        }))
      );
    } else if (mode === 'out') {
      manifest = buildOutCaveManifest(
        currentAccount.address,
        nft.collection,
        nft.id,
        resources.map(r => ({
          resourceAddress: r.resourceAddress,
          amount: r.amount
        }))
      );
    } else {
      throw new Error('Invalid mode for transaction');
    }
    
    console.log('Submitting transaction:', manifest);
    
    // Send transaction to wallet for signing
    const result = await rdt.walletApi.sendTransaction({
      transactionManifest: manifest,
      message: mode === 'in' ? 'PUT IN CAVE' : 'TAKE FROM CAVE'
    });
    
    if (result.isErr()) {
      throw new Error(result.error.message || 'ME NO DO! YOU SAY NO!');
    }
    
    // Success - update UI cache if IN CAVE
    if (mode === 'in') {
      console.log('IN CAVE transaction successful');

      // Update cave balances if we've looked them up
      for (const resource of resources) {
        modalUI.updateCaveBalance(resource.resourceAddress, resource.amount, {
          symbol: resource.symbol,
          name: resource.symbol,
          iconUrl: resource.iconUrl
        });
      }

      // Invalidate account caches (balances changed)
      sessionCache.remove(`fungibles:${currentAccount.address}`);
      sessionCache.remove(`nfts:${currentAccount.address}`);
      // Invalidate cave tokens cache (new tokens may have been added)
      sessionCache.remove('cave_tokens');
      console.log('Invalidated account and cave tokens cache after IN CAVE transaction');
    } else if (mode === 'out') {
      // Update cave balances by subtracting the amounts taken out
      for (const resource of resources) {
        modalUI.updateCaveBalance(resource.resourceAddress, `-${resource.amount}`, {
          symbol: resource.symbol,
          name: resource.symbol,
          iconUrl: resource.iconUrl
        });
      }

      // Invalidate only account fungibles cache (balances changed)
      sessionCache.remove(`fungibles:${currentAccount.address}`);
      sessionCache.remove(`nfts:${currentAccount.address}`);
      console.log('Invalidated account cache after OUT CAVE transaction');
    }

    // Close modal (don't clear all cache, only specific keys were invalidated)
    modalUI.hide();
    
    // No success message shown on main page - removed setStatus call
    console.log('Transaction successful:', result.value.transactionIntentHash);
    
  } catch (error) {
    console.error('Transaction failed:', error);
    setStatus(`ME NO DO! ${error.message}`, 'error');
  } finally {
    modalUI.setLoading(false);
  }
}

/**
 * Handle LOOK CAVE balance query
 * @param {object} data - Query data from modal
 */
async function handleLookup(data) {
  if (!currentAccount || !data.nft || data.resources.length === 0) {
    return;
  }
  
  const { nft, resources } = data;
  const resourceAddresses = resources.map(r => r.resourceAddress);
  
  modalUI.setLoading(true);
  modalUI.showBalancesLoading();
  
  try {
    // Build preview manifest
    const manifest = buildLookCaveManifest(
      currentAccount.address,
      nft.collection,
      nft.id,
      resourceAddresses
    );
    
    console.log('Previewing transaction:', manifest);
    
    // Execute preview
    const previewResult = await previewTransaction(manifest);
    
    console.log('Preview result:', previewResult);
    
    // Parse balances from receipt
    const balances = parseBalancesFromReceipt(previewResult.receipt, resourceAddresses);
    
    // Get metadata for display
    const metadata = await getResourceMetadata(resourceAddresses);
    
    // Render results
    modalUI.renderBalances(balances, metadata);
    
  } catch (error) {
    console.error('Balance lookup failed:', error);
    modalUI.showBalancesError(`ME NO SEE: ${error.message}`);
  } finally {
    modalUI.setLoading(false);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}