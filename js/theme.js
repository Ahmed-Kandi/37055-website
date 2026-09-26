// Samples the two most prominent colors from img/logo.png and applies them as
// the site's --primary and --accent colors, so the whole site follows the logo.
(function () {
  var img = new Image();
  img.src = "img/logo.png";
  img.onload = function () {
    try {
      var size = 64;
      var canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, size, size);
      var data = ctx.getImageData(0, 0, size, size).data;

      // Bucket saturated, non-transparent pixels by coarse hue/lightness.
      var buckets = {};
      for (var i = 0; i < data.length; i += 4) {
        var r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 128) continue;
        var hsl = toHsl(r, g, b);
        if (hsl[1] < 0.25 || hsl[2] < 0.15 || hsl[2] > 0.9) continue; // skip greys, black, white
        var key = Math.round(hsl[0] / 20) + ":" + Math.round(hsl[2] * 4);
        var bk = buckets[key] || (buckets[key] = { n: 0, r: 0, g: 0, b: 0, h: hsl[0] });
        bk.n++; bk.r += r; bk.g += g; bk.b += b;
      }
      var sorted = Object.keys(buckets).map(function (k) { return buckets[k]; })
        .sort(function (x, y) { return y.n - x.n; });
      if (!sorted.length) return;

      var primary = sorted[0];
      // Accent: the most common color with a clearly different hue.
      var accent = sorted.find(function (c) { return hueDist(c.h, primary.h) > 40; }) || null;

      var root = document.documentElement.style;
      root.setProperty("--primary", avg(primary));
      if (accent) root.setProperty("--accent", avg(accent));
      else root.setProperty("--accent", lighten(primary));
    } catch (e) { /* canvas blocked (e.g. file://) – keep fallback colors */ }
  };

  function avg(c) {
    return "rgb(" + Math.round(c.r / c.n) + "," + Math.round(c.g / c.n) + "," + Math.round(c.b / c.n) + ")";
  }
  function lighten(c) {
    var f = function (v) { return Math.round(v / c.n + (255 - v / c.n) * 0.45); };
    return "rgb(" + f(c.r) + "," + f(c.g) + "," + f(c.b) + ")";
  }
  function hueDist(a, b) { var d = Math.abs(a - b); return Math.min(d, 360 - d); }
  function toHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, h = 0, s = 0;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
})();
