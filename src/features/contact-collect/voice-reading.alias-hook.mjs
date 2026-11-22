import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const src = fileURLToPath(new URL("../../", import.meta.url));

function withTs(file) {
  if (existsSync(file)) return file;
  if (existsSync(`${file}.ts`)) return `${file}.ts`;
  if (existsSync(`${file}.tsx`)) return `${file}.tsx`;
  return file;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    return next(pathToFileURL(withTs(join(src, specifier.slice(2)))).href, context);
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
    return next(pathToFileURL(withTs(join(dirname(fileURLToPath(context.parentURL)), specifier))).href, context);
  }
  return next(specifier, context);
}
