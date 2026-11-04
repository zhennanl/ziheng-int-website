// Inventory filter (with ?q= from the home page search) and WeChat dialog.
(function () {
  var input = document.getElementById("filter");
  if (input) {
    var rows = Array.prototype.slice.call(document.querySelectorAll("table.parts tbody tr"));
    var count = document.getElementById("count");
    var empty = document.getElementById("empty");
    var norm = function (s) { return s.toLowerCase().replace(/[\s\-_/#.]/g, ""); };
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
    b.addEventListener("click", function () { if (dlg && dlg.showModal) dlg.showModal(); });
  });
})();
