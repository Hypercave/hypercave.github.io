import { 
  debounce, 
  escapeHtml, 
  formatAmount, 
  formatNftId, 
  getIconUrl, 
  parseNftLocalId,
  truncateToDecimals,
  validateAmount 
} from './utils.js';

/**
 * Modal UI Controller
 * Handles all modal interactions for IN/OUT/LOOK CAVE operations
 */
export class ModalUI {
  constructor() {
    this.modal = document.getElementById('modal');
    this.modalTitle = document.getElementById('modal-title');
    this.closeBtn = document.getElementById('modal-close');
    this.submitBtn = document.getElementById('btn-submit');
    
    this.nftSearch = document.getElementById('nft-search');
    this.nftDropdown = document.getElementById('nft-dropdown');
    this.selectedNft = document.getElementById('selected-nft');
    
    this.resourceSection = document.getElementById('resource-section');
    this.resourceSectionTitle = document.getElementById('resource-section-title');
    this.resourceSearch = document.getElementById('resource-search');
    this.resourceDropdown = document.getElementById('resource-dropdown');
    this.selectedResources = document.getElementById('selected-resources');
    
    this.balancesSection = document.getElementById('balances-section');
    this.balancesSectionTitle = document.getElementById('balances-section-title');
    this.caveBalancesElement = document.getElementById('cave-balances');
    
    this.mode = null;
    this.nftCollections = [];
    this.fungibles = [];
    this.selectedNftData = null;
    this.selectedResourcesList = [];
    this.hasLookedUp = false;
    this.caveBalancesData = {}; // Store cave balances data
    this.caveResourceMetadata = {}; // Store resource metadata for cave balances

    this.onSubmit = null;
    this.onLookup = null;
    
    this.bindEvents();
  }
  
