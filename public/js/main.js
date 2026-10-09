/**
 * PSHA Portal — shared client-side utilities
 */
(function () {
  'use strict';

  // Mobile sidebar toggle
  document.addEventListener('DOMContentLoaded', function () {
    const toggle = document.querySelector('[data-sidebar-toggle]');
    const sidebar = document.querySelector('.sidebar');
    if (toggle && sidebar) {
      toggle.addEventListener('click', function () {
        sidebar.classList.toggle('open');
      });
    }

    // Auto-dismiss alerts after 6s
    document.querySelectorAll('.alert[data-auto-dismiss]').forEach(function (el) {
      setTimeout(function () {
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.3s';
        setTimeout(function () {
          el.remove();
        }, 300);
      }, 6000);
    });
  });
})();
