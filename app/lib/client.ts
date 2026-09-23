// Browser helpers. App Bridge adds the session token to same-origin fetch calls.

export async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Server error (${res.status})`);
  }
  if (!res.ok || data?.error) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}

export function postJson<T = any>(url: string, body: unknown) {
  return fetchJson<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function downloadFile(url: string, fallbackName: string) {
  const res = await fetch(url);
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const cd = res.headers.get("Content-Disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName;
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
  return name;
}

export async function uploadImage(file: File, matchKey?: string) {
  const fd = new FormData();
  fd.append("file", file);
  if (matchKey) fd.append("matchKey", matchKey);
  return fetchJson<{ resourceUrl: string; product?: { id: string; title: string }; error?: string }>(
    "/app/api/upload",
    { method: "POST", body: fd },
  );
}

export function toast(message: string, isError = false) {
  try {
    (window as any).shopify?.toast?.show(message, { isError });
  } catch {
    /* ignore */
  }
}
