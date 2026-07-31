(async () => {
  try {
    const result = await browser.storage.local.get('extensionSettings');
    const settings = result.extensionSettings || {};
    if (settings.openInNewTabs === false) {
      window.location.replace('about:home');
    }
  } catch (e) {
    console.warn('OwnSpace: could not check extensionSettings', e);
  }
})();