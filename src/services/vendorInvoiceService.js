/**
 * ==============================================================================
 * Service: vendorInvoiceService.js
 * Module 15: Enterprise Healthcare Integrations (Phase F9)
 * Description: Vendor Invoice Import Gateway (EDI 810 / CSV / PDF-OCR),
 *              GPO & Contracted Vendor Price Catalog, SKU Cross-Reference Matching,
 *              3-Way Purchase Order Reconciliation, Price Variance Detection,
 *              and AP Audit Provenance.
 * ==============================================================================
 */

import crypto from 'crypto';

export const NAPLES_FACILITY_ID = '00000000-0000-0000-0000-000000000002';

/**
 * Normalizes facility identifier whether passed as string, alias, or object
 */
export function normalizeFacilityId(facilityInput) {
  if (!facilityInput) return NAPLES_FACILITY_ID;
  if (typeof facilityInput === 'object') {
    const rawId = facilityInput.id || facilityInput.facility_id || facilityInput.facilityId || facilityInput.uuid;
    return normalizeFacilityId(rawId);
  }
  const str = String(facilityInput).trim();
  if (
    str === 'fac-naples-01' ||
    str === 'naples-surgery-center' ||
    str.toLowerCase().includes('naples')
  ) {
    return NAPLES_FACILITY_ID;
  }
  return str || NAPLES_FACILITY_ID;
}

/**
 * Generates an immutable 64-char SHA-256 seal for vendor invoice batches
 */
export function computeVendorInvoiceSeal(facilityId, invoiceNumber, vendorName, totalAmount, matchStatus) {
  const normId = normalizeFacilityId(facilityId);
  const payload = `${normId}|${invoiceNumber}|${vendorName}|${Number(totalAmount).toFixed(2)}|${matchStatus}`;
  const rawHash = crypto.createHash('sha256').update(payload).digest('hex');
  return `sha256_vinv_${rawHash.substring(0, 52)}`; // Exactly 64 chars (12 + 52)
}

/**
 * Masks sensitive credentials for UI and logging safety
 */
export function maskVendorInvoiceSecret(secret) {
  if (!secret) return 'vinv_sec_****_none';
  if (secret.length <= 8) return 'vinv_sec_****_mask';
  return `vinv_sec_****_${secret.slice(-4)}`;
}

/**
 * Normalizes a SKU string by stripping punctuation and leading vendor prefixes
 */
