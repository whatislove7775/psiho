// Resolve extensionless relative imports to .ts so Node's type stripping can load app modules:
//   node --import ./src/lib/avatar/__tests__/register.mjs --test src/lib/avatar/__tests__/schema.test.mjs
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); } catch (e) {
    if (spec.startsWith(".") && !/\\.[cm]?[jt]s$/.test(spec)) return next(spec + ".ts", ctx);
    throw e;
  }
}`),
  import.meta.url,
);
