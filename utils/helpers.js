'use strict';

/**
 * Escape HTML special characters for safe output in EJS.
 * Prefer using EJS <%= %> (escaped) over <%- %>.
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format a date for display (YYYY-MM-DD or locale).
 */
function formatDate(date, options = {}) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options
  });
}

/**
 * Format time (HH:MM).
 */
function formatTime(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Pagination helper.
 */
function paginate(page = 1, limit = 20) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (p - 1) * l;
  return { page: p, limit: l, offset };
}

/**
 * Build a simple status badge class.
 */
function statusBadgeClass(status) {
  const map = {
    active: 'badge-success',
    inactive: 'badge-secondary',
    pending: 'badge-warning',
    approved: 'badge-success',
    rejected: 'badge-danger',
    draft: 'badge-secondary',
    submitted: 'badge-info',
    approved: 'badge-success',
    published: 'badge-success',
    under_review: 'badge-warning',
    additional_info_required: 'badge-warning',
    withdrawn: 'badge-secondary',
    graduated: 'badge-info',
    suspended: 'badge-danger',
    published: 'badge-success',
    paid: 'badge-success',
    outstanding: 'badge-danger',
    partially_paid: 'badge-warning',
    waived: 'badge-secondary',
    partial: 'badge-warning',
    present: 'badge-success',
    late: 'badge-warning',
    absent: 'badge-danger',
    early_departure: 'badge-warning'
  };
  return map[String(status).toLowerCase()] || 'badge-secondary';
}

/**
 * Safe integer parse.
 */
function toInt(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

module.exports = {
  escapeHtml,
  formatDate,
  formatTime,
  paginate,
  statusBadgeClass,
  toInt
};