function stripSkuFormatting(sku) {
  return String(sku || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Multi-tier deterministic vendor SKU matcher against active facility contracts
 */
export function matchVendorSku(vendorSku, itemDescription = '', priceContracts = []) {
  const cleanSku = String(vendorSku || '').trim().toUpperCase();
  if (!cleanSku && !itemDescription) {
    return {
      matched: false,
      matchedInternalSku: null,
      matchedVendorSku: null,
      contractedUnitPrice: 0,
      matchConfidencePct: 0,
      matchMethod: 'UNMAPPED'
    };
  }

  // Tier 1: Exact Vendor SKU match
  const exact = priceContracts.find(
    c => c.is_active !== false && String(c.vendor_sku || '').trim().toUpperCase() === cleanSku
  );
  if (exact) {
    return {
      matched: true,
      matchedInternalSku: exact.internal_item_sku,
      matchedVendorSku: exact.vendor_sku,
      contractedUnitPrice: Number(exact.contracted_unit_price),
      matchConfidencePct: 100.0,
      matchMethod: 'EXACT_SKU',
      contract: exact
    };
  }

  // Tier 2: Normalized alias / stripped formatting or internal SKU match
  const strippedInput = stripSkuFormatting(cleanSku);
  const alias = priceContracts.find(c => {
    if (c.is_active === false) return false;
    const strippedVendor = stripSkuFormatting(c.vendor_sku);
    const strippedInternal = stripSkuFormatting(c.internal_item_sku);
    return (
      strippedVendor === strippedInput ||
      strippedInternal === strippedInput ||
      (strippedInput.length >= 4 && strippedVendor.endsWith(strippedInput))
    );
  });
  if (alias) {
    return {
      matched: true,
      matchedInternalSku: alias.internal_item_sku,
      matchedVendorSku: alias.vendor_sku,
      contractedUnitPrice: Number(alias.contracted_unit_price),
      matchConfidencePct: 95.0,
      matchMethod: 'CROSS_REF_ALIAS',
      contract: alias
    };
  }

  // Tier 3: Tokenized description similarity match (>= 50% token overlap)
  const descTokens = String(itemDescription || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);

  if (descTokens.length >= 2) {
    let bestContract = null;
    let bestScore = 0;

    for (const c of priceContracts) {
      if (c.is_active === false) continue;
      const targetTokens = new Set(
        String(c.item_description || '')
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter(t => t.length >= 3)
      );
      if (targetTokens.size === 0) continue;

      const overlapCount = descTokens.filter(t => targetTokens.has(t)).length;
      const score = overlapCount / Math.max(descTokens.length, targetTokens.size);
      if (score >= 0.5 && score > bestScore) {
        bestScore = score;
        bestContract = c;
      }
    }

    if (bestContract) {
      return {
        matched: true,
        matchedInternalSku: bestContract.internal_item_sku,
        matchedVendorSku: bestContract.vendor_sku,
        contractedUnitPrice: Number(bestContract.contracted_unit_price),
        matchConfidencePct: Number((bestScore * 100).toFixed(1)),
        matchMethod: 'FUZZY_DESCRIPTION',
        contract: bestContract
      };
    }
  }

  return {
    matched: false,
    matchedInternalSku: null,
    matchedVendorSku: null,
    contractedUnitPrice: 0,
    matchConfidencePct: 0,
    matchMethod: 'UNMAPPED'
  };
}

/**
 * Calculates deterministic unit & extended price variance for an invoice line
 */
export function calculateLineVariance(qtyInvoiced = 0, invoicedUnitPrice = 0, contractedUnitPrice = 0, tolerancePct = 2.0) {
  const qty = Math.max(0, Number(qtyInvoiced) || 0);
  const invoiced = Math.max(0, Number(invoicedUnitPrice) || 0);
  const contracted = Math.max(0, Number(contractedUnitPrice) || 0);
  const tolerance = Math.max(0, Number(tolerancePct) || 0);

  const lineExtendedAmount = Number((qty * invoiced).toFixed(2));
  const expectedExtendedAmount = Number((qty * contracted).toFixed(2));
  const unitPriceVariance = Number((invoiced - contracted).toFixed(2));
  const extendedVariance = Number((lineExtendedAmount - expectedExtendedAmount).toFixed(2));
  const variancePct = contracted > 0
    ? Number((((invoiced - contracted) / contracted) * 100).toFixed(2))
    : (invoiced > 0 ? 100.0 : 0);

  const exceedsTolerance = Math.abs(variancePct) > tolerance;

  return {
    qtyInvoiced: qty,
    invoicedUnitPrice: invoiced,
    contractedUnitPrice: contracted,
    lineExtendedAmount,
    expectedExtendedAmount,
    unitPriceVariance,
    extendedVariance,
    variancePct,
    exceedsTolerance
  };
}

/**
 * Performs comprehensive 3-Way PO, Duplicate, Math Invariant, SKU, and Price Audit
 */
export function validateThreeWayInvoiceMatch({
  invoiceNumber,
  vendorName,
  poNumber,
  invoiceLines = [],
  freightTaxAmount = 0,
  totalInvoiceAmount = 0,
  priceContracts = [],
  purchaseOrders = [],
  existingInvoices = [],
  tolerancePct = 2.0,
  matchingPolicy = 'THREE_WAY_MATCH'
}) {
  const errors = [];
  const warnings = [];

  // 1. Duplicate invoice check
  const isDuplicate = existingInvoices.some(
    inv =>
      String(inv.invoice_number || '').trim().toUpperCase() === String(invoiceNumber || '').trim().toUpperCase() &&
      String(inv.vendor_name || '').trim().toLowerCase() === String(vendorName || '').trim().toLowerCase()
  );

  if (isDuplicate) {
    errors.push(`ERR_DUPLICATE_INVOICE: Invoice ${invoiceNumber} for ${vendorName} has already been imported.`);
    return {
      isValid: false,
      matchStatus: 'DUPLICATE_BLOCKED',
      subtotalAmount: 0,
      contractExpectedTotal: 0,
      totalVarianceAmount: 0,
      lineResults: [],
      errors,
      warnings
    };
  }

  // 2. PO existence & receipt check for 3-Way Match
  const matchedPo = poNumber
    ? purchaseOrders.find(p => String(p.po_number || '').toUpperCase() === String(poNumber).toUpperCase())
    : null;

  let subtotalAmount = 0;
  let contractExpectedTotal = 0;
  let totalQtyInvoiced = 0;
  let hasUnmappedSku = false;
  let hasOverbilling = false;
  let hasQtyMismatch = false;

  const lineResults = invoiceLines.map((line, idx) => {
    const qty = Number(line.qty_invoiced) || 0;
    const invoicedPrice = Number(line.invoiced_unit_price) || 0;
    const skuMatch = matchVendorSku(line.vendor_sku, line.item_description, priceContracts);

    const contractedPrice = skuMatch.matched
      ? skuMatch.contractedUnitPrice
      : (Number(line.contracted_unit_price) || 0);

    const varianceCalc = calculateLineVariance(qty, invoicedPrice, contractedPrice, tolerancePct);

    subtotalAmount += varianceCalc.lineExtendedAmount;
    contractExpectedTotal += skuMatch.matched ? varianceCalc.expectedExtendedAmount : varianceCalc.lineExtendedAmount;
    totalQtyInvoiced += qty;

    const qtyReceived = line.qty_received_po !== undefined
      ? Number(line.qty_received_po)
      : (matchedPo ? Number(matchedPo.received_quantity_total) : qty);

    let lineStatus = 'MATCHED';
    if (!skuMatch.matched) {
      lineStatus = 'SKU_UNMAPPED';
      hasUnmappedSku = true;
      errors.push(`ERR_UNMAPPED_VENDOR_SKU: Line ${idx + 1} (${line.vendor_sku}) could not be matched to an active contract SKU.`);
    } else if (matchingPolicy === 'THREE_WAY_MATCH' && line.qty_received_po !== undefined && qty > qtyReceived) {
      lineStatus = 'QTY_DISCREPANCY';
      hasQtyMismatch = true;
      errors.push(`ERR_PO_QUANTITY_EXCEEDED: Line ${idx + 1} (${line.vendor_sku}) invoiced ${qty} exceeds PO received ${qtyReceived}.`);
    } else if (varianceCalc.exceedsTolerance && varianceCalc.unitPriceVariance > 0) {
      lineStatus = 'OVERBILLED';
      hasOverbilling = true;
      warnings.push(`ERR_PRICE_OVERBILLING: Line ${idx + 1} (${line.vendor_sku}) billed $${invoicedPrice.toFixed(2)} vs contract $${contractedPrice.toFixed(2)}.`);
    }

    return {
      line_number: idx + 1,
      vendor_sku: line.vendor_sku,
      matched_internal_sku: skuMatch.matchedInternalSku,
      match_confidence_pct: skuMatch.matchConfidencePct,
      match_method: skuMatch.matchMethod,
      item_description: line.item_description,
      qty_invoiced: qty,
      qty_received_po: qtyReceived,
      invoiced_unit_price: invoicedPrice,
      contracted_unit_price: contractedPrice,
      unit_price_variance: varianceCalc.unitPriceVariance,
      line_extended_amount: varianceCalc.lineExtendedAmount,
      line_status: lineStatus
    };
  });

  // Check PO-level aggregate received quantity under 3-Way Match
  if (matchingPolicy === 'THREE_WAY_MATCH' && matchedPo && totalQtyInvoiced > matchedPo.received_quantity_total) {
    hasQtyMismatch = true;
    errors.push(`ERR_PO_QUANTITY_EXCEEDED: Total invoiced qty (${totalQtyInvoiced}) exceeds PO ${matchedPo.po_number} received qty (${matchedPo.received_quantity_total}).`);
  }

  subtotalAmount = Number(subtotalAmount.toFixed(2));
  contractExpectedTotal = Number(contractExpectedTotal.toFixed(2));
  const freight = Number(freightTaxAmount) || 0;
  const declaredTotal = totalInvoiceAmount > 0 ? Number(totalInvoiceAmount) : Number((subtotalAmount + freight).toFixed(2));
  const computedTotal = Number((subtotalAmount + freight).toFixed(2));

  // 3. Arithmetic Header-to-Line Math Invariant
  if (Math.abs(computedTotal - declaredTotal) > 0.01) {
    errors.push(`ERR_INVOICE_MATH_IMBALANCE: Line sum + freight ($${computedTotal.toFixed(2)}) does not equal declared invoice total ($${declaredTotal.toFixed(2)}).`);
  }

  const totalVarianceAmount = Number((subtotalAmount - contractExpectedTotal).toFixed(2));

  let matchStatus = 'MATCHED';
  if (hasUnmappedSku) {
    matchStatus = 'UNMAPPED_SKU';
  } else if (hasQtyMismatch) {
    matchStatus = 'QUANTITY_MISMATCH';
  } else if (hasOverbilling) {
    matchStatus = 'PRICE_VARIANCE';
  }

  return {
    isValid: errors.length === 0 && !hasOverbilling,
    matchStatus,
    subtotalAmount,
    contractExpectedTotal,
    totalVarianceAmount,
    declaredTotal,
    lineResults,
    errors,
    warnings
  };
}

// ==========================================
// MOCK REPOSITORY & DATA ACCESSORS
// ==========================================

const DEFAULT_CONFIG = {
  facility_id: NAPLES_FACILITY_ID,
  default_parser_mode: 'HYBRID',
  matching_policy: 'THREE_WAY_MATCH',
  api_endpoint_url: 'https://edi.naplesasc.io/v1/x12-810-intake',
  ap_account_code: 'AP-2000-NAPLES-ASC',
  client_id: 'vinv_client_naples_prod',
  client_secret_encrypted: 'enc_v2_77c10d23ef948502139485029348502934850293485029348502934850299104',
  price_tolerance_pct: 2.00,
  block_duplicate_invoices: true,
  sync_status: 'CONNECTED',
  health_status: 'HEALTHY',
  updated_at: new Date().toISOString()
};

const DEFAULT_CONTRACTS = [
  {
    id: 'con-01',
    facility_id: NAPLES_FACILITY_ID,
    vendor_name: 'Stryker Orthopaedics',
    vendor_sku: 'STR-5541-CR',
    internal_item_sku: 'SKU-1001',
    item_description: 'Triathlon Total Knee CR Femoral Component',
    clinical_category: 'IMPLANT',
    unit_of_measure: 'EA',
    contracted_unit_price: 1850.00,
    gpo_contract_code: 'VIZIENT-ORTHO-2026',
    effective_from: '2026-01-01',
    effective_to: '2027-12-31',
    is_active: true
  },
  {
    id: 'con-02',
    facility_id: NAPLES_FACILITY_ID,
    vendor_name: 'Stryker Orthopaedics',
    vendor_sku: 'STR-5542-TB',
    internal_item_sku: 'SKU-1002',
    item_description: 'Triathlon CR Tibial Insert Size 4 9mm',
    clinical_category: 'IMPLANT',
    unit_of_measure: 'EA',
    contracted_unit_price: 620.00,
    gpo_contract_code: 'VIZIENT-ORTHO-2026',
    effective_from: '2026-01-01',
    effective_to: '2027-12-31',
    is_active: true
  },
  {
    id: 'con-03',
    facility_id: NAPLES_FACILITY_ID,
    vendor_name: 'Alcon Laboratories',
    vendor_sku: 'ALC-SN60WF',
    internal_item_sku: 'SKU-1003',
    item_description: 'AcrySof IQ Monofocal Intraocular Lens (IOL)',
    clinical_category: 'IMPLANT',
    unit_of_measure: 'EA',
    contracted_unit_price: 215.00,
    gpo_contract_code: 'PREMIER-OPH-2026',
    effective_from: '2026-01-01',
    effective_to: '2027-12-31',
    is_active: true
  },
  {
    id: 'con-04',
    facility_id: NAPLES_FACILITY_ID,
    vendor_name: 'Cardinal Health',
    vendor_sku: 'CH-J316H',
    internal_item_sku: 'SKU-1004',
    item_description: 'Vicryl Suture 3-0 Undyed Braided 36ct',
    clinical_category: 'SURGICAL_SUPPLY',
    unit_of_measure: 'BOX',
    contracted_unit_price: 84.50,
    gpo_contract_code: 'VIZIENT-MEDSURG-26',
    effective_from: '2026-01-01',
    effective_to: '2027-12-31',
    is_active: true
  },
  {
    id: 'con-05',
    facility_id: NAPLES_FACILITY_ID,
    vendor_name: 'Cardinal Health',
    vendor_sku: 'CH-9505DRP',
    internal_item_sku: 'SKU-1005',
    item_description: 'Astound Sterile Surgical Drape Pack',
    clinical_category: 'SURGICAL_SUPPLY',
    unit_of_measure: 'CASE',
    contracted_unit_price: 125.00,
    gpo_contract_code: 'VIZIENT-MEDSURG-26',
    effective_from: '2026-01-01',
    effective_to: '2027-12-31',
    is_active: true
  }
];

const DEFAULT_POS = [
  {
    id: 'po-01',
    facility_id: NAPLES_FACILITY_ID,
    po_number: 'PO-2026-8801',
    vendor_name: 'Stryker Orthopaedics',
    order_date: '2026-02-15',
    expected_delivery_date: '2026-02-20',
    po_total_amount: 4940.00,
    received_quantity_total: 4,
    invoiced_quantity_total: 4,
    po_status: 'MATCHED'
  },
  {
    id: 'po-02',
    facility_id: NAPLES_FACILITY_ID,
    po_number: 'PO-2026-8802',
    vendor_name: 'Cardinal Health',
    order_date: '2026-02-21',
    expected_delivery_date: '2026-02-24',
    po_total_amount: 2095.00,
    received_quantity_total: 20,
    invoiced_quantity_total: 20,
    po_status: 'RECEIVED'
  },
  {
    id: 'po-03',
    facility_id: NAPLES_FACILITY_ID,
    po_number: 'PO-2026-8803',
    vendor_name: 'Alcon Laboratories',
    order_date: '2026-02-24',
    expected_delivery_date: '2026-02-26',
    po_total_amount: 2150.00,
    received_quantity_total: 10,
    invoiced_quantity_total: 0,
    po_status: 'RECEIVED'
  }
];

const DEFAULT_BATCHES = [
  {
    id: 'vinv-bat-01',
    facility_id: NAPLES_FACILITY_ID,
    invoice_number: 'INV-STR-990124',
    vendor_name: 'Stryker Orthopaedics',
    po_number: 'PO-2026-8801',
    source_format: 'EDI_810',
    invoice_date: '2026-02-22',
    due_date: '2026-03-24',
    subtotal_amount: 4940.00,
    freight_tax_amount: 0.00,
    total_invoice_amount: 4940.00,
    contract_expected_total: 4940.00,
    price_variance_amount: 0.00,
    match_status: 'MATCHED',
    line_count: 2,
    sha256_sync_seal: 'sha256_vinv_8b390acd1234567890abcdef1234567890abcdef1234567890abcd',
    imported_at: new Date(Date.now() - 172800000).toISOString()
  },
  {
    id: 'vinv-bat-02',
    facility_id: NAPLES_FACILITY_ID,
    invoice_number: 'INV-CH-442910',
    vendor_name: 'Cardinal Health',
    po_number: 'PO-2026-8802',
    source_format: 'CSV_BATCH',
    invoice_date: '2026-02-24',
    due_date: '2026-03-26',
    subtotal_amount: 2455.00,
    freight_tax_amount: 45.00,
    total_invoice_amount: 2500.00,
    contract_expected_total: 2095.00,
    price_variance_amount: 360.00,
    match_status: 'PRICE_VARIANCE',
    line_count: 2,
    sha256_sync_seal: 'sha256_vinv_9c401bde2345678901bcdef2345678901bcdef2345678901bcde',
    imported_at: new Date(Date.now() - 21600000).toISOString()
  }
];

const DEFAULT_LINES_BY_BATCH = {
  'vinv-bat-01': [
    {
      id: 'line-01',
      invoice_batch_id: 'vinv-bat-01',
      line_number: 1,
      vendor_sku: 'STR-5541-CR',
      matched_internal_sku: 'SKU-1001',
      match_confidence_pct: 100.0,
      match_method: 'EXACT_SKU',
      item_description: 'Triathlon Total Knee CR Femoral Component',
      qty_invoiced: 2,
      qty_received_po: 2,
      invoiced_unit_price: 1850.00,
      contracted_unit_price: 1850.00,
      unit_price_variance: 0.00,
      line_extended_amount: 3700.00,
      line_status: 'MATCHED'
    },
    {
      id: 'line-02',
      invoice_batch_id: 'vinv-bat-01',
      line_number: 2,
      vendor_sku: 'STR-5542-TB',
      matched_internal_sku: 'SKU-1002',
      match_confidence_pct: 100.0,
      match_method: 'EXACT_SKU',
      item_description: 'Triathlon CR Tibial Insert Size 4 9mm',
      qty_invoiced: 2,
      qty_received_po: 2,
      invoiced_unit_price: 620.00,
      contracted_unit_price: 620.00,
      unit_price_variance: 0.00,
      line_extended_amount: 1240.00,
      line_status: 'MATCHED'
    }
  ],
  'vinv-bat-02': [
    {
      id: 'line-03',
      invoice_batch_id: 'vinv-bat-02',
      line_number: 1,
      vendor_sku: 'CH-J316H',
      matched_internal_sku: 'SKU-1004',
      match_confidence_pct: 100.0,
      match_method: 'EXACT_SKU',
      item_description: 'Vicryl Suture 3-0 Undyed Braided 36ct',
      qty_invoiced: 10,
      qty_received_po: 10,
      invoiced_unit_price: 120.50,
      contracted_unit_price: 84.50,
      unit_price_variance: 36.00,
      line_extended_amount: 1205.00,
      line_status: 'OVERBILLED'
    },
    {
      id: 'line-04',
      invoice_batch_id: 'vinv-bat-02',
      line_number: 2,
      vendor_sku: 'CH-9505DRP',
      matched_internal_sku: 'SKU-1005',
      match_confidence_pct: 100.0,
      match_method: 'EXACT_SKU',
      item_description: 'Astound Sterile Surgical Drape Pack',
      qty_invoiced: 10,
      qty_received_po: 10,
      invoiced_unit_price: 125.00,
      contracted_unit_price: 125.00,
      unit_price_variance: 0.00,
      line_extended_amount: 1250.00,
      line_status: 'MATCHED'
    }
  ]
};

const DEFAULT_EXCEPTIONS = [
  {
    id: 'exc-vinv-01',
    facility_id: NAPLES_FACILITY_ID,
    invoice_batch_id: 'vinv-bat-02',
    exception_code: 'ERR_PRICE_OVERBILLING',
    exception_category: 'PRICE_VARIANCE',
    severity: 'CRITICAL',
    offending_identifier: 'CH-J316H',
    variance_amount: 360.00,
    description: 'Cardinal Health billed $120.50/box vs Vizient contracted $84.50/box (+42.6% overbilling across 10 boxes).',
    resolution_action: 'PENDING_MATERIALS_MANAGER_REVIEW',
    is_resolved: false,
    created_at: new Date(Date.now() - 21600000).toISOString()
  }
];

// In-memory state
let currentConfig = { ...DEFAULT_CONFIG };
let currentContracts = [...DEFAULT_CONTRACTS];
let currentPos = [...DEFAULT_POS];
let currentBatches = [...DEFAULT_BATCHES];
let currentLinesByBatch = { ...DEFAULT_LINES_BY_BATCH };
let currentExceptions = [...DEFAULT_EXCEPTIONS];

/**
 * Retrieves the vendor invoice parser config with masked secrets
 */
export async function getVendorInvoiceConfig(facilityInput) {
  const normId = normalizeFacilityId(facilityInput);
  return {
    ...currentConfig,
    facility_id: normId,
    client_secret_masked: maskVendorInvoiceSecret(currentConfig.client_secret_encrypted)
  };
}

/**
 * Updates the vendor invoice parser config
 */
export async function updateVendorInvoiceConfig(facilityInput, updates) {
  const normId = normalizeFacilityId(facilityInput);
  currentConfig = {
    ...currentConfig,
    ...updates,
    facility_id: normId,
    updated_at: new Date().toISOString()
  };
  return {
    ...currentConfig,
    client_secret_masked: maskVendorInvoiceSecret(currentConfig.client_secret_encrypted)
  };
}

/**
 * Computes rolling MTD telemetry metrics for vendor invoice import
 */
export async function getVendorInvoiceTelemetry(facilityInput) {
  const normId = normalizeFacilityId(facilityInput);

  const totalInvoicedMtd = currentBatches.reduce((acc, b) => acc + (Number(b.total_invoice_amount) || 0), 0);
  const priceVarianceFlaggedMtd = currentBatches.reduce((acc, b) => acc + Math.abs(Number(b.price_variance_amount) || 0), 0);
  const pendingReviewCount = currentBatches.filter(b =>
    ['PRICE_VARIANCE', 'QUANTITY_MISMATCH', 'UNMAPPED_SKU'].includes(b.match_status)
  ).length;

  const allLines = Object.values(currentLinesByBatch).flat();
  const matchedLines = allLines.filter(l => l.match_method !== 'UNMAPPED').length;
  const skuAutoMatchPct = allLines.length > 0
    ? Number(((matchedLines / allLines.length) * 100).toFixed(1))
    : 100.0;

  return {
    facility_id: normId,
    default_parser_mode: currentConfig.default_parser_mode,
    matching_policy: currentConfig.matching_policy,
    price_tolerance_pct: currentConfig.price_tolerance_pct,
    sync_status: currentConfig.sync_status,
    health_status: currentConfig.health_status,
    total_invoiced_mtd: Number((41180.00 + totalInvoicedMtd).toFixed(2)),
    sku_auto_match_pct: skuAutoMatchPct,
    price_variance_flagged_mtd: Number(priceVarianceFlaggedMtd.toFixed(2)),
    invoices_pending_review: pendingReviewCount,
    total_invoices_count: currentBatches.length,
    active_exceptions_count: currentExceptions.filter(e => !e.is_resolved).length,
    last_invoice_import_at: currentBatches[0]?.imported_at || new Date().toISOString(),
    latest_sync_seal: currentBatches[0]?.sha256_sync_seal || 'sha256_vinv_none'
  };
}

/**
 * Returns active contracted vendor prices & SKU cross-references
 */
export async function getVendorPriceContracts(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentContracts];
}

/**
 * Returns facility Purchase Orders
 */
export async function getVendorPurchaseOrders(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentPos];
}

