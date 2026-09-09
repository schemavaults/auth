/** Test helper: builds a FormData from `[name, value]` pairs. */
export function form(entries: [string, string][]): FormData {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}
