// Inventory filter, WeChat dialog, quote request form, and lead tracking.
(function () {
  var track = function (method, part) {
    try { if (window.gtag) window.gtag("event", "generate_lead", { method: method, part_number: part || "" }); } catch (e) {}
  };

  var input = document.getElementById("filter");
  if (input) {
    var rows = Array.prototype.slice.call(document.querySelectorAll("table.parts tbody tr"));
    var count = document.getElementById("count");
    var empty = document.getElementById("empty");
    var norm = function (s) { return s.toLowerCase().replace(/[\s\-_/#.:+()]/g, ""); };
    var keys = rows.map(function (r) { return { raw: r.getAttribute("data-s"), n: norm(r.getAttribute("data-s")) }; });
    var apply = function () {
      var q = input.value.trim().toLowerCase();
      var nq = norm(q);
      var shown = 0;
      rows.forEach(function (r, i) {
        var ok = !q || keys[i].raw.indexOf(q) !== -1 || (nq && keys[i].n.indexOf(nq) !== -1);
        r.hidden = !ok;
        if (ok) shown++;
      });
      if (count) count.textContent = shown + (shown === 1 ? " part" : " parts");
      if (empty) empty.hidden = shown !== 0;
    };
    var q = new URLSearchParams(location.search).get("q");
    if (q) input.value = q;
    input.addEventListener("input", apply);
    apply();
  }

  var dlg = document.getElementById("wechat-dialog");
  document.querySelectorAll("[data-wechat]").forEach(function (b) {
    b.addEventListener("click", function () { track("wechat"); if (dlg && dlg.showModal) dlg.showModal(); });
  });

  // Count contact clicks as leads
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    var h = a.getAttribute("href");
    var pnEl = document.querySelector(".part-pn");
    var pn = pnEl ? pnEl.textContent : "";
    if (h.indexOf("mailto:") === 0) track("email", pn);
    else if (h.indexOf("https://wa.me/") === 0) track("whatsapp", pn);
    else if (h.indexOf("tel:") === 0) track("phone", pn);
  });

  // Quote request form: POST to /api/rfq; if that isn't set up, fall back to a pre-filled email.
  document.querySelectorAll("form[data-rfq]").forEach(function (form) {
    var status = form.querySelector(".form-status");
    var btn = form.querySelector("button[type=submit]");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = String(v).trim(); });
      var missing = [];
      if (!data.part) missing.push("part number");
      if (!data.quantity) missing.push("quantity");
      if (!data.name) missing.push("name");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email || "")) missing.push("a valid email");
      if (missing.length) { status.textContent = "Please add " + missing.join(", ") + "."; status.className = "form-status small err"; return; }
      btn.disabled = true; status.className = "form-status small"; status.textContent = "Sending…";
      var fallback = function () {
        var S = window.SITE || {};
        var body = "Part number: " + data.part + "\nQuantity: " + data.quantity + "\nNeeded by: " + (data.needed_by || "") +
          "\n\nName: " + data.name + "\nCompany: " + (data.company || "") + "\nEmail: " + data.email + "\nCountry: " + (data.country || "") +
          (data.message ? "\n\nNotes: " + data.message : "");
        location.href = "mailto:" + S.email + "?subject=" + encodeURIComponent("RFQ: " + data.part) + "&body=" + encodeURIComponent(body);
        status.textContent = "Your email app should open with the request filled in. If it doesn't, email " + S.email + ".";
        btn.disabled = false;
        track("form_email_fallback", data.part);
      };
      fetch("/api/rfq", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(function (r) {
          if (r.ok) {
            form.reset(); form.querySelector("[name=part]").value = data.part;
            status.className = "form-status small ok";
            status.textContent = "Thank you. Your request for " + data.part + " was sent. We'll reply to " + data.email + ".";
            btn.disabled = false;
            track("form", data.part);
          } else if (r.status === 400) {
            r.json().then(function (j) { status.textContent = j.error || "Please check the form."; status.className = "form-status small err"; btn.disabled = false; },
                          function () { fallback(); });
          } else fallback();
        })
        .catch(fallback);
    });
  });
})();