/**
 * Returns imported vendor invoice batches
 */
export async function getVendorInvoiceBatches(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentBatches];
}

/**
 * Returns invoice lines for a given invoice batch
 */
export async function getVendorInvoiceLines(batchId) {
  return [...(currentLinesByBatch[batchId] || [])];
}

/**
 * Returns quarantined vendor invoice exceptions
 */
export async function getVendorInvoiceExceptions(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentExceptions];
}

/**
 * Tests connectivity with EDI 810 / PDF-OCR invoice parser endpoint
 */
export async function testVendorInvoiceConnection(facilityInput) {
  normalizeFacilityId(facilityInput);
  return {
    success: true,
    parser_mode: currentConfig.default_parser_mode,
    endpoint: currentConfig.api_endpoint_url,
    latency_ms: 118,
    timestamp: new Date().toISOString(),
    message: `Secure EDI 810 & OCR Invoice Intake Gateway (${currentConfig.matching_policy}) verified.`
  };
}

/**
 * Imports a vendor invoice batch, runs SKU matching + 3-way PO audit, and seals via SHA-256
 */
export async function importVendorInvoiceBatch(facilityInput, invoicePayload = {}) {
  const normId = normalizeFacilityId(facilityInput);
  const now = new Date();
  const invoiceNumber = invoicePayload.invoice_number || `INV-ALC-${now.getTime().toString().slice(-6)}`;
  const vendorName = invoicePayload.vendor_name || 'Alcon Laboratories';
  const poNumber = invoicePayload.po_number || 'PO-2026-8803';

  const lines = invoicePayload.lines || [
    {
      vendor_sku: 'ALC-SN60WF',
      item_description: 'AcrySof IQ Monofocal Intraocular Lens (IOL)',
      qty_invoiced: 10,
      qty_received_po: 10,
      invoiced_unit_price: 215.00
    }
  ];

  const freight = Number(invoicePayload.freight_tax_amount) || 0;
  const audit = validateThreeWayInvoiceMatch({
    invoiceNumber,
    vendorName,
    poNumber,
    invoiceLines: lines,
    freightTaxAmount: freight,
    totalInvoiceAmount: invoicePayload.total_invoice_amount || 0,
    priceContracts: currentContracts,
    purchaseOrders: currentPos,
    existingInvoices: currentBatches,
    tolerancePct: currentConfig.price_tolerance_pct,
    matchingPolicy: currentConfig.matching_policy
  });

  if (audit.matchStatus === 'DUPLICATE_BLOCKED') {
    const dupErr = new Error(audit.errors[0]);
    dupErr.code = 'ERR_DUPLICATE_INVOICE';
    throw dupErr;
  }

  const batchId = `vinv-bat-${Date.now()}`;
  const seal = computeVendorInvoiceSeal(normId, invoiceNumber, vendorName, audit.declaredTotal, audit.matchStatus);

  const newBatch = {
    id: batchId,
    facility_id: normId,
    invoice_number: invoiceNumber,
    vendor_name: vendorName,
    po_number: poNumber,
    source_format: invoicePayload.source_format || 'EDI_810',
    invoice_date: invoicePayload.invoice_date || now.toISOString().slice(0, 10),
    due_date: invoicePayload.due_date || new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10),
    subtotal_amount: audit.subtotalAmount,
    freight_tax_amount: freight,
    total_invoice_amount: audit.declaredTotal,
    contract_expected_total: audit.contractExpectedTotal,
    price_variance_amount: audit.totalVarianceAmount,
    match_status: audit.matchStatus,
    line_count: audit.lineResults.length,
    sha256_sync_seal: seal,
    imported_at: now.toISOString()
  };

  currentBatches.unshift(newBatch);
  currentLinesByBatch[batchId] = audit.lineResults.map((l, idx) => ({
    id: `line-${Date.now()}-${idx}`,
    invoice_batch_id: batchId,
    ...l
  }));

  // Log exceptions if flagged
  if (audit.matchStatus !== 'MATCHED') {
    currentExceptions.unshift({
      id: `exc-vinv-${Date.now()}`,
      facility_id: normId,
      invoice_batch_id: batchId,
      exception_code: audit.matchStatus === 'PRICE_VARIANCE' ? 'ERR_PRICE_OVERBILLING' : `ERR_${audit.matchStatus}`,
      exception_category: audit.matchStatus,
      severity: 'CRITICAL',
      offending_identifier: invoiceNumber,
      variance_amount: Math.abs(audit.totalVarianceAmount),
      description: [...audit.errors, ...audit.warnings].join(' | ') || `Invoice ${invoiceNumber} requires review.`,
      resolution_action: 'PENDING_MATERIALS_MANAGER_REVIEW',
      is_resolved: false,
      created_at: now.toISOString()
    });
  }

  return newBatch;
}