  bindEvents() {
    this.closeBtn.addEventListener('click', () => this.hide());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.hide();
    });
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.modal.classList.contains('hidden')) {
        this.hide();
      }
    });
    
    this.nftSearch.addEventListener('input', debounce(() => this.filterNfts(), 200));
    this.nftSearch.addEventListener('focus', () => this.showNftDropdown());
    
    this.resourceSearch.addEventListener('input', debounce(() => this.filterResources(), 200));
    this.resourceSearch.addEventListener('focus', () => this.showResourceDropdown());
    
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#nft-search') && !e.target.closest('#nft-dropdown')) {
        this.nftDropdown.classList.add('hidden');
      }
      if (!e.target.closest('#resource-search') && !e.target.closest('#resource-dropdown')) {
        this.resourceDropdown.classList.add('hidden');
      }
    });
    
    this.submitBtn.addEventListener('click', () => this.handleSubmit());
  }
  
  /**
   * Show the modal for a specific operation
   * @param {string} mode - 'in', 'out', or 'look'
   * @param {Array} nftCollections - Available NFT collections
   * @param {Array} fungibles - Available fungible resources (with divisibility)
   */
  show(mode, nftCollections, fungibles) {
    this.mode = mode;
    this.nftCollections = nftCollections;
    this.fungibles = fungibles;
    // Keep selectedNftData persistent across modes (do not reset to null)
    this.selectedResourcesList = [];

    // Only clear cave balances and metadata for LOOK mode (fresh lookup)
    // Preserve balances for IN and OUT modes so we can track changes
    if (mode === 'look') {
      this.hasLookedUp = false;
      this.caveBalancesData = {};
      this.caveResourceMetadata = {};
    }

    switch (mode) {
      case 'in':
        this.modalTitle.textContent = 'PUT IN CAVE';
        this.resourceSectionTitle.textContent = 'WHAT PUT IN?';
        this.submitBtn.textContent = 'PUT NOW';
        this.resourceSection.classList.remove('hidden');
        // Show wallet balances if we have fungibles data (IN mode loads real wallet data)
        if (this.fungibles && this.fungibles.length > 0) {
          this.balancesSectionTitle.textContent = 'WHAT IN ACCOUNT';
          this.balancesSection.classList.remove('hidden');
          this.renderWalletBalancesDisplay(); // Show wallet balances
        } else {
          this.balancesSectionTitle.textContent = ''; // Clear title
          this.balancesSection.classList.add('hidden');
          this.caveBalancesElement.innerHTML = ''; // Clear content
        }
        break;

      case 'out':
        this.modalTitle.textContent = 'TAKE FROM CAVE';
        this.resourceSectionTitle.textContent = 'WHAT TAKE OUT?';
        this.submitBtn.textContent = 'TAKE NOW';
        this.resourceSection.classList.remove('hidden');
        // Show CAVE balances ONLY if we have data from a previous LOOK CAVE
        if (this.hasLookedUp && Object.keys(this.caveBalancesData).length > 0) {
          this.balancesSectionTitle.textContent = 'WHAT IN CAVE';
          this.balancesSection.classList.remove('hidden');
          this.renderBalancesDisplay(); // Re-render cave balances with click handlers
        } else {
          this.balancesSectionTitle.textContent = ''; // Clear title - don't show anything until LOOK CAVE
          this.balancesSection.classList.add('hidden');
          this.caveBalancesElement.innerHTML = ''; // Clear content
        }
        break;

      case 'look':
        this.modalTitle.textContent = 'LOOK IN CAVE';
        this.resourceSectionTitle.textContent = 'WHAT ME LOOK?';
        this.submitBtn.textContent = 'LOOK NOW';
        this.resourceSection.classList.remove('hidden');
        // Never show balances in LOOK mode until LOOK CAVE completes
        this.balancesSectionTitle.textContent = ''; // Clear title
        this.balancesSection.classList.add('hidden');
        this.caveBalancesElement.innerHTML = ''; // Clear content
        break;
    }

    this.nftSearch.value = '';
    this.resourceSearch.value = '';
    // Show the selected NFT if one exists, otherwise hide it
    if (this.selectedNftData) {
      this.selectedNft.innerHTML = `
        <img src="${getIconUrl(this.selectedNftData.iconUrl)}" alt="" onerror="this.style.visibility='hidden'">
        <div class="info">
          <div class="name">${escapeHtml(this.selectedNftData.name)}</div>
          <div class="sub">${escapeHtml(formatNftId(this.selectedNftData.id))}</div>
        </div>
      `;
      this.selectedNft.classList.remove('hidden');
    } else {
      this.selectedNft.classList.add('hidden');
    }
    this.selectedResources.innerHTML = '';

    this.updateSubmitButton();
    this.modal.classList.remove('hidden');
  }
  
  hide() {
    this.modal.classList.add('hidden');
    this.nftDropdown.classList.add('hidden');
    this.resourceDropdown.classList.add('hidden');
  }
  
  showNftDropdown() {
    this.renderNftDropdown(this.nftCollections);
    this.nftDropdown.classList.remove('hidden');
  }
  
  filterNfts() {
    const query = this.nftSearch.value.toLowerCase().trim();
    
    if (!query) {
      this.renderNftDropdown(this.nftCollections);
    } else {
      const filtered = this.nftCollections.filter(c =>
        (c.name || '').toLowerCase().includes(query) ||
        (c.symbol || '').toLowerCase().includes(query) ||
        c.resourceAddress.toLowerCase().includes(query)
      );
      this.renderNftDropdown(filtered);
    }
    
    this.nftDropdown.classList.remove('hidden');
  }
  
  renderNftDropdown(collections) {
    if (collections.length === 0) {
      this.nftDropdown.innerHTML = '<div class="dropdown-empty">NO NFT HERE</div>';
      return;
    }
    
    let html = '';
    
    for (const collection of collections) {
      const idsToShow = collection.nfIds.slice(0, 5);
      
      for (const id of idsToShow) {
        const nftId = parseNftLocalId(id);
        const displayId = formatNftId(id);
        
        html += `
          <div class="dropdown-item" 
               data-collection="${escapeHtml(collection.resourceAddress)}" 
               data-id="${escapeHtml(nftId)}"
               data-name="${escapeHtml(collection.name || '')}"
               data-icon="${escapeHtml(collection.iconUrl || '')}">
            <img src="${getIconUrl(collection.iconUrl)}" alt="" onerror="this.style.visibility='hidden'">
            <div class="info">
              <div class="name">${escapeHtml(collection.name || 'NO NAME NFT')}</div>
              <div class="sub">${escapeHtml(displayId)}</div>
            </div>
          </div>
        `;
      }
      
      if (collection.totalCount > 5) {
        html += `
          <div class="dropdown-item" style="opacity: 0.6; cursor: default;">
            <div class="info">
              <div class="sub">+ ${collection.totalCount - 5} MORE IN ${escapeHtml(collection.name || 'PILE')}</div>
            </div>
          </div>
        `;
      }
    }
    
    this.nftDropdown.innerHTML = html;
    
    this.nftDropdown.querySelectorAll('.dropdown-item[data-collection]').forEach(el => {
      el.addEventListener('click', () => {
        this.selectNft(
          el.dataset.collection,
          el.dataset.id,
          el.dataset.name,
          el.dataset.icon
        );
      });
    });
  }
  
  selectNft(collection, id, name, iconUrl) {
    this.selectedNftData = {
      collection,
      id,
      name: name || 'NO NAME',
      iconUrl: iconUrl || null
    };
    
    this.selectedNft.innerHTML = `
      <img src="${getIconUrl(iconUrl)}" alt="" onerror="this.style.visibility='hidden'">
      <div class="info">
        <div class="name">${escapeHtml(this.selectedNftData.name)}</div>
        <div class="sub">${escapeHtml(formatNftId(id))}</div>
      </div>
    `;
    this.selectedNft.classList.remove('hidden');
    
    this.nftDropdown.classList.add('hidden');
    this.nftSearch.value = '';
    
    this.updateSubmitButton();
  }
  
  showResourceDropdown() {
    this.renderResourceDropdown(this.fungibles);
    this.resourceDropdown.classList.remove('hidden');
  }
  
  filterResources() {
    const query = this.resourceSearch.value.toLowerCase().trim();
    
    if (!query) {
      this.renderResourceDropdown(this.fungibles);
    } else {
      const filtered = this.fungibles.filter(f =>
        (f.symbol || '').toLowerCase().includes(query) ||
        (f.name || '').toLowerCase().includes(query) ||
        f.resourceAddress.toLowerCase().includes(query)
      );
      this.renderResourceDropdown(filtered);
    }
    
    this.resourceDropdown.classList.remove('hidden');
  }
  
  renderResourceDropdown(fungibles) {
    const selectedAddresses = new Set(this.selectedResourcesList.map(r => r.resourceAddress));
    const available = fungibles.filter(f => !selectedAddresses.has(f.resourceAddress));
    
    if (available.length === 0) {
      this.resourceDropdown.innerHTML = '<div class="dropdown-empty">NO TOKEN HERE</div>';
      return;
    }
    
    let html = '';

    for (const f of available) {
      const tokenName = f.name || f.symbol || 'UNKNOWN TOKEN';
      const tokenTicker = f.symbol || '';
      const balanceText = this.mode === 'in' ? formatAmount(f.amount) : '';

      html += `
        <div class="dropdown-item" data-address="${escapeHtml(f.resourceAddress)}">
          <img src="${getIconUrl(f.iconUrl)}" alt="" onerror="this.style.visibility='hidden'">
          <div class="info">
            <div class="name">${escapeHtml(tokenName)}</div>
            <div class="sub">${escapeHtml(tokenTicker)}</div>
            ${balanceText ? `<div class="balance">HAVE: ${escapeHtml(balanceText)}</div>` : ''}
          </div>
        </div>
      `;
    }
    
    this.resourceDropdown.innerHTML = html;
    
    this.resourceDropdown.querySelectorAll('.dropdown-item').forEach(el => {
      el.addEventListener('click', () => {
        this.addResource(el.dataset.address);
      });
    });
  }
  
  addResource(address) {
    const data = this.fungibles.find(f => f.resourceAddress === address);
    if (!data) return;

    const resource = {
      resourceAddress: address,
      amount: '',
      maxAmount: data.amount,
      divisibility: data.divisibility ?? 18,
      symbol: data.symbol || data.name || 'NO NAME',
      name: data.name || '',
      iconUrl: data.iconUrl
    };

    this.selectedResourcesList.push(resource);
    this.renderSelectedResources();

    this.resourceDropdown.classList.add('hidden');
    this.resourceSearch.value = '';

    this.updateSubmitButton();
  }

  addResourceFromBalance(address) {
    // Check if already selected
    if (this.selectedResourcesList.some(r => r.resourceAddress === address)) {
      return; // Already selected
    }

    // Get metadata from cave resource metadata
    const meta = this.caveResourceMetadata[address] || {};

    // Try to find in fungibles list for additional info
    const fungibleData = this.fungibles.find(f => f.resourceAddress === address);

    // Prefer metadata from cave resource metadata, fallback to fungibles list
    let displaySymbol = meta.symbol || fungibleData?.symbol || meta.name || fungibleData?.name || 'NO NAME';
    let displayName = meta.name || fungibleData?.name || '';
    let displayIcon = meta.iconUrl || fungibleData?.iconUrl;

    const resource = {
      resourceAddress: address,
      amount: '',
      maxAmount: this.caveBalancesData[address] || '0',
      divisibility: fungibleData?.divisibility ?? meta.divisibility ?? 18,
      symbol: displaySymbol,
      name: displayName,
      iconUrl: displayIcon
    };

    this.selectedResourcesList.push(resource);
    this.renderSelectedResources();

    this.updateSubmitButton();
  }
  
  formatInputDisplay(value) {
    if (!value || value === '') return '';

    // Preserve trailing decimal point
    if (value.endsWith('.')) {
      const integerPart = value.slice(0, -1);
      if (integerPart === '') return '0.';
      const num = parseFloat(integerPart);
      if (isNaN(num)) return value;
      return num.toLocaleString(undefined, { maximumFractionDigits: 0 }) + '.';
    }

    // Check if we have a decimal part
    if (value.includes('.')) {
      const parts = value.split('.');
      const integerPart = parts[0];
      const decimalPart = parts[1];

      const num = parseFloat(integerPart);
      if (isNaN(num)) return value;

      const formattedInteger = num.toLocaleString(undefined, { maximumFractionDigits: 0 });
      return formattedInteger + '.' + decimalPart;
    }

    // No decimal point, just format the number
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  renderSelectedResources() {
    if (this.selectedResourcesList.length === 0) {
      this.selectedResources.innerHTML = '';
      return;
    }
    
    let html = '';
    
    for (let i = 0; i < this.selectedResourcesList.length; i++) {
      const r = this.selectedResourcesList[i];
      const showAmountInput = this.mode !== 'look';
      
      // For OUT mode: show cave balance if available, otherwise show hint
      let balanceDisplay = '';
      if (this.mode === 'out') {
        const caveBalance = this.caveBalancesData[r.resourceAddress];
        if (caveBalance !== undefined && caveBalance !== null) {
          balanceDisplay = `IN CAVE: ${formatAmount(caveBalance)}`;
        } else {
          balanceDisplay = 'LOOK CAVE TO KNOW';
        }
      } else if (this.mode === 'in') {
        const divisibilityHint = r.divisibility === 0 ? ' (WHOLE ONLY)' : '';
        balanceDisplay = `HAVE: ${formatAmount(r.maxAmount)}${divisibilityHint}`;
      }
      
      const addressShort = r.resourceAddress.slice(0, 20) + '...';
      
      // Show ALL button only for OUT mode when we know the cave balance
      const showAllButton = this.mode === 'out' && this.caveBalancesData[r.resourceAddress] !== undefined && this.caveBalancesData[r.resourceAddress] !== null;
      
      // Format the amount for display in the input field
      const displayAmount = r.amount ? formatAmount(r.amount, r.divisibility) : '';

      const tokenName = r.name || r.symbol || 'UNKNOWN';
      const tokenTicker = r.symbol || '';

      html += `
        <div class="resource-item" data-index="${i}">
          <img src="${getIconUrl(r.iconUrl)}" alt="" onerror="this.style.visibility='hidden'">
          <div class="info">
            <div class="name">${escapeHtml(tokenName)}</div>
            <div class="sub" style="opacity: 0.7;">${escapeHtml(tokenTicker)}</div>
            ${showAmountInput ? `<div class="balance">${escapeHtml(balanceDisplay)}</div>` : `<div class="sub">${escapeHtml(addressShort)}</div>`}
          </div>
          ${showAmountInput ? `
            ${showAllButton ? `<button class="max-btn" data-index="${i}">ALL</button>` : ''}
            ${this.mode === 'in' ? `<button class="max-btn" data-index="${i}">ALL</button>` : ''}
            <input type="text"
                   value="${escapeHtml(displayAmount)}"
                   placeholder="0"
                   data-index="${i}"
                   data-divisibility="${r.divisibility}"
                   inputmode="decimal">
          ` : ''}
          <button class="remove-btn" data-index="${i}">×</button>
        </div>
      `;
    }
    
    this.selectedResources.innerHTML = html;
    
    this.selectedResources.querySelectorAll('input[type="text"]').forEach(el => {
      el.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const divisibility = parseInt(e.target.dataset.divisibility, 10);
        let value = e.target.value;

        // Remove all commas from input (restrict manual comma entry)
        const cleanValue = value.replace(/,/g, '');

        // Truncate to allowed decimal places
        const truncated = truncateToDecimals(cleanValue, divisibility);

        // Store the raw value without commas
        this.selectedResourcesList[idx].amount = truncated;

        // Format for display with comma separators
        const formatted = this.formatInputDisplay(truncated);
        e.target.value = formatted;

        // Validate and apply visual feedback
        const resource = this.selectedResourcesList[idx];
        let maxAmount = null;

        if (this.mode === 'out') {
          // For OUT mode, check against cave balance if known
          const caveBalance = this.caveBalancesData[resource.resourceAddress];
          maxAmount = (caveBalance !== undefined && caveBalance !== null) ? caveBalance : null;
        } else if (this.mode === 'in') {
          // For IN mode, check against wallet balance
          maxAmount = resource.maxAmount;
        }

        const validation = validateAmount(truncated, maxAmount, divisibility);

        // Toggle invalid class based on validation
        if (validation.valid) {
          e.target.classList.remove('invalid');
        } else {
          e.target.classList.add('invalid');
        }

        // Use requestAnimationFrame to ensure DOM is updated before validation
        requestAnimationFrame(() => {
          this.updateSubmitButton();
        });
      });
    });
    
    this.selectedResources.querySelectorAll('.max-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const resource = this.selectedResourcesList[idx];
        
        // For OUT mode, use cave balance; for IN mode, use wallet balance
        let maxAmount;
        if (this.mode === 'out') {
          maxAmount = this.caveBalancesData[resource.resourceAddress] || '0';
        } else {
          maxAmount = resource.maxAmount;
        }
        
        resource.amount = truncateToDecimals(maxAmount, resource.divisibility);
        this.renderSelectedResources();
        this.updateSubmitButton();
      });
    });
    
    this.selectedResources.querySelectorAll('.remove-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        this.selectedResourcesList.splice(idx, 1);
        this.renderSelectedResources();
        this.updateSubmitButton();
      });
    });
  }
  
  showBalancesLoading() {
    this.balancesSection.classList.remove('hidden');
    this.caveBalancesElement.innerHTML = '<div class="balance-loading"><span class="loading"></span> ME LOOK...</div>';
  }
  
  renderBalances(balances, resourceMetadata) {
    this.hasLookedUp = true;
    this.caveBalancesData = balances; // Store for ALL button

    // Merge new metadata with existing metadata to preserve all resources
    this.caveResourceMetadata = { ...this.caveResourceMetadata, ...resourceMetadata };

    this.balancesSectionTitle.textContent = 'WHAT IN CAVE';
    this.balancesSection.classList.remove('hidden');

    // Re-render selected resources to show ALL button
    this.renderSelectedResources();

    // Render the bottom balances display
    this.renderBalancesDisplay();
  }

  renderBalancesDisplay() {
    if (!this.caveBalancesData || Object.keys(this.caveBalancesData).length === 0) {
      this.caveBalancesElement.innerHTML = '<div class="balance-placeholder">NO TOKEN IN CAVE</div>';
      return;
    }

    let html = '';

    for (const [address, amount] of Object.entries(this.caveBalancesData)) {
      const meta = this.caveResourceMetadata[address] || {};
      const tokenName = meta.name || meta.symbol || 'UNKNOWN TOKEN';
      const tokenTicker = meta.symbol || '';
      const isZero = amount === null || amount === '0' || parseFloat(amount) === 0;

      // Make clickable ONLY in OUT mode and not zero (not in LOOK mode)
      const isClickable = this.mode === 'out' && !isZero;
      const clickableClass = isClickable ? 'clickable' : '';
      const clickableAttr = isClickable ? `data-address="${escapeHtml(address)}"` : '';

      html += `
        <div class="balance-item ${clickableClass}" ${clickableAttr}>
          <img src="${getIconUrl(meta.iconUrl)}" alt="" onerror="this.style.visibility='hidden'">
          <div class="token-info">
            <div class="name">${escapeHtml(tokenName)}</div>
            <div class="ticker" style="opacity: 0.7; font-size: 0.9em;">${escapeHtml(tokenTicker)}</div>
          </div>
          <span class="amount ${isZero ? 'zero' : ''}">
            ${amount === null ? 'NO TOKEN' : formatAmount(amount)}
          </span>
        </div>
      `;
    }

    this.caveBalancesElement.innerHTML = html;

    // Add click handlers ONLY for OUT mode (not LOOK mode)
    if (this.mode === 'out') {
      this.caveBalancesElement.querySelectorAll('.balance-item.clickable').forEach(el => {
        el.addEventListener('click', () => {
          const address = el.dataset.address;
          if (address) {
            this.addResourceFromBalance(address);
          }
        });
      });
    }
  }

  renderWalletBalancesDisplay() {
    if (!this.fungibles || this.fungibles.length === 0) {
      this.caveBalancesElement.innerHTML = '<div class="balance-placeholder">NO TOKEN IN WALLET</div>';
      return;
    }

    let html = '';

    for (const fungible of this.fungibles) {
      const displayName = fungible.symbol || fungible.name || 'NO NAME';
      const amount = fungible.amount || '0';
      const isZero = amount === '0' || parseFloat(amount) === 0;

      // Make clickable if not zero
      const isClickable = !isZero;
      const clickableClass = isClickable ? 'clickable' : '';
      const clickableAttr = isClickable ? `data-address="${escapeHtml(fungible.resourceAddress)}"` : '';

      html += `
        <div class="balance-item ${clickableClass}" ${clickableAttr}>
          <img src="${getIconUrl(fungible.iconUrl)}" alt="" onerror="this.style.visibility='hidden'">
          <span class="name">${escapeHtml(displayName)}</span>
          <span class="amount ${isZero ? 'zero' : ''}">
            ${formatAmount(amount)}
          </span>
        </div>
      `;
    }

    this.caveBalancesElement.innerHTML = html;

    // Add click handlers for IN mode
    this.caveBalancesElement.querySelectorAll('.balance-item.clickable').forEach(el => {
      el.addEventListener('click', () => {
        const address = el.dataset.address;
        if (address) {
          this.addResource(address);
        }
      });
    });
  }
  
  showBalancesError(message) {
    this.balancesSection.classList.remove('hidden');
    this.caveBalancesElement.innerHTML = `<div class="balance-placeholder" style="color: #f87171;">${escapeHtml(message)}</div>`;
  }

  /**
   * Update cave balance for a specific resource after a transaction
   * @param {string} resourceAddress - The resource address
   * @param {string} amountChange - The amount to add (positive) or subtract (negative)
   * @param {object} metadata - Optional metadata for the resource (symbol, name, iconUrl)
   */
  updateCaveBalance(resourceAddress, amountChange, metadata) {
    // Only update if we have a current balance (i.e., LOOK CAVE was used)
    if (this.caveBalancesData[resourceAddress] === undefined || this.caveBalancesData[resourceAddress] === null) {
      console.log(`Cannot update balance for ${resourceAddress} - no initial balance from LOOK CAVE`);
      return;
    }

    const currentBalance = parseFloat(this.caveBalancesData[resourceAddress]) || 0;
    const change = parseFloat(amountChange) || 0;
    const newBalance = Math.max(0, currentBalance + change); // Ensure non-negative

    this.caveBalancesData[resourceAddress] = newBalance.toString();

    console.log(`Updated balance for ${resourceAddress}: ${currentBalance} + ${change} = ${newBalance}`);

    // Update metadata if provided
    if (metadata) {
      this.caveResourceMetadata[resourceAddress] = metadata;
    }

    // Always update the bottom balances display
    this.renderBalancesDisplay();

    // Re-render selected resources to update the token selector fields
    this.renderSelectedResources();
  }
  
  updateSubmitButton() {
    const hasNft = this.selectedNftData !== null;
    const hasResources = this.selectedResourcesList.length > 0;

    // If no NFT is selected, change button text and disable
    if (!hasNft) {
      this.submitBtn.textContent = 'FIRST PICK NFT';
      this.submitBtn.disabled = true;
      return;
    }

    // Restore original button text based on mode
    switch (this.mode) {
      case 'in':
        this.submitBtn.textContent = 'PUT NOW';
        break;
      case 'out':
        this.submitBtn.textContent = 'TAKE NOW';
        break;
      case 'look':
        this.submitBtn.textContent = 'LOOK NOW';
        break;
    }

    let valid = hasNft && hasResources;

    if (valid && this.mode !== 'look') {
      valid = this.selectedResourcesList.every(r => {
        // Ensure the resource has all required properties
        if (!r || r.amount === undefined || r.divisibility === undefined) {
          return false;
        }

        // For OUT mode, validate against cave balance if known
        if (this.mode === 'out') {
          const caveBalance = this.caveBalancesData[r.resourceAddress];
          // If cave balance is known, validate against it; otherwise only validate format
          const maxAmount = (caveBalance !== undefined && caveBalance !== null) ? caveBalance : null;
          const validation = validateAmount(r.amount, maxAmount, r.divisibility);
          return validation.valid;
        } else {
          // For IN mode, validate against wallet balance
          const validation = validateAmount(r.amount, r.maxAmount, r.divisibility);
          return validation.valid;
        }
      });
    }

    this.submitBtn.disabled = !valid;
  }
  
  handleSubmit() {
    if (this.submitBtn.disabled) return;
    
    const data = {
      mode: this.mode,
      nft: this.selectedNftData,
      resources: this.selectedResourcesList.map(r => ({
        resourceAddress: r.resourceAddress,
        amount: r.amount,
        symbol: r.symbol,
        iconUrl: r.iconUrl
      }))
    };
    
    if (this.mode === 'look' && this.onLookup) {
      this.onLookup(data);
    } else if (this.onSubmit) {
      this.onSubmit(data);
    }
  }
  
  setLoading(loading) {
    this.submitBtn.disabled = loading;
    
    if (loading) {
      this.submitBtn.dataset.originalText = this.submitBtn.textContent;
      this.submitBtn.innerHTML = '<span class="loading"></span> ME DO...';
    } else {
      this.submitBtn.textContent = this.submitBtn.dataset.originalText || 'PUT NOW';
    }
  }
}

/**
 * Show a status message
 * @param {string} message 
 * @param {string} type - 'info', 'success', or 'error'
 */
export function setStatus(message, type = 'info') {
  const bar = document.getElementById('status-bar');
  const text = document.getElementById('status-text');
  
  text.textContent = message;
  bar.className = `status-bar ${type}`;
  bar.classList.remove('hidden');
  
  // Auto-hide after 6 seconds for all types
  setTimeout(() => {
    bar.classList.add('hidden');
  }, 6000);
}

/**
 * Hide the status bar
 */
export function hideStatus() {
  document.getElementById('status-bar').classList.add('hidden');
}