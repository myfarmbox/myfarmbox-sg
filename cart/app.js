(() => {
  "use strict";

  const API = "https://script.google.com/macros/s/AKfycbw4ioZTLJKaFXWad3zJqyWXzde7-I5S6Q9LndoF2zu7EzgnEku75U2nAkceQBXLjpJi/exec";
  const CART_KEY = "mfb_sg_cart_v1";
  const DRAFT_KEY = "mfb_sg_checkout_draft_v1";
  const MIN_DEFAULT = 5;

  const $ = id => document.getElementById(id);
  const els = {
    loading:$("loading"),empty:$("empty"),layout:$("layout"),items:$("items"),
    sumItems:$("sumItems"),sumWeight:$("sumWeight"),sumDelivery:$("sumDelivery"),sumTotal:$("sumTotal"),
    deliveryDate:$("deliveryDate"),minimumStatus:$("minimumStatus"),minimumWeight:$("minimumWeight"),
    progressBar:$("progressBar"),subtotal:$("subtotal"),deliveryFee:$("deliveryFee"),grandTotal:$("grandTotal"),
    warning:$("warning"),confirmBtn:$("confirmBtn"),clearBtn:$("clearBtn"),clearDialog:$("clearDialog"),
    keepBtn:$("keepBtn"),clearAllBtn:$("clearAllBtn"),notes:$("notes"),notesCount:$("notesCount")
  };

  let minimumKg = MIN_DEFAULT;
  let deliveryFee = 0;
  let productMap = new Map();

  const readCart = () => {
    if (window.MFBCart) {
      return window.MFBCart.read();
    }

    try {
      const x = JSON.parse(
        localStorage.getItem(CART_KEY) || "[]"
      );

      return Array.isArray(x) ? x : [];
    } catch {
      return [];
    }
  };

  const writeCart = cart => {
    if (window.MFBCart) {
      window.MFBCart.write(cart);
    } else {
      localStorage.setItem(
        CART_KEY,
        JSON.stringify(cart)
      );

      if (
        typeof window.updateSharedCartCount === "function"
      ) {
        window.updateSharedCartCount();
      }
    }
  };

  const money = n =>
    new Intl.NumberFormat(
      "en-SG",
      {
        style: "currency",
        currency: "SGD",
        minimumFractionDigits: 2
      }
    ).format(Number(n || 0));

  function cartSummary(cart = readCart()) {
    if (window.MFBCart) {
      return window.MFBCart.summarize(
        cart,
        {
          minimumKg
        }
      );
    }

    const weightEach = item =>
      item.unitType === "kg"
        ? Number(item.unitValue || 0)
        : item.unitType === "g"
          ? Number(item.unitValue || 0) / 1000
          : 0;

    const quantity = cart.reduce(
      (sum, item) =>
        sum + Number(item.quantity || 0),
      0
    );

    const weightKg = cart.reduce(
      (sum, item) =>
        sum +
        weightEach(item) *
        Number(item.quantity || 0),
      0
    );

    const subtotal = cart.reduce(
      (sum, item) =>
        sum +
        Number(
          item.unitPrice ||
          item.price ||
          0
        ) *
        Number(item.quantity || 0),
      0
    );

    const hasExemptProduct = cart.some(
      item =>
        item.minimumOrderExempt === true &&
        Number(item.quantity || 0) > 0
    );

    return {
      quantity,
      weightKg,
      subtotal,
      minimumKg,
      remainingKg:
        Math.max(0, minimumKg - weightKg),
      progressPercent:
        hasExemptProduct
          ? 100
          : Math.min(
              100,
              (weightKg / minimumKg) * 100
            ),
      hasExemptProduct,
      qualified:
        weightKg >= minimumKg ||
        hasExemptProduct
    };
  }

  function displayName(item){
    const raw=String(item.productName||"Fresh produce");
    const parts=raw.split(" - ");
    return parts.length>1?parts.slice(1).join(" - ").trim():raw;
  }

  function imageUrl(url){
    const v=String(url||"").trim();
    if(!v)return "";
    return /^(https?:\/\/|\/)/.test(v)?v:`/${v.replace(/^\.\//,"")}`;
  }

  function deliveryDate(){
    const nowParts = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Singapore",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date()).reduce((o,p)=>(p.type!=="literal"&&(o[p.type]=p.value),o),{});
    const now = new Date(Date.UTC(+nowParts.year,+nowParts.month-1,+nowParts.day,+nowParts.hour,+nowParts.minute));
    const day=now.getUTCDay();
    const afterWed = day>3 || (day===3 && (now.getUTCHours()>23 || (now.getUTCHours()===23 && now.getUTCMinutes()>59)));
    let add=(7-day)%7;
    if(add===0 || afterWed) add+=7;
    const d=new Date(now); d.setUTCDate(d.getUTCDate()+add);
    return d;
  }

  function saveDraft(){
    let draft={};
    try{draft=JSON.parse(localStorage.getItem(DRAFT_KEY)||"{}")}catch{}
    draft.notes=els.notes.value.trim();
    draft.returns=[...document.querySelectorAll(".return-grid input:checked")].map(i=>i.value);
    draft.deliveryDate=deliveryDate().toISOString().slice(0,10);
    localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));
  }

  function restoreDraft(){
    let draft={};
    try{draft=JSON.parse(localStorage.getItem(DRAFT_KEY)||"{}")}catch{}
    els.notes.value=String(draft.notes||"");
    els.notesCount.textContent=`${els.notes.value.length} / 500`;
    const returns=Array.isArray(draft.returns)?draft.returns:[];
    document.querySelectorAll(".return-grid input").forEach(i=>i.checked=returns.includes(i.value));
  }

  function itemNode(item){
    const live=productMap.get(item.productId);
    const available=Boolean(live);
    const article=document.createElement("article");
    article.className=`item${available?"":" unavailable"}`;
    const img=imageUrl(item.imageUrl);

    const lineTotal = window.MFBCart
      ? window.MFBCart.itemTotal(item)
      : Number(item.unitPrice || 0) *
        Number(item.quantity || 0);

    article.innerHTML=`
      <div class="item-img">
        ${img?`<img src="${img}" alt="">`:""}
        <div class="placeholder"${img?" hidden":""}>🌿</div>
      </div>
      <div class="item-info">
        <h3>${displayName(item)}</h3>
        <p>${item.unitLabel} · ${money(item.unitPrice)} each</p>
        <b>${(Number(item.unitValue)*Number(item.quantity)).toFixed(Number.isInteger(Number(item.unitValue)*Number(item.quantity))?0:2)} ${item.unitType}</b>
        ${item.minimumOrderExempt === true ? "<p style='color:#438d35;font-weight:700'>Complete harvest</p>" : ""}
        ${available?"":"<p style='color:#9f4338;font-weight:700'>Currently unavailable</p>"}
      </div>
      <div class="item-actions">
        <div class="qty">
          <button data-minus type="button">−</button>
          <span>${item.quantity}</span>
          <button data-plus type="button"${available?"":" disabled"}>+</button>
        </div>
        <button data-remove class="remove" type="button">Remove</button>
        <strong class="line-total">${money(lineTotal)}</strong>
      </div>`;

    const image=article.querySelector("img"), ph=article.querySelector(".placeholder");
    if(image) image.addEventListener("error",()=>{image.hidden=true;ph.hidden=false});
    article.querySelector("[data-minus]").onclick=()=>updateQty(item.productId,Number(item.quantity)-1);
    article.querySelector("[data-plus]").onclick=()=>updateQty(item.productId,Number(item.quantity)+1);
    article.querySelector("[data-remove]").onclick=()=>updateQty(item.productId,0);
    return article;
  }

  function updateQty(id,qty){
    const cart=readCart();
    const i=cart.findIndex(x=>x.productId===id);
    if(i<0)return;

    const min = Number(
      cart[i].minQuantity || 1
    );

    const max=Number(
      cart[i].maxQuantity || 99
    );

    if(qty<=0){
      cart.splice(i,1);
    }else{
      cart[i].quantity=Math.max(
        min,
        Math.min(max,qty)
      );
    }

    writeCart(cart);
    render();
  }

  function render(){
    const cart=readCart();

    if(!cart.length){
      els.layout.hidden=true;
      els.empty.hidden=false;
      return;
    }

    els.empty.hidden=true;
    els.layout.hidden=false;
    els.items.innerHTML="";

    cart.forEach(
      item =>
        els.items.appendChild(
          itemNode(item)
        )
    );

    const summary=cartSummary(cart);
    const d=deliveryDate();

    const dateLabel=new Intl.DateTimeFormat("en-SG",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(d);
    const shortLabel=new Intl.DateTimeFormat("en-SG",{day:"numeric",month:"short",timeZone:"UTC"}).format(d);

    const unavailable=cart.some(
      item =>
        !productMap.has(item.productId)
    );

    const ready=
      summary.qualified &&
      !unavailable;

    els.sumItems.textContent=
      summary.quantity;

    els.sumWeight.textContent=
      `${summary.weightKg.toFixed(2)} kg`;

    els.sumDelivery.textContent=
      shortLabel;

    els.sumTotal.textContent=
      money(
        summary.subtotal +
        deliveryFee
      );

    els.deliveryDate.textContent=
      dateLabel;

    els.minimumWeight.textContent=
      `${summary.weightKg.toFixed(2)} / ${summary.minimumKg.toFixed(2)} kg`;

    els.progressBar.style.width=
      `${summary.progressPercent}%`;

    els.subtotal.textContent=
      money(summary.subtotal);

    els.deliveryFee.textContent=
      deliveryFee
        ? money(deliveryFee)
        : "FREE";

    els.grandTotal.textContent=
      money(
        summary.subtotal +
        deliveryFee
      );

    if(unavailable){
      els.minimumStatus.textContent=
        "Remove unavailable products.";

      els.warning.textContent=
        "One or more products are unavailable.";

      els.warning.classList.remove(
        "ready"
      );
    }else if(summary.hasExemptProduct){
      els.minimumStatus.textContent=
        "Your Combo Box qualifies as a complete harvest.";

      els.warning.textContent=
        "Complete harvest selected. You may add more products if needed.";

      els.warning.classList.add(
        "ready"
      );
    }else if(ready){
      els.minimumStatus.textContent=
        "Your harvest is ready.";

      els.warning.textContent=
        "Your harvest is ready for confirmation.";

      els.warning.classList.add(
        "ready"
      );
    }else{
      els.minimumStatus.textContent=
        `Add another ${summary.remainingKg.toFixed(2)} kg.`;

      els.warning.textContent=
        `Add ${summary.remainingKg.toFixed(2)} kg more to reach the ${summary.minimumKg.toFixed(2)} kg minimum.`;

      els.warning.classList.remove(
        "ready"
      );
    }

    els.confirmBtn.classList.toggle(
      "disabled",
      !ready
    );

    els.confirmBtn.setAttribute(
      "aria-disabled",
      ready ? "false" : "true"
    );

    saveDraft();
  }

  async function init(){
    restoreDraft();

    if(!readCart().length){
      els.loading.hidden=true;
      els.empty.hidden=false;
      return;
    }

    try{
      const controller=new AbortController();
      setTimeout(()=>controller.abort(),12000);

      const r=await fetch(
        `${API}?action=getProducts`,
        {
          cache:"no-store",
          signal:controller.signal
        }
      );

      const data=await r.json();

      minimumKg=Number(
        data.settings?.minimumOrderKg ||
        MIN_DEFAULT
      );

      deliveryFee=Number(
        data.settings?.deliveryFee || 0
      );

      productMap=new Map(
        (data.products||[])
          .map(p=>[p.handleId,p])
      );

      if (window.MFBCart) {
        window.MFBCart.hydrateFromProducts(
          readCart(),
          data.products || []
        );
      } else {
        const refreshed=readCart().map(item=>{
          const p=productMap.get(item.productId);
          if(!p)return item;

          return {
            ...item,
            productName:p.name,
            imageUrl:p.imageUrl,
            unitLabel:p.unitLabel,
            unitValue:+p.unitValue,
            unitType:p.unitType,
            unitPrice:+p.price,
            minimumOrderExempt:
              Boolean(
                p.minimumOrderExempt
              ),
            minQuantity:
              +(p.minQuantity || 1),
            maxQuantity:
              +(p.maxQuantity||p.stockUnits||99),
            quantity:Math.min(
              +item.quantity,
              +(p.maxQuantity||p.stockUnits||99)
            )
          };
        });

        writeCart(refreshed);
      }
    }catch(e){
      console.error(e);
    }

    els.loading.hidden=true;
    render();
  }

  els.clearBtn.onclick=
    ()=>els.clearDialog.showModal();

  els.keepBtn.onclick=
    ()=>els.clearDialog.close();

  els.clearAllBtn.onclick=()=>{
    if (window.MFBCart) {
      window.MFBCart.clear();
    } else {
      writeCart([]);
    }

    els.clearDialog.close();
    render();
  };

  els.notes.oninput=()=>{
    els.notesCount.textContent=
      `${els.notes.value.length} / 500`;

    saveDraft();
  };

  document
    .querySelectorAll(".return-grid input")
    .forEach(i=>i.onchange=saveDraft);

  els.confirmBtn.onclick=e=>{
    const cart=readCart();
    const summary=cartSummary(cart);

    if(
      !cart.length ||
      !summary.qualified ||
      cart.some(
        item =>
          !productMap.has(item.productId)
      )
    ){
      e.preventDefault();
    }else{
      saveDraft();
    }
  };

  window.addEventListener(
    "mfb:cart-changed",
    render
  );

  init();
})();