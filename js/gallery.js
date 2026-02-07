function titleFromSrc(src) {
  const file = (src.split("/").pop() || "").trim();
  const noExt = file.replace(/\.[^.]+$/, "");
  return noExt
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createLightbox() {
  const lightbox = document.createElement("div");
  lightbox.className = "lightbox";
  lightbox.innerHTML = `
    <div class="lightbox-backdrop" aria-hidden="true"></div>
    <div class="lightbox-content" role="dialog" aria-modal="true" aria-label="Image viewer">
      <button class="lightbox-close" type="button" aria-label="Close">×</button>
      <img class="lightbox-img" alt="">
      <div class="lightbox-caption" aria-live="polite"></div>
    </div>
  `;
  document.body.appendChild(lightbox);

  const lbImg = lightbox.querySelector(".lightbox-img");
  const lbCap = lightbox.querySelector(".lightbox-caption");
  const lbClose = lightbox.querySelector(".lightbox-close");
  const lbBackdrop = lightbox.querySelector(".lightbox-backdrop");

  function open({ src, title }) {
    lbImg.src = src;
    lbImg.alt = title || "Artwork";
    lbCap.textContent = title || "";
    lightbox.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function close() {
    lightbox.classList.remove("open");
    lbImg.src = "";
    lbCap.textContent = "";
    document.body.style.overflow = "";
  }

  lbClose.addEventListener("click", close);
  lbBackdrop.addEventListener("click", close);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && lightbox.classList.contains("open")) close();
  });

  return { open };
}

/**
 * Desktop justified rows:
 * - Only runs above breakpoint (CSS handles mobile via columns)
 * - Sets img height = targetRowHeight and width based on aspect ratio
 * - Adjusts each row so it exactly fills container width
 */
function getFrameExtraX(sampleItem) {
  const btn = sampleItem.item.querySelector(".g-open");
  if (!btn) return 0;
  const cs = getComputedStyle(btn);

  const px =
    (parseFloat(cs.paddingLeft) || 0) +
    (parseFloat(cs.paddingRight) || 0) +
    (parseFloat(cs.borderLeftWidth) || 0) +
    (parseFloat(cs.borderRightWidth) || 0);

  return px;
}

function layoutJustified(galleryEl, items, opts) {
  const containerWidth = galleryEl.clientWidth;
  if (!containerWidth) return;

  const gap = opts.gap;                 // px
  const targetH = opts.targetRowHeight; // px

  // IMPORTANT: account for frame padding/border
  const frameExtraX = getFrameExtraX(items[0]);

  galleryEl.innerHTML = "";

  const rows = [];
  let row = [];
  let rowAspectSum = 0;

  for (const it of items) {
    row.push(it);
    rowAspectSum += it.ratio;

    // Estimate row width INCLUDING gaps + frame padding
    const estImgWidth = rowAspectSum * targetH;
    const estGap = gap * (row.length - 1);
    const estFrames = frameExtraX * row.length;
    const estTotal = estImgWidth + estGap + estFrames;

    if (estTotal >= containerWidth && row.length > 1) {
      rows.push(row);
      row = [];
      rowAspectSum = 0;
    }
  }
  if (row.length) rows.push(row);

  rows.forEach((r, idx) => {
    const isLastRow = idx === rows.length - 1;

    // Google-like: last row not stretched
    const stretch = !isLastRow;

    const totalGap = gap * (r.length - 1);
    const totalFrames = frameExtraX * r.length;
    const sumRatios = r.reduce((s, it) => s + it.ratio, 0);

    // Available width for IMAGES (frames+gaps already reserved)
    const availableForImages = containerWidth - totalGap - totalFrames;

    const rowH = stretch ? (availableForImages / sumRatios) : targetH;

    const rowEl = document.createElement("div");
    rowEl.className = "g-row";
    rowEl.style.gap = `${gap}px`; // ensure CSS and JS agree

    r.forEach((it) => {
      const w = it.ratio * rowH;

      it.img.style.height = `${Math.round(rowH)}px`;
      it.img.style.width = `${Math.round(w)}px`;

      it.item.style.width = "auto";
      rowEl.appendChild(it.item);
    });

    galleryEl.appendChild(rowEl);
  });
}

async function loadGallery() {
  const gallery = document.querySelector(".gallery");
  if (!gallery) return;

  const galleryName = gallery.dataset.gallery;
  const showCaptions = gallery.dataset.captions !== "off";
  const lightbox = createLightbox();

  const res = await fetch("data/galleries.json", { cache: "no-store" });
  const data = await res.json();
  const images = data[galleryName] || [];

  if (!images.length) {
    gallery.innerHTML = "<p>No works uploaded yet.</p>";
    return;
  }

  const items = [];

  // Build DOM
  for (const src of images) {
    const title = titleFromSrc(src);

    const fig = document.createElement("figure");
    fig.className = "g-item";

    const btn = document.createElement("button");
    btn.className = "g-open";
    btn.type = "button";
    btn.setAttribute("aria-label", `Open ${title || "image"}`);

    const img = document.createElement("img");
    img.className = "g-img";
    img.src = src;
    img.loading = "lazy";
    img.alt = title;

    btn.appendChild(img);
    fig.appendChild(btn);

    if (showCaptions) {
        const cap = document.createElement("figcaption");
        cap.className = "g-cap";
        cap.textContent = title;
        fig.appendChild(cap);
    }


    btn.addEventListener("click", () => lightbox.open({ src, title }));

    gallery.appendChild(fig);

    items.push({ item: fig, img, ratio: 1 });
  }

  // Wait for intrinsic sizes (naturalWidth/Height)
  await Promise.all(items.map(it => new Promise(resolve => {
    if (it.img.complete && it.img.naturalWidth) {
      it.ratio = it.img.naturalWidth / it.img.naturalHeight;
      resolve();
    } else {
      it.img.addEventListener("load", () => {
        it.ratio = it.img.naturalWidth / it.img.naturalHeight;
        resolve();
      }, { once: true });
      it.img.addEventListener("error", resolve, { once: true });
    }
  })));

  // Only apply justified rows on desktop
  const mq = window.matchMedia("(max-width: 900px)");

  function relayout() {
    if (mq.matches) {
      // Mobile: CSS columns handles it; ensure imgs are responsive width
      items.forEach(it => {
        it.img.style.width = "100%";
        it.img.style.height = "auto";
        it.item.style.display = "inline-block";
        it.item.style.marginRight = "";
        it.item.style.marginBottom = "";
      });
      return;
    }

    const rowGap = (() => {
  const test = document.createElement("div");
  test.className = "g-row";
  test.style.visibility = "hidden";
  gallery.appendChild(test);
  const gap = parseFloat(getComputedStyle(test).gap) || 24;
  test.remove();
  return gap;
})();

layoutJustified(gallery, items, {
  targetRowHeight: 240,
  gap: rowGap
});

  }

  // Initial + resize
  relayout();
  window.addEventListener("resize", () => {
    // small debounce
    clearTimeout(window.__galleryResizeTimer);
    window.__galleryResizeTimer = setTimeout(relayout, 80);
  });
  mq.addEventListener?.("change", relayout);
}

loadGallery();