/**
 * Promotes a matched invoice batch to APPROVED_FOR_AP status
 */
export async function approveVendorInvoiceForAp(batchId, approverId = 'finance_director@naplesasc.com') {
  const batch = currentBatches.find(b => b.id === batchId);
  if (!batch) {
    return { success: false, message: 'Invoice batch not found' };
  }
  batch.match_status = 'APPROVED_FOR_AP';
  batch.approved_by = approverId;
  batch.approved_at = new Date().toISOString();
  return { success: true, batch };
}

/**
 * Resolves a quarantined vendor invoice exception
 */
export async function resolveVendorInvoiceException(exceptionId, resolutionNote) {
  const exc = currentExceptions.find(e => e.id === exceptionId);
  if (!exc) {
    return { success: false, message: 'Exception not found' };
  }
  exc.is_resolved = true;
  exc.resolution_action = resolutionNote || 'RESOLVED_BY_MATERIALS_MANAGER';
  exc.resolved_at = new Date().toISOString();
  return { success: true, exception: exc };
}

export default {
  NAPLES_FACILITY_ID,
  normalizeFacilityId,
  computeVendorInvoiceSeal,
  maskVendorInvoiceSecret,
  matchVendorSku,
  calculateLineVariance,
  validateThreeWayInvoiceMatch,
  getVendorInvoiceConfig,
  updateVendorInvoiceConfig,
  getVendorInvoiceTelemetry,
  getVendorPriceContracts,
  getVendorPurchaseOrders,
  getVendorInvoiceBatches,
  getVendorInvoiceLines,
  getVendorInvoiceExceptions,
  testVendorInvoiceConnection,
  importVendorInvoiceBatch,
  approveVendorInvoiceForAp,
  resolveVendorInvoiceException
};
