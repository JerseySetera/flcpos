"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  stock: number;
  category: string | null;
  active: boolean;
};

type CartItem = Product & { qty: number };

type Sale = {
  id: string;
  receipt_no: string;
  total: number;
  payment_method: string;
  created_at: string;
};

const money = (n: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [tab, setTab] = useState<"pos" | "products" | "sales">("pos");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [productForm, setProductForm] = useState({
    id: "",
    name: "",
    sku: "",
    price: "",
    stock: "",
    category: ""
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadData();
      else setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) loadData();
      else {
        setProducts([]);
        setSales([]);
        setCart([]);
      }
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: p, error: pe }, { data: s, error: se }] = await Promise.all([
      supabase.from("products").select("*").eq("active", true).order("name"),
      supabase.from("sales").select("id, receipt_no, total, payment_method, created_at").order("created_at", { ascending: false }).limit(100)
    ]);
    if (pe || se) setMessage((pe || se)?.message || "Could not load data.");
    setProducts(p || []);
    setSales(s || []);
    setLoading(false);
  }

  async function authenticate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const result = authMode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    if (result.error) setMessage(result.error.message);
    else if (authMode === "signup") setMessage("Account created. If email confirmation is enabled, check your email before signing in.");
    setBusy(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    setCart([]);
  }

  function addToCart(product: Product) {
    setCart(current => {
      const existing = current.find(x => x.id === product.id);
      if (existing) {
        if (existing.qty >= product.stock) return current;
        return current.map(x => x.id === product.id ? { ...x, qty: x.qty + 1 } : x);
      }
      return [...current, { ...product, qty: 1 }];
    });
  }

  function changeQty(id: string, delta: number) {
    setCart(current =>
      current.flatMap(item => {
        if (item.id !== id) return [item];
        const qty = item.qty + delta;
        if (qty <= 0) return [];
        if (qty > item.stock) return [item];
        return [{ ...item, qty }];
      })
    );
  }

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.qty, 0), [cart]);
  const filteredProducts = products.filter(p =>
    `${p.name} ${p.sku || ""} ${p.category || ""}`.toLowerCase().includes(search.toLowerCase())
  );

  async function checkout(payment_method: string) {
    if (!cart.length) return;
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.rpc("create_sale", {
      sale_items: cart.map(i => ({ product_id: i.id, qty: i.qty })),
      sale_payment_method: payment_method
    });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage(`Sale completed. Receipt: ${data.receipt_no}`);
      setCart([]);
      await loadData();
    }
    setBusy(false);
  }

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const payload = {
      name: productForm.name.trim(),
      sku: productForm.sku.trim() || null,
      price: Number(productForm.price),
      stock: Number(productForm.stock),
      category: productForm.category.trim() || null,
      active: true
    };

    const result = productForm.id
      ? await supabase.from("products").update(payload).eq("id", productForm.id)
      : await supabase.from("products").insert(payload);

    if (result.error) setMessage(result.error.message);
    else {
      setMessage(productForm.id ? "Product updated." : "Product added.");
      resetProductForm();
      await loadData();
    }
    setBusy(false);
  }

  async function deleteProduct(id: string) {
    if (!confirm("Hide this product from the POS?")) return;
    const { error } = await supabase.from("products").update({ active: false }).eq("id", id);
    if (error) setMessage(error.message);
    else await loadData();
  }

  function editProduct(p: Product) {
    setProductForm({
      id: p.id,
      name: p.name,
      sku: p.sku || "",
      price: String(p.price),
      stock: String(p.stock),
      category: p.category || ""
    });
    setTab("products");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetProductForm() {
    setProductForm({ id: "", name: "", sku: "", price: "", stock: "", category: "" });
  }

  if (loading) return <main className="center">Loading…</main>;

  if (!session) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark">POS</div>
          <h1>Simple POS</h1>
          <p className="muted">Sales, products and inventory in one place.</p>
          <form onSubmit={authenticate} className="stack">
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} minLength={6} required />
            <button className="primary" disabled={busy}>{busy ? "Please wait…" : authMode === "login" ? "Sign in" : "Create account"}</button>
          </form>
          {message && <p className="notice">{message}</p>}
          <button className="link-btn" onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setMessage(""); }}>
            {authMode === "login" ? "Create a new account" : "Already have an account? Sign in"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">POINT OF SALE</div>
          <h1>Simple POS</h1>
        </div>
        <div className="top-actions">
          <span className="user-email">{session.user.email}</span>
          <button className="secondary" onClick={logout}>Sign out</button>
        </div>
      </header>

      {message && <div className="toast">{message}</div>}

      <nav className="tabs">
        <button className={tab === "pos" ? "active" : ""} onClick={() => setTab("pos")}>Sell</button>
        <button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}>Products</button>
        <button className={tab === "sales" ? "active" : ""} onClick={() => setTab("sales")}>Sales history</button>
      </nav>

      {tab === "pos" && (
        <section className="pos-grid">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Products</h2>
                <p className="muted">Tap a product to add it to the cart.</p>
              </div>
              <input className="search" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="product-grid">
              {filteredProducts.map(p => (
                <button key={p.id} className="product-card" onClick={() => addToCart(p)} disabled={p.stock <= 0}>
                  <span className="product-name">{p.name}</span>
                  <span className="product-meta">{p.category || "General"} · {p.stock} in stock</span>
                  <strong>{money(Number(p.price))}</strong>
                </button>
              ))}
              {!filteredProducts.length && <div className="empty">No products found.</div>}
            </div>
          </div>

          <aside className="panel cart">
            <div className="panel-head">
              <div>
                <h2>Current sale</h2>
                <p className="muted">{cart.length} item type{cart.length === 1 ? "" : "s"}</p>
              </div>
              {cart.length > 0 && <button className="link-btn" onClick={() => setCart([])}>Clear</button>}
            </div>

            <div className="cart-items">
              {cart.map(item => (
                <div className="cart-row" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <div className="muted">{money(Number(item.price))} each</div>
                  </div>
                  <div className="qty">
                    <button onClick={() => changeQty(item.id, -1)}>−</button>
                    <span>{item.qty}</span>
                    <button onClick={() => changeQty(item.id, 1)}>+</button>
                  </div>
                  <strong>{money(Number(item.price) * item.qty)}</strong>
                </div>
              ))}
              {!cart.length && <div className="empty">Cart is empty.</div>}
            </div>

            <div className="checkout">
              <div className="total-line"><span>Total</span><strong>{money(subtotal)}</strong></div>
              <div className="payment-grid">
                <button className="primary" disabled={!cart.length || busy} onClick={() => checkout("cash")}>Cash</button>
                <button className="secondary" disabled={!cart.length || busy} onClick={() => checkout("gcash")}>GCash</button>
                <button className="secondary" disabled={!cart.length || busy} onClick={() => checkout("card")}>Card</button>
              </div>
            </div>
          </aside>
        </section>
      )}

      {tab === "products" && (
        <section className="single-column">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>{productForm.id ? "Edit product" : "Add product"}</h2>
                <p className="muted">Manage prices and stock.</p>
              </div>
              {productForm.id && <button className="secondary" onClick={resetProductForm}>Cancel</button>}
            </div>
            <form onSubmit={saveProduct} className="form-grid">
              <input placeholder="Product name" value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} required />
              <input placeholder="SKU (optional)" value={productForm.sku} onChange={e => setProductForm({...productForm, sku: e.target.value})} />
              <input placeholder="Category" value={productForm.category} onChange={e => setProductForm({...productForm, category: e.target.value})} />
              <input type="number" min="0" step="0.01" placeholder="Price" value={productForm.price} onChange={e => setProductForm({...productForm, price: e.target.value})} required />
              <input type="number" min="0" step="1" placeholder="Stock" value={productForm.stock} onChange={e => setProductForm({...productForm, stock: e.target.value})} required />
              <button className="primary" disabled={busy}>{productForm.id ? "Update product" : "Add product"}</button>
            </form>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>Inventory</h2><span className="muted">{products.length} active products</span></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Price</th><th>Stock</th><th></th></tr></thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id}>
                      <td>{p.name}</td><td>{p.sku || "—"}</td><td>{p.category || "—"}</td><td>{money(Number(p.price))}</td><td>{p.stock}</td>
                      <td className="row-actions"><button className="link-btn" onClick={() => editProduct(p)}>Edit</button><button className="danger-link" onClick={() => deleteProduct(p.id)}>Hide</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {tab === "sales" && (
        <section className="single-column">
          <div className="panel">
            <div className="panel-head"><div><h2>Sales history</h2><p className="muted">Latest 100 completed sales.</p></div></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Receipt</th><th>Date</th><th>Payment</th><th>Total</th></tr></thead>
                <tbody>
                  {sales.map(s => (
                    <tr key={s.id}>
                      <td>{s.receipt_no}</td>
                      <td>{new Date(s.created_at).toLocaleString("en-PH")}</td>
                      <td className="capitalize">{s.payment_method}</td>
                      <td>{money(Number(s.total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!sales.length && <div className="empty">No sales yet.</div>}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
