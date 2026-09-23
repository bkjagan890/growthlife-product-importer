export function toast(message: string, isError = false) {
  try {
    (window as any).shopify?.toast?.show(message, { isError, duration: isError ? 6000 : 3000 });
  } catch {
    /* ignore */
  }
  if (!(window as any).shopify?.toast) console[isError ? "error" : "log"](message);
}
