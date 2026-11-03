import React, { useState, useMemo } from 'react';
import { 
  Search, 
  BookOpen, 
  Filter, 
  ChevronRight, 
  X, 
  ShieldCheck, 
  AlertTriangle, 
  Layers, 
  Sliders, 
  CheckCircle2, 
  Scale, 
  DollarSign, 
  FileText 
} from 'lucide-react';
import { 
  financialDataDictionaryService, 
  FINANCIAL_CATEGORIES 
} from '../lib/financialDataDictionaryService';
import './FinancialDictionaryView.css';

export default function FinancialDictionaryView() {
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMetric, setActiveMetric] = useState(null);

  const categories = [
    { key: 'ALL', label: 'All Metrics' },
    { key: FINANCIAL_CATEGORIES.CHARGE, label: 'Charges & Billed' },
    { key: FINANCIAL_CATEGORIES.REVENUE, label: 'Contract & Revenue' },
    { key: FINANCIAL_CATEGORIES.PAYMENT, label: 'Payments & Cash' },
    { key: FINANCIAL_CATEGORIES.COST, label: 'Cost Accounting' },
    { key: FINANCIAL_CATEGORIES.MARGIN, label: 'Margins & Spreads' },
    { key: FINANCIAL_CATEGORIES.ADJUSTMENT, label: 'Deductions & Adjustments' },
    { key: FINANCIAL_CATEGORIES.METRIC, label: 'RCM Efficiency' }
  ];

  const filteredMetrics = useMemo(() => {
    let result = financialDataDictionaryService.getAllMetrics();
    if (selectedCategory !== 'ALL') {
      result = result.filter(m => m.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(m => 
        m.canonicalName.toLowerCase().includes(q) ||
        m.code.toLowerCase().includes(q) ||
        m.businessDefinition.toLowerCase().includes(q) ||
        m.sourceOfTruth.toLowerCase().includes(q)
      );
    }
    return result;
  }, [selectedCategory, searchQuery]);

  const getCategoryBadgeClass = (category) => {
    switch (category) {
      case FINANCIAL_CATEGORIES.CHARGE:
        return 'badge-charge';
      case FINANCIAL_CATEGORIES.REVENUE:
        return 'badge-revenue';
      case FINANCIAL_CATEGORIES.PAYMENT:
        return 'badge-payment';
      case FINANCIAL_CATEGORIES.COST:
        return 'badge-cost';
      case FINANCIAL_CATEGORIES.MARGIN:
        return 'badge-margin';
      case FINANCIAL_CATEGORIES.ADJUSTMENT:
        return 'badge-adjustment';
      default:
        return 'badge-metric';
    }
  };

  return (
    <div className="financial-dict-container">
      {/* Header */}
      <div className="financial-dict-header">
        <div className="header-title-row">
          <div className="header-icon-box">
            <BookOpen className="header-icon" size={24} />
          </div>
          <div>
            <h1 className="header-title">Canonical Financial Data Dictionary</h1>
            <p className="header-subtitle">
              Enterprise definitions, deterministic formulas, accounting standards, and semantic governance.
            </p>
          </div>
        </div>
        <div className="header-badges">
          <span className="badge-standard">
            <Scale size={14} className="mr-1" /> GAAP / ASC 606 Aligned
          </span>
          <span className="badge-standard">
            <ShieldCheck size={14} className="mr-1" /> Deterministic Server Truth
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="financial-dict-controls">
        <div className="search-box">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search metric name, code, formula, or source of truth..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
              <X size={16} />
            </button>
          )}
        </div>

        <div className="category-pills">
          {categories.map((cat) => (
            <button
              key={cat.key}
              className={`category-pill ${selectedCategory === cat.key ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.key)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table / Grid */}
      <div className="financial-dict-table-card">
        <div className="table-header-info">
          <span>Displaying <strong>{filteredMetrics.length}</strong> canonical financial metrics</span>
          <span className="table-disclaimer">Zero floating-point rounding. Fixed NUMERIC(12,2) precision.</span>
        </div>

        <div className="table-responsive">
          <table className="financial-table">
            <thead>
              <tr>
                <th>Canonical Name & Code</th>
                <th>Category</th>
                <th>Datatype</th>
                <th>Source of Truth</th>
                <th>Business Purpose</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredMetrics.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-table-cell">
                    <AlertTriangle size={24} className="empty-icon" />
                    <div>No financial metrics matched your search criteria.</div>
                  </td>
                </tr>
              ) : (
                filteredMetrics.map((metric) => (
                  <tr key={metric.code} className="clickable-row" onClick={() => setActiveMetric(metric)}>
                    <td>
                      <div className="metric-title">{metric.canonicalName}</div>
                      <div className="metric-code-sub">{metric.code}</div>
                    </td>
                    <td>
                      <span className={`category-badge ${getCategoryBadgeClass(metric.category)}`}>
                        {metric.category}
                      </span>
                    </td>
                    <td>
                      <code className="datatype-badge">{metric.datatype}</code>
                    </td>
                    <td className="source-cell">
                      <span className="source-text">{metric.sourceOfTruth}</span>
                    </td>
                    <td className="definition-cell">
                      <div className="definition-text">{metric.businessDefinition}</div>
                    </td>
                    <td className="action-cell">
                      <button className="inspect-btn">
                        Inspect <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Metric Detail Modal / Drawer */}
      {activeMetric && (
        <div className="modal-backdrop" onClick={() => setActiveMetric(null)}>
          <div className="modal-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title-group">
                <span className={`category-badge ${getCategoryBadgeClass(activeMetric.category)}`}>
                  {activeMetric.category}
                </span>
                <h2 className="drawer-title">{activeMetric.canonicalName}</h2>
                <code className="drawer-code-tag">{activeMetric.code}</code>
              </div>
              <button className="drawer-close-btn" onClick={() => setActiveMetric(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="drawer-body">
              {/* Formula & Technical Definition */}
              <div className="drawer-section">
                <h3 className="section-label">Technical Formula / Expression</h3>
                <div className="formula-box">
                  <code>{activeMetric.technicalDefinition}</code>
                </div>
              </div>

              {/* Business Definition */}
              <div className="drawer-section">
                <h3 className="section-label">Business Definition</h3>
                <p className="section-text">{activeMetric.businessDefinition}</p>
              </div>

              {/* Source of Truth & Accounting Treatment */}
              <div className="drawer-grid-two">
                <div className="info-card">
                  <span className="card-label">Source of Truth Table</span>
                  <span className="card-val">{activeMetric.sourceOfTruth}</span>
                </div>
                <div className="info-card">
                  <span className="card-label">Accounting Treatment</span>
                  <span className="card-val">{activeMetric.accountingTreatment}</span>
                </div>
              </div>

              {/* Permitted Usage */}
              <div className="drawer-section">
                <h3 className="section-label text-emerald-400">Permitted Usage</h3>
                <div className="rule-box permitted-box">
                  <CheckCircle2 size={16} className="rule-icon text-emerald-400" />
                  <span>{activeMetric.permittedUsage}</span>
                </div>
              </div>

              {/* Prohibited Usage */}
              <div className="drawer-section">
                <h3 className="section-label text-rose-400">Strictly Prohibited Usage</h3>
                <div className="rule-box prohibited-box">
                  <AlertTriangle size={16} className="rule-icon text-rose-400" />
                  <span>{activeMetric.prohibitedUsage}</span>
                </div>
              </div>

              {/* Downstream Consumer Modules */}
              <div className="drawer-section">
                <h3 className="section-label">Downstream Consumer Modules</h3>
                <div className="consumer-tags">
                  {activeMetric.consumers.map((c) => (
                    <span key={c} className="consumer-tag">
                      <Layers size={12} className="mr-1" /> {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="drawer-footer">
              <button className="drawer-done-btn" onClick={() => setActiveMetric(null)}>
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
