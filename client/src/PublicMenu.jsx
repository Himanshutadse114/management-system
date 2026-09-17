import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowUp,
  CheckCircle2,
  MapPin,
  Phone,
  Plus,
  Search,
  Send,
  ShoppingCart,
  Sparkles,
  UtensilsCrossed,
  Wine,
  X,
} from "lucide-react";
import { api, apiErrorMessage } from "./api";
import { LanguageSwitcher, useLanguage } from "./LanguageContext";
import {
  localeMoney,
  localeNumber,
  localizeMenuItem,
  localizeMenuValue,
  publicMenuText,
} from "./publicMenuI18n";
import "./publicMenu.css";

function MenuItemCard({ item, featuredLabel, locale, onAdd }) {
  const prices = item.product?.priceOptions || [];
  const image = item.product?.imageUrl;
  const alcohol = item.product?.productType === "ALCOHOL";

  return (
    <article
      className={`public-menu-card ${item.featured ? "is-featured" : ""}`}
    >
      <div className="public-menu-card-media">
        {image ? (
          <img src={image} alt={item.displayName} loading="lazy" />
        ) : (
          <div className="public-menu-image-placeholder">
            <span className="public-menu-placeholder-ring">
              {alcohol ? <Wine size={34} /> : <UtensilsCrossed size={34} />}
            </span>
          </div>
        )}
        {item.featured && (
          <div className="public-menu-featured">
            <Sparkles size={12} />
            {featuredLabel}
          </div>
        )}
      </div>

      <div className="public-menu-card-body">
        <div className="public-menu-card-copy">
          {item.product?.brand && (
            <div className="public-menu-brandline">{item.product.brand}</div>
          )}
          <h3>{item.displayName}</h3>
          {item.description && <p>{item.description}</p>}
          {Array.isArray(item.dietaryTags) && item.dietaryTags.length > 0 && (
            <div className="public-menu-tags">
              {item.dietaryTags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          )}
        </div>

        <div className="public-menu-prices">
          {prices.map((price) => (
            <button
              key={price.id}
              type="button"
              onClick={() => onAdd(item, price)}
            >
              <span>{price.label}</span>
              <strong>{localeMoney(locale, price.priceMinor)}</strong>
              <Plus size={13} />
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function PublicMenu({ qrToken, storeSlug }) {
  const { locale } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("All");
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [customizer, setCustomizer] = useState(null);
  const [guest, setGuest] = useState({
    guestName: "",
    phone: "",
    notes: "",
    consentMarketing: false,
    paymentMethod: "PAY_AT_OUTLET",
    paymentReference: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState(null);
  const mt = (key, vars = {}) => publicMenuText(locale, key, vars);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const response = await api.get(
          storeSlug
            ? `/public/store/${encodeURIComponent(storeSlug)}`
            : `/public/menu/${encodeURIComponent(qrToken)}`,
        );
        if (alive) setData(response.data);
      } catch (err) {
        if (alive) setError(apiErrorMessage(err));
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [qrToken, storeSlug]);

  const sections = useMemo(
    () => [
      "All",
      ...new Set((data?.menu || []).map((item) => item.sectionName || "Menu")),
    ],
    [data],
  );

  const localizedMenu = useMemo(
    () => (data?.menu || []).map((item) => localizeMenuItem(locale, item)),
    [data, locale],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase(locale === "en" ? "en" : locale);
    return localizedMenu
      .filter((item) => {
        const source = item._source || item;
        const matchesSection =
          section === "All" || item._sectionKey === section;
        const searchValues = [
          item.displayName,
          item.description,
          item.product?.brand,
          item.sectionName,
          ...(item.dietaryTags || []),
          source.displayName,
          source.description,
          source.product?.brand,
          source.sectionName,
          ...(source.dietaryTags || []),
        ];
        const matchesSearch =
          !q ||
          searchValues.some((value) =>
            String(value || "")
              .toLocaleLowerCase(locale === "en" ? "en" : locale)
              .includes(q),
          );
        return matchesSection && matchesSearch;
      })
      .sort(
        (a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)),
      );
  }, [localizedMenu, locale, search, section]);

  const visibleSections = useMemo(
    () =>
      sections.filter(
        (name) => name !== "All" && (section === "All" || section === name),
      ),
    [sections, section],
  );

  function addItem(item, price) {
    if ((item.modifierGroups || []).length)
      return setCustomizer({ item, price, selections: [], notes: "" });
    commitItem(item, price, [], "");
  }
  function commitItem(item, price, selections, notes) {
    const selectedOptions = (item.modifierGroups || [])
      .flatMap((group) => group.options || [])
      .filter((option) => selections.includes(String(option.id)));
    for (const group of item.modifierGroups || []) {
      const ids = new Set((group.options || []).map((row) => String(row.id)));
      const count = selections.filter((id) => ids.has(id)).length;
      if (
        count < Number(group.min || 0) ||
        count > Number(group.max || group.options?.length || 0)
      ) {
        setError(
          `Choose ${group.min || 0}-${group.max || group.options?.length || 0} option(s) from ${group.name}.`,
        );
        return;
      }
    }
    const unitMinor = (
      BigInt(price.priceMinor || 0) +
      selectedOptions.reduce(
        (sum, row) => sum + BigInt(row.priceMinor || 0),
        0n,
      )
    ).toString();
    const key = `${price.id}:${[...selections].sort().join(",")}:${notes.trim()}`;
    setCart((current) => {
      const existing = current.find((row) => row.key === key);
      if (existing)
        return current.map((row) =>
          row.key === key
            ? { ...row, quantityUnits: row.quantityUnits + 1 }
            : row,
        );
      return [
        ...current,
        {
          key,
          priceOptionId: price.id,
          name: item.displayName,
          priceLabel: price.label,
          unitMinor,
          quantityUnits: 1,
          modifiers: [...selections],
          modifierLabels: selectedOptions.map((row) => row.label),
          notes: notes.trim() || null,
        },
      ];
    });
    setCustomizer(null);
    setError("");
    setCartOpen(true);
  }
  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (sum, row) => sum + BigInt(row.unitMinor) * BigInt(row.quantityUnits),
        0n,
      ),
    [cart],
  );
  async function submitGuestOrder(event) {
    event.preventDefault();
    try {
      if (!guest.phone.trim())
        throw new Error(
          "Enter a mobile number so the outlet can identify your order.",
        );
      if (guest.paymentMethod === "UPI" && !guest.paymentReference.trim())
        throw new Error("Enter the UPI transaction reference after paying.");
      setSubmitting(true);
      setError("");
      const endpoint = storeSlug
        ? `/public/store/${encodeURIComponent(storeSlug)}/orders`
        : `/public/menu/${encodeURIComponent(qrToken)}/orders`;
      const { data } = await api.post(endpoint, {
        ...guest,
        fulfillment: storeSlug ? "PICKUP" : "DINE_IN",
        lines: cart.map((row) => ({
          priceOptionId: row.priceOptionId,
          quantityUnits: row.quantityUnits,
          modifiers: row.modifiers,
          notes: row.notes,
        })),
        idempotencyKey: crypto.randomUUID(),
      });
      setOrderResult(data.request);
      setCart([]);
      setCartOpen(false);
    } catch (err) {
      setError(err.message || apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="public-menu-loading">
        <div className="public-menu-loader-brand">
          <img src="/deva-mark.svg" alt="Deva" />
        </div>
        <div className="public-menu-spinner" />
        <strong>Deva</strong>
        <span>{mt("loading")}</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="public-menu-error">
        <div>
          <UtensilsCrossed size={25} />
        </div>
        <h1>{mt("unavailable")}</h1>
        <p>{mt("unavailable")}</p>
        <span className="public-menu-error-brand">Deva</span>
      </div>
    );
  }

  const itemCount = localizedMenu.length;
  const sectionCount = Math.max(0, sections.length - 1);
  const heroItems = localizedMenu
    .filter((item) => item.product?.imageUrl)
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
    .slice(0, 3);

  return (
    <main className="public-menu-page" lang={locale}>
      <header className="public-menu-hero">
        <div className="public-menu-topline">
          <div className="public-menu-brand">
            <div className="public-menu-branch-mark">
              <UtensilsCrossed size={20} />
            </div>
            <div>
              <strong>{localizeMenuValue(locale, data.branch?.name)}</strong>
              <span>{mt("menu")}</span>
            </div>
          </div>

          <div className="public-menu-top-actions">
            <div className="public-menu-powered">
              <img src="/deva-mark.svg" alt="" aria-hidden="true" />
              <span>Deva</span>
            </div>
            <LanguageSwitcher compact />
          </div>
        </div>

        <div className="public-menu-hero-layout">
          <div className="public-menu-hero-copy">
            <div className="public-menu-kicker">
              <Sparkles size={14} />
              {mt("kicker")}
            </div>
            <h1>
              {mt("heroA")}
              <br />
              {mt("heroB")}
            </h1>
            <p>{mt("subtitle")}</p>

            <div className="public-menu-hero-meta">
              <span>
                <strong>{localeNumber(locale, itemCount)}</strong>{" "}
                {itemCount === 1 ? mt("item") : mt("items")}
              </span>
              <span>
                <strong>{localeNumber(locale, sectionCount)}</strong>{" "}
                {sectionCount === 1 ? mt("section") : mt("sections")}
              </span>
            </div>
          </div>

          <div className="public-menu-hero-side">
            <div
              className={`public-menu-visual ${heroItems.length ? "" : "is-empty"}`}
              aria-hidden="true"
            >
              {heroItems.length ? (
                heroItems.map((item, index) => (
                  <div
                    className={`public-menu-visual-tile tile-${index + 1}`}
                    key={item.id}
                  >
                    <img src={item.product.imageUrl} alt="" />
                    <span>{item.displayName}</span>
                  </div>
                ))
              ) : (
                <div className="public-menu-visual-fallback">
                  <div className="public-menu-fallback-illustration">
                    <span className="public-menu-fallback-main">
                      <UtensilsCrossed size={36} />
                    </span>
                    <span className="public-menu-fallback-chip chip-one">
                      <Sparkles size={16} />
                    </span>
                    <span className="public-menu-fallback-chip chip-two">
                      <Wine size={16} />
                    </span>
                  </div>
                  <div className="public-menu-fallback-copy">
                    <strong>{mt("freshChoices")}</strong>
                    <small>
                      {mt("across", {
                        items: localeNumber(locale, itemCount),
                        sections: localeNumber(locale, sectionCount),
                      })}
                    </small>
                  </div>
                </div>
              )}
            </div>

            <div className="public-menu-table-card">
              <div className="public-menu-table-icon" aria-hidden="true">
                <MapPin size={19} />
              </div>
              <div className="public-menu-table-copy">
                <span>{storeSlug ? "Direct pickup" : mt("table")}</span>
                <strong>
                  {storeSlug
                    ? data.branch?.name
                    : localizeMenuValue(locale, data.table?.name)}
                </strong>
                <small>
                  {storeSlug
                    ? "Order ahead · outlet confirmation required"
                    : `${data.table?.code} · ${mt("seats", { count: localeNumber(locale, data.table?.seats || 0) })}`}
                </small>
              </div>
            </div>
          </div>
        </div>

        {(data.branch?.address || data.branch?.phone) && (
          <div className="public-menu-contact">
            {data.branch?.address && (
              <span>
                <MapPin size={14} />
                {localizeMenuValue(locale, data.branch.address)}
              </span>
            )}
            {data.branch?.phone && (
              <a href={`tel:${data.branch.phone}`}>
                <Phone size={14} />
                {data.branch.phone}
              </a>
            )}
          </div>
        )}
      </header>

      <section className="public-menu-toolbar" aria-label={mt("filters")}>
        <div className="public-menu-toolbar-inner">
          <label className="public-menu-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={mt("search")}
              aria-label={mt("search")}
            />
          </label>

          <div
            className="public-menu-sections"
            role="tablist"
            aria-label={mt("menuSections")}
          >
            {sections.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={section === name}
                className={section === name ? "is-active" : ""}
                onClick={() => setSection(name)}
              >
                {name === "All" ? mt("all") : localizeMenuValue(locale, name)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="public-menu-content">
        {!visible.length && (
          <div className="public-menu-empty">
            <div>
              <Search size={24} />
            </div>
            <strong>{mt("noItems")}</strong>
            <span>{mt("noItemsCopy")}</span>
          </div>
        )}

        {visibleSections.map((name) => {
          const items = visible.filter((item) => item._sectionKey === name);
          if (!items.length) return null;

          return (
            <section className="public-menu-section" key={name}>
              <div className="public-menu-section-head">
                <div>
                  <span>{mt("menu")}</span>
                  <h2>{localizeMenuValue(locale, name)}</h2>
                </div>
                <small>
                  {localeNumber(locale, items.length)}{" "}
                  {items.length === 1 ? mt("item") : mt("items")}
                </small>
              </div>

              <div className="public-menu-grid">
                {items.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    locale={locale}
                    featuredLabel={mt("featured")}
                    onAdd={addItem}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </section>

      {cart.length > 0 && (
        <button className="public-cart-fab" onClick={() => setCartOpen(true)}>
          <ShoppingCart size={17} />
          <span>
            {cart.reduce((sum, row) => sum + row.quantityUnits, 0)} item
            {cart.length === 1 ? "" : "s"}
          </span>
          <strong>{localeMoney(locale, cartTotal)}</strong>
        </button>
      )}
      {orderResult && (
        <div className="public-order-success" role="status">
          <CheckCircle2 size={19} />
          <div>
            <strong>Order sent to the outlet</strong>
            <span>
              Request {String(orderResult.id).slice(0, 8).toUpperCase()} ·
              waiting for acceptance
            </span>
          </div>
          <button onClick={() => setOrderResult(null)}>
            <X size={14} />
          </button>
        </div>
      )}
      {cartOpen && (
        <div className="public-cart">
          <button
            className="public-cart-backdrop"
            aria-label="Close cart"
            onClick={() => setCartOpen(false)}
          />
          <form className="public-cart-panel" onSubmit={submitGuestOrder}>
            <header>
              <div>
                <span>Table {data.table?.name}</span>
                <h2>Your order</h2>
              </div>
              <button type="button" onClick={() => setCartOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="public-cart-lines">
              {cart.map((row) => (
                <div key={row.key}>
                  <div>
                    <strong>{row.name}</strong>
                    <span>
                      {row.priceLabel}
                      {row.modifierLabels.length
                        ? ` · ${row.modifierLabels.join(", ")}`
                        : ""}
                      {row.notes ? ` · ${row.notes}` : ""}
                    </span>
                  </div>
                  <div className="public-cart-qty">
                    <button
                      type="button"
                      onClick={() =>
                        setCart((current) =>
                          current
                            .map((item) =>
                              item.key === row.key
                                ? {
                                    ...item,
                                    quantityUnits: item.quantityUnits - 1,
                                  }
                                : item,
                            )
                            .filter((item) => item.quantityUnits > 0),
                        )
                      }
                    >
                      −
                    </button>
                    <span>{row.quantityUnits}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setCart((current) =>
                          current.map((item) =>
                            item.key === row.key
                              ? {
                                  ...item,
                                  quantityUnits: item.quantityUnits + 1,
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      +
                    </button>
                  </div>
                  <strong>
                    {localeMoney(
                      locale,
                      BigInt(row.unitMinor) * BigInt(row.quantityUnits),
                    )}
                  </strong>
                </div>
              ))}
            </div>
            <div className="public-cart-total">
              <span>Total</span>
              <strong>{localeMoney(locale, cartTotal)}</strong>
            </div>
            <label>
              <span>Name</span>
              <input
                value={guest.guestName}
                onChange={(event) =>
                  setGuest({ ...guest, guestName: event.target.value })
                }
                placeholder="Your name"
              />
            </label>
            <label>
              <span>Mobile number</span>
              <input
                value={guest.phone}
                onChange={(event) =>
                  setGuest({ ...guest, phone: event.target.value })
                }
                inputMode="tel"
                required
                placeholder="For order identification"
              />
            </label>
            <label>
              <span>Order note</span>
              <textarea
                value={guest.notes}
                onChange={(event) =>
                  setGuest({ ...guest, notes: event.target.value })
                }
                rows="2"
                placeholder="Allergy or table note"
              />
            </label>
            {data.payment?.upiVpa && (
              <div className="public-upi-pay">
                <label>
                  <span>Payment choice</span>
                  <select value={guest.paymentMethod} onChange={(event) => setGuest({ ...guest, paymentMethod: event.target.value })}>
                    <option value="PAY_AT_OUTLET">Pay at outlet</option>
                    <option value="UPI">Pay now by UPI</option>
                  </select>
                </label>
                {guest.paymentMethod === "UPI" && <>
                  <a href={`upi://pay?pa=${encodeURIComponent(data.payment.upiVpa)}&pn=${encodeURIComponent(data.branch?.name || "Outlet")}&am=${(Number(cartTotal) / 100).toFixed(2)}&cu=INR`}>Open UPI app · {localeMoney(locale, cartTotal)}</a>
                  <label><span>UPI transaction reference</span><input value={guest.paymentReference} onChange={(event) => setGuest({ ...guest, paymentReference: event.target.value })} required placeholder="12-digit UTR / transaction ID" /></label>
                  <small>The outlet verifies this reference before accepting the order.</small>
                </>}
              </div>
            )}
            <label className="public-consent">
              <input
                type="checkbox"
                checked={guest.consentMarketing}
                onChange={(event) =>
                  setGuest({ ...guest, consentMarketing: event.target.checked })
                }
              />
              <span>Send me offers and loyalty updates</span>
            </label>
            <button
              className="public-order-submit"
              disabled={submitting || !cart.length}
            >
              <Send size={15} />
              {submitting ? "Sending…" : "Send order for acceptance"}
            </button>
            <small>
              The outlet confirms availability and any submitted payment reference before preparation.
            </small>
          </form>
        </div>
      )}
      {customizer && (
        <div className="public-customizer">
          <button
            className="public-cart-backdrop"
            aria-label="Close"
            onClick={() => setCustomizer(null)}
          />
          <div className="public-customizer-card">
            <header>
              <div>
                <span>Customize</span>
                <h2>{customizer.item.displayName}</h2>
              </div>
              <button onClick={() => setCustomizer(null)}>
                <X size={18} />
              </button>
            </header>
            {(customizer.item.comboItems || []).length > 0 && (
              <p className="public-combo">
                Includes{" "}
                {(customizer.item.comboItems || [])
                  .map((row) => `${row.quantity || 1} × ${row.label}`)
                  .join(" · ")}
              </p>
            )}
            {(customizer.item.modifierGroups || []).map((group) => (
              <fieldset key={group.id}>
                <legend>
                  {group.name}
                  <small>
                    {Number(group.min || 0) > 0
                      ? `Choose ${group.min}-${group.max}`
                      : "Optional"}
                  </small>
                </legend>
                {(group.options || []).map((option) => (
                  <label key={option.id}>
                    <input
                      type="checkbox"
                      checked={customizer.selections.includes(
                        String(option.id),
                      )}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...customizer.selections, String(option.id)]
                          : customizer.selections.filter(
                              (id) => id !== String(option.id),
                            );
                        const groupIds = new Set(
                          (group.options || []).map((row) => String(row.id)),
                        );
                        if (
                          next.filter((id) => groupIds.has(id)).length >
                          Number(group.max || group.options.length)
                        )
                          return;
                        setCustomizer({ ...customizer, selections: next });
                      }}
                    />
                    <span>{option.label}</span>
                    <strong>
                      {BigInt(option.priceMinor || 0) > 0n
                        ? `+${localeMoney(locale, option.priceMinor)}`
                        : "Included"}
                    </strong>
                  </label>
                ))}
              </fieldset>
            ))}
            <label className="public-item-note">
              <span>Kitchen note</span>
              <textarea
                value={customizer.notes}
                onChange={(event) =>
                  setCustomizer({ ...customizer, notes: event.target.value })
                }
                rows="2"
              />
            </label>
            <button
              className="public-order-submit"
              onClick={() =>
                commitItem(
                  customizer.item,
                  customizer.price,
                  customizer.selections,
                  customizer.notes,
                )
              }
            >
              <Plus size={15} />
              Add to order
            </button>
          </div>
        </div>
      )}

      <footer className="public-menu-footer">
        <div className="public-menu-footer-brand">
          <img src="/deva-mark.svg" alt="Deva" />
          <div>
            <strong>Deva</strong>
            <span>{mt("footer")}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <ArrowUp size={16} />
          <span>{mt("backTop")}</span>
        </button>
      </footer>
    </main>
  );
}
