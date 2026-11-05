// Inventory filter, WeChat dialog, quote request form, and lead tracking.
(function () {
  var ZH = (window.SITE || {}).lang === "zh";
  var M = ZH ? {
    part: "零件", parts: "个型号", add: "请填写：", pn: "型号", qty: "数量", name: "姓名", email: "有效的邮箱", sep: "、",
    sending: "正在发送…", fallback: function (e) { return "已为您打开邮件应用并填好询价内容。如未打开，请发邮件至 " + e + "。"; },
    ok: function (p, e) { return "谢谢！型号 " + p + " 的询价已发送，我们将回复至 " + e + "。"; }, check: "请检查表单内容。",
    body: function (d) { return "型号：" + d.part + "\n数量：" + d.quantity + "\n需求时间：" + (d.needed_by || "") + "\n\n姓名：" + d.name + "\n公司：" + (d.company || "") + "\n邮箱：" + d.email + "\n国家/地区：" + (d.country || "") + (d.message ? "\n\n备注：" + d.message : ""); },
    subject: "询价："
  } : {
    part: "part", parts: "parts", add: "Please add ", pn: "part number", qty: "quantity", name: "name", email: "a valid email", sep: ", ",
    sending: "Sending…", fallback: function (e) { return "Your email app should open with the request filled in. If it doesn't, email " + e + "."; },
    ok: function (p, e) { return "Thank you. Your request for " + p + " was sent. We'll reply to " + e + "."; }, check: "Please check the form.",
    body: function (d) { return "Part number: " + d.part + "\nQuantity: " + d.quantity + "\nNeeded by: " + (d.needed_by || "") + "\n\nName: " + d.name + "\nCompany: " + (d.company || "") + "\nEmail: " + d.email + "\nCountry: " + (d.country || "") + (d.message ? "\n\nNotes: " + d.message : ""); },
    subject: "RFQ: "
  };
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
      if (count) count.textContent = ZH ? shown + " " + M.parts : shown + (shown === 1 ? " part" : " parts");
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
      if (!data.part) missing.push(M.pn);
      if (!data.quantity) missing.push(M.qty);
      if (!data.name) missing.push(M.name);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email || "")) missing.push(M.email);
      if (missing.length) { status.textContent = M.add + missing.join(M.sep) + (ZH ? "。" : "."); status.className = "form-status small err"; return; }
      btn.disabled = true; status.className = "form-status small"; status.textContent = M.sending;
      var fallback = function () {
        var S = window.SITE || {};
        location.href = "mailto:" + S.email + "?subject=" + encodeURIComponent(M.subject + data.part) + "&body=" + encodeURIComponent(M.body(data));
        status.textContent = M.fallback(S.email);
        btn.disabled = false;
        track("form_email_fallback", data.part);
      };
      data.lang = ZH ? "zh" : "en";
      fetch("/api/rfq", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(function (r) {
          if (r.ok) {
            form.reset(); form.querySelector("[name=part]").value = data.part;
            status.className = "form-status small ok";
            status.textContent = M.ok(data.part, data.email);
            btn.disabled = false;
            track("form", data.part);
          } else if (r.status === 400) {
            r.json().then(function (j) { status.textContent = ZH ? M.check : (j.error || M.check); status.className = "form-status small err"; btn.disabled = false; },
                          function () { fallback(); });
          } else fallback();
        })
        .catch(fallback);
    });
  });
})();
