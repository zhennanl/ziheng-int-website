// Worker entry: the quote form API, everything else is the static site in dist/.
import { handleRfq, handleSearchMiss } from "./rfq.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // One address for search engines: www.ziheng-int.com -> ziheng-int.com (same path and query)
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === "/api/rfq") return handleRfq(request, env);
    if (url.pathname === "/api/search-miss") return handleSearchMiss(request);
    return env.ASSETS.fetch(request);
  },
};
