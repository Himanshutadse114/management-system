import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, RefreshCw, Upload } from 'lucide-react';
import { useAuth } from './AuthContext';
import { api, apiErrorMessage, authHeaders } from './api';
import './menu-images.css';

function backendBase() {
  return String(api.defaults.baseURL || '').replace(/\/api\/?$/, '');
}

function publicImageUrl(productId, version = 0) {
  const base = backendBase();
  if (!base || !productId) return '';
  return `${base}/api/public/products/${encodeURIComponent(productId)}/image${version ? `?v=${version}` : ''}`;
}

function readRestaurantMenuContext() {
  if (typeof document === 'undefined') return null;
  const page = document.querySelector('.restaurant-page');
  if (!page) return null;
  const activeTab = [...page.querySelectorAll('.restaurant-tabs button')]
    .find((button) => button.classList.contains('is-active'));
  if (!activeTab || activeTab.textContent.trim().toLowerCase() !== 'menu') return null;
  const selects = page.querySelectorAll('.restaurant-scope select');
  if (selects.length < 2) return null;
  const tenantId = selects[0].value;
  const branchId = selects[1].value;
  if (!tenantId || !branchId) return null;
  return { page, tenantId, branchId };
}

export default function MenuImageManager() {
  const { token } = useAuth();
  const [context, setContext] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [busyProductId, setBusyProductId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [imageVersion, setImageVersion] = useState(0);

  useEffect(() => {
    if (!token || typeof document === 'undefined') return undefined;
    let frame = null;
    const inspect = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = readRestaurantMenuContext();
        setContext((current) => {
          if (!next && !current) return current;
          if (!next) return null;
          if (current?.page === next.page && current?.tenantId === next.tenantId && current?.branchId === next.branchId) return current;
          return next;
        });
      });
    };

    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    document.addEventListener('change', inspect, true);
    document.addEventListener('click', inspect, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('change', inspect, true);
      document.removeEventListener('click', inspect, true);
    };
  }, [token]);

  const base = context ? `/restaurant/tenants/${context.tenantId}/branches/${context.branchId}` : '';

  async function load() {
    if (!base || !token) return;
    try {
      setLoading(true);
      setError('');
      const headers = authHeaders(token);
      const [menuResult, catalogueResult] = await Promise.all([
        api.get(`${base}/menu`, { headers }),
        api.get(`${base}/catalogue`, { headers })
      ]);
      const nextMenu = menuResult.data.items || [];
      const nextProducts = catalogueResult.data.products || [];
      setMenuItems(nextMenu);
      setProducts(nextProducts);
      setSelectedProductId((current) => current && nextProducts.some((row) => row.id === current) ? current : (nextProducts[0]?.id || ''));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelectedFile(null);
    setNotice('');
    if (base) load();
    else {
      setMenuItems([]);
      setProducts([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, token]);

  function flash(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2600);
  }

  async function upload(productId, file) {
    if (!productId || !file || !context) return;
    try {
      setBusyProductId(productId);
      setError('');
      const body = new FormData();
      body.append('image', file);
      await api.post(
        `/inventory/tenants/${context.tenantId}/branches/${context.branchId}/products/${productId}/image`,
        body,
        { headers: authHeaders(token) }
      );
      setSelectedFile(null);
      setImageVersion(Date.now());
      await load();
      flash('Menu photo uploaded. It is now available on the QR menu.');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyProductId('');
    }
  }

  const menuProductIds = useMemo(() => new Set(menuItems.map((item) => String(item.productId))), [menuItems]);
  const selectedProduct = products.find((row) => row.id === selectedProductId);

  if (!context?.page || !token) return null;

  return createPortal(
    <section className="menu-image-manager restaurant-panel">
      <div className="menu-image-manager-head">
        <div>
          <div className="restaurant-mini">Menu photos</div>
          <h3>Add food & drink photos</h3>
          <p>Choose an item and upload a clear JPEG, PNG or WebP image. Maximum size: 5 MB.</p>
        </div>
        <button type="button" className="scorm-button-secondary" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''}/> Refresh
        </button>
      </div>

      {error && <div className="restaurant-error">{error}</div>}
      {notice && <div className="restaurant-notice">{notice}</div>}

      <div className="menu-image-upload-row">
        <label>
          <span>Item</span>
          <select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}>
            {!products.length && <option value="">No items available</option>}
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}{menuProductIds.has(String(product.id)) ? ' · On menu' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="menu-photo-picker">
          <span>Photo</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
          />
        </label>
        <button
          type="button"
          className="scorm-button-primary menu-photo-submit"
          disabled={!selectedProductId || !selectedFile || Boolean(busyProductId)}
          onClick={() => upload(selectedProductId, selectedFile)}
        >
          <Upload size={14}/>
          {busyProductId === selectedProductId ? 'Uploading…' : 'Upload photo'}
        </button>
      </div>

      {selectedProduct && (
        <div className="menu-selected-photo">
          <div className="menu-photo-preview">
            <img
              key={`${selectedProduct.id}-${imageVersion}`}
              src={publicImageUrl(selectedProduct.id, imageVersion)}
              alt={selectedProduct.name}
              onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.classList.remove('is-hidden'); }}
            />
            <div className="menu-photo-placeholder is-hidden"><ImagePlus size={22}/><span>No photo yet</span></div>
          </div>
          <div><strong>{selectedProduct.name}</strong><span>{selectedFile ? selectedFile.name : 'Upload or replace the image shown on the QR menu.'}</span></div>
        </div>
      )}

      <div className="menu-image-grid">
        {menuItems.map((item) => (
          <article key={item.id} className="menu-image-card">
            <div className="menu-image-card-photo">
              <img
                key={`${item.productId}-${imageVersion}`}
                src={publicImageUrl(item.productId, imageVersion)}
                alt={item.displayName}
                onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.classList.remove('is-hidden'); }}
              />
              <div className="menu-photo-placeholder is-hidden"><ImagePlus size={20}/><span>No photo</span></div>
            </div>
            <div className="menu-image-card-copy">
              <strong>{item.displayName}</strong>
              <span>{item.sectionName || 'Menu'}</span>
            </div>
            <label className={busyProductId === item.productId ? 'menu-card-upload is-busy' : 'menu-card-upload'}>
              <Upload size={13}/>
              <span>{busyProductId === item.productId ? 'Uploading…' : 'Change photo'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={Boolean(busyProductId)}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) upload(item.productId, file);
                  event.target.value = '';
                }}
              />
            </label>
          </article>
        ))}
      </div>
    </section>,
    context.page
  );
}
