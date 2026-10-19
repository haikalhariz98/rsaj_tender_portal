// The normal vitest config plus the file-set recorder (see record-setup.mts).
// Lives in the repo because a config outside it cannot resolve "vitest/config".
import { mergeConfig } from "vitest/config";
import base from "../../vitest.config.mjs";

export default mergeConfig(base, {
  test: {
    setupFiles: ["scripts/scan-sets/record-setup.mts"],
  },
});
