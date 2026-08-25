import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Phone, Search, Sparkles, UtensilsCrossed, Wine } from 'lucide-react';
import { api, apiErrorMessage } from './api';
import './publicMenu.css';

function formatMoney(value) {
  try {
    const amount = BigInt(value || 0);
    return `₹${(amount / 100n).toLocaleString('en-IN')}.${String(amount % 100n).padStart(2, '0')}`;
  } catch (_) { return '₹0.00'; }
}

export default function PublicMenu({ qrToken }) {
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

  const sections = useMemo(() => ['All', ...new Set((data?.menu || []).map((item) => item.sectionName || 'Menu'))], [data]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.menu || []).filter((item) => {
      const matchesSection = section === 'All' || item.sectionName === section;
      const matchesSearch = !q || [item.displayName, item.description, item.product?.brand, item.sectionName].some((value) => String(value || '').toLowerCase().includes(q));
      return matchesSection && matchesSearch;
    });
  }, [data, search, section]);

  if (loading) return <div className="public-menu-loading"><div className="public-menu-spinner"/><span>Opening menu…</span></div>;
  if (error || !data) return <div className="public-menu-error"><div><UtensilsCrossed size={25}/></div><h1>Menu unavailable</h1><p>{error || 'This table menu could not be loaded.'}</p></div>;

  return (
    <main className="public-menu-page">
      <header className="public-menu-hero">
        <div className="public-menu-brand"><div className="public-menu-mark"><UtensilsCrossed size={19}/></div><div><strong>{data.branch?.name}</strong><span>Digital table menu</span></div></div>
        <div className="public-menu-table"><span>YOU'RE AT</span><strong>{data.table?.name}</strong><small>{data.table?.code} · {data.table?.seats} seats</small></div>
        <div className="public-menu-hero-copy"><div className="public-menu-kicker"><Sparkles size={13}/> Explore today's menu</div><h1>Choose your favourites.</h1><p>Browse the live menu and pricing for this outlet. Place your order with your waiter when you're ready.</p></div>
        <div className="public-menu-contact">{data.branch?.address && <span><MapPin size={13}/>{data.branch.address}</span>}{data.branch?.phone && <a href={`tel:${data.branch.phone}`}><Phone size={13}/>{data.branch.phone}</a>}</div>
      </header>

      <section className="public-menu-toolbar">
        <label className="public-menu-search"><Search size={15}/><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search dishes, drinks, brands…"/></label>
        <div className="public-menu-sections">{sections.map((name)=><button key={name} className={section===name?'is-active':''} onClick={()=>setSection(name)}>{name}</button>)}</div>
      </section>

      <section className="public-menu-content">
        {!visible.length && <div className="public-menu-empty"><Search size={22}/><strong>No matching items</strong><span>Try another search or section.</span></div>}
        {sections.filter((name)=>name!=='All' && (section==='All'||section===name)).map((name)=>{
          const items=visible.filter((item)=>item.sectionName===name);
          if(!items.length)return null;
          return <div className="public-menu-section" key={name}><div className="public-menu-section-head"><div><span>MENU</span><h2>{name}</h2></div><small>{items.length} item{items.length===1?'':'s'}</small></div><div className="public-menu-grid">{items.map((item)=><article className={`public-menu-card ${item.featured?'is-featured':''}`} key={item.id}>{item.product?.imageUrl?<img src={item.product.imageUrl} alt={item.displayName}/>:<div className="public-menu-image-placeholder">{item.product?.productType==='ALCOHOL'?<Wine size={30}/>:<UtensilsCrossed size={30}/>}</div>}<div className="public-menu-card-body">{item.featured&&<div className="public-menu-featured"><Sparkles size={10}/> Featured</div>}<h3>{item.displayName}</h3>{item.product?.brand&&<div className="public-menu-brandline">{item.product.brand}</div>}{item.description&&<p>{item.description}</p>}{Array.isArray(item.dietaryTags)&&item.dietaryTags.length>0&&<div className="public-menu-tags">{item.dietaryTags.map((tag)=><span key={tag}>{tag}</span>)}</div>}<div className="public-menu-prices">{(item.product?.priceOptions||[]).map((price)=><div key={price.id}><span>{price.label}</span><strong>{formatMoney(price.priceMinor)}</strong></div>)}</div></div></article>)}</div></div>;
        })}
      </section>

      <footer className="public-menu-footer"><div className="public-menu-mark small"><UtensilsCrossed size={15}/></div><div><strong>{data.branch?.name}</strong><span>Prices shown are the current outlet menu prices.</span></div></footer>
    </main>
  );
}
