import path from "node:path";

/** `p` with "/" between its parts. Where `sep` is "/" (Linux) it returns `p` unchanged. */
export function toPosix(p: string, sep: string = path.sep): string {
  return p.split(sep).join("/");
}

/** `impl.relative(root, p)` with "/" separators: the form every pinned list is written in. */
export function posixRelative(root: string, p: string, impl: path.PlatformPath = path): string {
  return toPosix(impl.relative(root, p), impl.sep);
}
