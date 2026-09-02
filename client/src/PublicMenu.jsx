import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUp,
  MapPin,
  Phone,
  Search,
  Sparkles,
  UtensilsCrossed,
  Wine
} from 'lucide-react';
import { api, apiErrorMessage } from './api';
import { LanguageSwitcher, useLanguage } from './LanguageContext';
import {
  localeMoney,
  localeNumber,
  localizeMenuItem,
  localizeMenuValue,
  publicMenuText
} from './publicMenuI18n';
import './publicMenu.css';

function MenuItemCard({ item, featuredLabel, locale }) {
  const prices = item.product?.priceOptions || [];
  const image = item.product?.imageUrl;
  const alcohol = item.product?.productType === 'ALCOHOL';

  return (
    <article className={`public-menu-card ${item.featured ? 'is-featured' : ''}`}>
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
          {item.product?.brand && <div className="public-menu-brandline">{item.product.brand}</div>}
          <h3>{item.displayName}</h3>
          {item.description && <p>{item.description}</p>}
          {Array.isArray(item.dietaryTags) && item.dietaryTags.length > 0 && (
            <div className="public-menu-tags">
              {item.dietaryTags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          )}
        </div>

        <div className="public-menu-prices">
          {prices.map((price) => (
            <div key={price.id}>
              <span>{price.label}</span>
              <strong>{localeMoney(locale, price.priceMinor)}</strong>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function PublicMenu({ qrToken }) {
  const { locale } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [section, setSection] = useState('All');
  const mt = (key, vars = {}) => publicMenuText(locale, key, vars);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setError('');
        const response = await api.get(`/public/menu/${encodeURIComponent(qrToken)}`);
        if (alive) setData(response.data);
      } catch (err) {
        if (alive) setError(apiErrorMessage(err));
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => { alive = false; };
  }, [qrToken]);

  const sections = useMemo(
    () => ['All', ...new Set((data?.menu || []).map((item) => item.sectionName || 'Menu'))],
    [data]
  );

  const localizedMenu = useMemo(
    () => (data?.menu || []).map((item) => localizeMenuItem(locale, item)),
    [data, locale]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase(locale === 'en' ? 'en' : locale);
    return localizedMenu
      .filter((item) => {
        const source = item._source || item;
        const matchesSection = section === 'All' || item._sectionKey === section;
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
          ...(source.dietaryTags || [])
        ];
        const matchesSearch = !q || searchValues.some((value) => String(value || '').toLocaleLowerCase(locale === 'en' ? 'en' : locale).includes(q));
        return matchesSection && matchesSearch;
      })
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
  }, [localizedMenu, locale, search, section]);

  const visibleSections = useMemo(
    () => sections.filter((name) => name !== 'All' && (section === 'All' || section === name)),
    [sections, section]
  );

  if (loading) {
    return (
      <div className="public-menu-loading">
        <div className="public-menu-loader-brand">
          <img src="/deva-mark.svg" alt="Deva" />
        </div>
        <div className="public-menu-spinner" />
        <strong>Deva</strong>
        <span>{mt('loading')}</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="public-menu-error">
        <div><UtensilsCrossed size={25} /></div>
        <h1>{mt('unavailable')}</h1>
        <p>{mt('unavailable')}</p>
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
              <span>{mt('menu')}</span>
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
              {mt('kicker')}
            </div>
            <h1>{mt('heroA')}<br />{mt('heroB')}</h1>
            <p>{mt('subtitle')}</p>

            <div className="public-menu-hero-meta">
              <span><strong>{localeNumber(locale, itemCount)}</strong> {itemCount === 1 ? mt('item') : mt('items')}</span>
              <span><strong>{localeNumber(locale, sectionCount)}</strong> {sectionCount === 1 ? mt('section') : mt('sections')}</span>
            </div>
          </div>

          <div className="public-menu-hero-side">
            <div className={`public-menu-visual ${heroItems.length ? '' : 'is-empty'}`} aria-hidden="true">
              {heroItems.length ? heroItems.map((item, index) => (
                <div className={`public-menu-visual-tile tile-${index + 1}`} key={item.id}>
                  <img src={item.product.imageUrl} alt="" />
                  <span>{item.displayName}</span>
                </div>
              )) : (
                <div className="public-menu-visual-fallback">
                  <div className="public-menu-fallback-illustration">
                    <span className="public-menu-fallback-main"><UtensilsCrossed size={36} /></span>
                    <span className="public-menu-fallback-chip chip-one"><Sparkles size={16} /></span>
                    <span className="public-menu-fallback-chip chip-two"><Wine size={16} /></span>
                  </div>
                  <div className="public-menu-fallback-copy">
                    <strong>{mt('freshChoices')}</strong>
                    <small>{mt('across', { items: localeNumber(locale, itemCount), sections: localeNumber(locale, sectionCount) })}</small>
                  </div>
                </div>
              )}
            </div>

            <div className="public-menu-table-card">
              <div className="public-menu-table-icon" aria-hidden="true">
                <MapPin size={19} />
              </div>
              <div className="public-menu-table-copy">
                <span>{mt('table')}</span>
                <strong>{localizeMenuValue(locale, data.table?.name)}</strong>
                <small>{data.table?.code} · {mt('seats', { count: localeNumber(locale, data.table?.seats || 0) })}</small>
              </div>
            </div>
          </div>
        </div>

        {(data.branch?.address || data.branch?.phone) && (
          <div className="public-menu-contact">
            {data.branch?.address && <span><MapPin size={14} />{localizeMenuValue(locale, data.branch.address)}</span>}
            {data.branch?.phone && <a href={`tel:${data.branch.phone}`}><Phone size={14} />{data.branch.phone}</a>}
          </div>
        )}
      </header>

      <section className="public-menu-toolbar" aria-label={mt('filters')}>
        <div className="public-menu-toolbar-inner">
          <label className="public-menu-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={mt('search')}
              aria-label={mt('search')}
            />
          </label>

          <div className="public-menu-sections" role="tablist" aria-label={mt('menuSections')}>
            {sections.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={section === name}
                className={section === name ? 'is-active' : ''}
                onClick={() => setSection(name)}
              >
                {name === 'All' ? mt('all') : localizeMenuValue(locale, name)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="public-menu-content">
        {!visible.length && (
          <div className="public-menu-empty">
            <div><Search size={24} /></div>
            <strong>{mt('noItems')}</strong>
            <span>{mt('noItemsCopy')}</span>
          </div>
        )}

        {visibleSections.map((name) => {
          const items = visible.filter((item) => item._sectionKey === name);
          if (!items.length) return null;

          return (
            <section className="public-menu-section" key={name}>
              <div className="public-menu-section-head">
                <div>
                  <span>{mt('menu')}</span>
                  <h2>{localizeMenuValue(locale, name)}</h2>
                </div>
                <small>{localeNumber(locale, items.length)} {items.length === 1 ? mt('item') : mt('items')}</small>
              </div>

              <div className="public-menu-grid">
                {items.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    locale={locale}
                    featuredLabel={mt('featured')}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </section>

      <footer className="public-menu-footer">
        <div className="public-menu-footer-brand">
          <img src="/deva-mark.svg" alt="Deva" />
          <div><strong>Deva</strong><span>{mt('footer')}</span></div>
        </div>
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <ArrowUp size={16} />
          <span>{mt('backTop')}</span>
        </button>
      </footer>
    </main>
  );
}
