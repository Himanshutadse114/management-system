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
import './publicMenu.css';

function formatMoney(value) {
  try {
    const amount = BigInt(value || 0);
    return `₹${(amount / 100n).toLocaleString('en-IN')}.${String(amount % 100n).padStart(2, '0')}`;
  } catch (_) {
    return '₹0.00';
  }
}

function MenuItemCard({ item, featuredLabel }) {
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
            {alcohol ? <Wine size={34} /> : <UtensilsCrossed size={34} />}
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
              <strong>{formatMoney(price.priceMinor)}</strong>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function PublicMenu({ qrToken }) {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [section, setSection] = useState('All');

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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.menu || [])
      .filter((item) => {
        const matchesSection = section === 'All' || item.sectionName === section;
        const matchesSearch = !q || [
          item.displayName,
          item.description,
          item.product?.brand,
          item.sectionName
        ].some((value) => String(value || '').toLowerCase().includes(q));
        return matchesSection && matchesSearch;
      })
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
  }, [data, search, section]);

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
        <span>{t('publicMenu.loading')}</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="public-menu-error">
        <div><UtensilsCrossed size={25} /></div>
        <h1>{t('publicMenu.unavailable')}</h1>
        <p>{error || t('publicMenu.unavailable')}</p>
        <span className="public-menu-error-brand">Deva</span>
      </div>
    );
  }

  const itemCount = data.menu?.length || 0;

  return (
    <main className="public-menu-page">
      <header className="public-menu-hero">
        <div className="public-menu-topline">
          <div className="public-menu-brand">
            <div className="public-menu-branch-mark">
              <UtensilsCrossed size={20} />
            </div>
            <div>
              <strong>{data.branch?.name}</strong>
              <span>{t('publicMenu.menu')}</span>
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
              Fresh from the menu
            </div>
            <h1>Find something<br />you’ll enjoy.</h1>
            <p>{t('publicMenu.subtitle')}</p>

            <div className="public-menu-hero-meta">
              <span><strong>{itemCount}</strong> items</span>
              <span><strong>{Math.max(0, sections.length - 1)}</strong> sections</span>
            </div>
          </div>

          <div className="public-menu-table-card">
            <span>{t('publicMenu.table')}</span>
            <strong>{data.table?.name}</strong>
            <small>{data.table?.code} · {data.table?.seats} seats</small>
          </div>
        </div>

        {(data.branch?.address || data.branch?.phone) && (
          <div className="public-menu-contact">
            {data.branch?.address && <span><MapPin size={14} />{data.branch.address}</span>}
            {data.branch?.phone && <a href={`tel:${data.branch.phone}`}><Phone size={14} />{data.branch.phone}</a>}
          </div>
        )}
      </header>

      <section className="public-menu-toolbar" aria-label="Menu filters">
        <div className="public-menu-toolbar-inner">
          <label className="public-menu-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('publicMenu.search')}
              aria-label={t('publicMenu.search')}
            />
          </label>

          <div className="public-menu-sections" role="tablist" aria-label="Menu sections">
            {sections.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={section === name}
                className={section === name ? 'is-active' : ''}
                onClick={() => setSection(name)}
              >
                {name === 'All' ? t('publicMenu.all') : name}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="public-menu-content">
        {!visible.length && (
          <div className="public-menu-empty">
            <div><Search size={24} /></div>
            <strong>{t('publicMenu.noItems')}</strong>
            <span>{t('publicMenu.noItemsCopy')}</span>
          </div>
        )}

        {visibleSections.map((name) => {
          const items = visible.filter((item) => (item.sectionName || 'Menu') === name);
          if (!items.length) return null;

          return (
            <section className="public-menu-section" key={name}>
              <div className="public-menu-section-head">
                <div>
                  <span>{t('publicMenu.menu')}</span>
                  <h2>{name}</h2>
                </div>
                <small>{items.length} {items.length === 1 ? 'item' : 'items'}</small>
              </div>

              <div className="public-menu-grid">
                {items.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    featuredLabel={t('publicMenu.featured')}
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
          <div><strong>Deva</strong><span>Simple service. Better operations.</span></div>
        </div>
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <ArrowUp size={16} />
          Back to top
        </button>
      </footer>
    </main>
  );
}
