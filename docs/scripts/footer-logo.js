// Replace specs.md text with pixel logo in navbar and footer
document.addEventListener('DOMContentLoaded', function() {
  const replaceLogo = () => {
    // Find all specs.md links
    const specsLinks = document.querySelectorAll('a[href="https://specs.md"]');
    specsLinks.forEach(link => {
      if (!link.dataset.logoReplaced) {
        link.innerHTML = `
          <img src="/images/specs_md_pixel_logo.png" alt="specs.md" style="height: 24px;" class="hover:opacity-80 transition-opacity" />
        `;
        link.dataset.logoReplaced = 'true';
      }
    });
  };

  // Try immediately and also observe for dynamic loading
  replaceLogo();

  const observer = new MutationObserver(() => {
    replaceLogo();
  });

  observer.observe(document.body, { childList: true, subtree: true });
});
