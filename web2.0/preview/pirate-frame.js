// Keep the copied standalone tools on the preview API and use the account
// selected by the parent page in this tab.
(() => {
  const originalFetch = window.fetch.bind(window);
  let account;
  try {
    account = JSON.parse(sessionStorage.getItem("pirate-ttrpg-preview:account"));
  } catch {
    // The preview API defaults to the Test Player account.
  }
  if (!account) return;
  window.fetch = (input, options) => {
    const request = new Request(input instanceof Request ? input : new URL(input, document.baseURI), options);
    const url = new URL(request.url);
    if (url.origin === window.location.origin && /^\/pirate-(?:system|character-sheet|homebrew)\//.test(url.pathname)) {
      request.headers.set("X-Preview-Username", encodeURIComponent(account.username));
      request.headers.set("X-Preview-Role", account.role);
    }
    return originalFetch(request);
  };
})();
