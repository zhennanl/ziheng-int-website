// Worker entry: the quote form API, everything else is the static site in dist/.
import { handleRfq } from "./rfq.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/rfq") return handleRfq(request, env);
    return env.ASSETS.fetch(request);
  },
};
