export const round = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
export function initial(owner) { return { owner, settings: { name: 'Aswaqi · أسواقي', currency: 'IQD', tax: 0, receipt: 'Thank you! · شكراً لزيارتكم' }, products: [], lots: [], transactions: [], users: [], audit: [] }; }
export function roleFor(s, username) { return username === s.owner ? 'manager' : s.users.find(u => u.username === username)?.role; }
function assert(v, msg = 'Invalid value | قيمة غير صالحة') { if (!v)
    throw Error(msg); }
function num(v, min = 0) { v = Number(v); assert(Number.isFinite(v) && v >= min); return v; }
function quantity(v) { const n = num(v, .001); assert(n <= 1000000 && Math.abs(n * 1000 - Math.round(n * 1000)) < .00001, 'Use up to 3 decimal places | استخدم حتى ٣ منازل عشرية'); return n; }
const rq = (n) => Math.round(n * 1000) / 1000;
function str(v, max = 200) { assert(typeof v === 'string' && v.trim().length > 0 && v.length <= max); return v.trim(); }
const today = () => new Date().toISOString().slice(0, 10);
export function available(s, id, loc = 'shown') { return s.lots.filter(l => l.product === id && l.location === loc && (!l.expiry || l.expiry >= today())).reduce((a, l) => a + l.qty, 0); }
function journal(s, user, kind, amount, entries, other = {}) { assert(Math.abs(entries.reduce((a, e) => a + e.debit - e.credit, 0)) < .02, 'Unbalanced journal'); s.transactions.unshift({ id: crypto.randomUUID(), date: new Date().toISOString(), kind, amount: round(amount), entries, user, party: '', method: 'cash', lines: [], note: '', ...other }); }
const e = (account, debit = 0, credit = 0) => ({ account, debit: round(debit), credit: round(credit) });
export function act(s, username, action, p) {
    const role = roleFor(s, username);
    const allowed = { product: ['manager', 'storage'], purchase: ['manager', 'cashier'], sale: ['manager', 'cashier'], transfer: ['manager', 'storage'], expense: ['manager', 'accountant'], settle: ['manager', 'accountant'], user: ['manager'], removeUser: ['manager'], opening: ['manager', 'accountant'], refund: ['manager', 'cashier'], settings: ['manager'], demo: ['manager'] };
    assert(role && allowed[action]?.includes(role), 'Access denied | غير مسموح');
    if (action === 'product') {
        const x = { id: p.id || crypto.randomUUID(), name: str(p.name), ar: str(p.ar), barcode: str(p.barcode, 80), category: str(p.category, 80), unit: str(p.unit, 40), price: round(num(p.price)), min: num(p.min), icon: p.icon || 'package' };
        assert(!s.products.some(q => q.barcode === x.barcode && q.id !== x.id), 'Barcode already exists | الباركود مستخدم');
        const idx = s.products.findIndex(q => q.id === x.id);
        if (idx < 0)
            s.products.push(x);
        else
            s.products[idx] = x;
    }
    if (action === 'purchase') {
        assert(s.products.some(x => x.id === p.product), 'Product not found');
        const qty = quantity(p.qty), cost = round(num(p.cost)), amount = round(qty * cost);
        assert(!p.expiry || (/^\d{4}-\d{2}-\d{2}$/.test(p.expiry) && p.expiry >= today()), 'Expiry date is in the past | الصلاحية منتهية');
        const party = str(p.party);
        const method = p.method === 'credit' ? 'credit' : 'cash';
        s.lots.push({ id: crypto.randomUUID(), product: p.product, qty, cost, location: 'stock', expiry: p.expiry || '' });
        journal(s, username, 'purchase', amount, [e('inventory', amount), e(method === 'credit' ? 'payable' : 'cash', 0, amount)], { party, method, lines: [{ product: p.product, qty, cost }] });
    }
    if (action === 'sale') {
        assert(Array.isArray(p.lines) && p.lines.length > 0 && p.lines.length <= 200);
        const merged = new Map();
        for (const l of p.lines)
            merged.set(l.product, (merged.get(l.product) || 0) + quantity(l.qty));
        let total = 0, cost = 0;
        const lines = [];
        for (const [id, qty] of merged) {
            const prod = s.products.find(x => x.id === id);
            assert(prod, 'Product not found');
            assert(available(s, id) + 1e-8 >= qty, 'Insufficient shelf stock | مخزون العرض غير كافٍ');
            let left = qty;
            const allocations = [];
            for (const l of s.lots.filter(l => l.product === id && l.location === 'shown' && (!l.expiry || l.expiry >= today())).sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999'))) {
                const taken = Math.min(left, l.qty);
                l.qty = rq(l.qty - taken);
                cost += taken * l.cost;
                if (taken > 0)
                    allocations.push({ qty: taken, cost: l.cost, expiry: l.expiry });
                left -= taken;
                if (left < 1e-8)
                    break;
            }
            total += prod.price * qty;
            lines.push({ product: id, name: prod.name, ar: prod.ar, qty, price: prod.price, allocations });
        }
        const discount = round(num(p.discount || 0));
        assert(discount <= total, 'Discount exceeds total');
        const net = round(total - discount), tax = round(net * s.settings.tax / 100), amount = round(net + tax), method = ['cash', 'card', 'credit'].includes(p.method) ? p.method : 'cash';
        const party = method === 'credit' ? str(p.party) : p.party || 'Walk-in';
        if (method === 'cash')
            assert(num(p.tendered) >= amount, 'Cash received is insufficient | المبلغ غير كافٍ');
        journal(s, username, 'sale', amount, [e(method === 'credit' ? 'receivable' : method === 'card' ? 'bank' : 'cash', amount), e('sales', 0, net), e('tax', 0, tax), e('cogs', cost), e('inventory', 0, cost)], { party, method, lines, note: p.note || '', discount, tax, tendered: num(p.tendered || 0), change: method === 'cash' ? round(num(p.tendered) - amount) : 0 });
    }
    if (action === 'transfer') {
        const l = s.lots.find(x => x.id === p.lot);
        assert(l, 'Batch not found');
        const qty = quantity(p.qty);
        assert(qty <= l.qty, 'Insufficient stock');
        assert(['stock', 'shown', 'expired'].includes(p.to) && p.to !== l.location);
        assert(l.location !== 'expired', 'Expired stock cannot return to sale');
        assert(p.to === 'expired' || !l.expiry || l.expiry >= today(), 'Expired goods cannot be sold');
        l.qty = rq(l.qty - qty);
        s.lots.push({ ...l, id: crypto.randomUUID(), qty, location: p.to });
        if (p.to === 'expired') {
            const amount = round(qty * l.cost);
            journal(s, username, 'writeoff', amount, [e('waste', amount), e('inventory', 0, amount)], { lines: [{ product: l.product, qty }], note: str(p.note || 'Expired stock') });
        }
    }
    if (action === 'refund') {
        const tx = s.transactions.find(t => t.id === p.id && t.kind === 'sale');
        assert(tx, 'Sale not found');
        assert(!s.transactions.some(t => t.kind === 'refund' && t.note === p.id), 'Already refunded | تم الإرجاع مسبقاً');
        assert(tx.method !== 'credit', 'For credit sales, settle the account before arranging a correction with the manager | إرجاع البيع الآجل غير مدعوم');
        for (const line of tx.lines) {
            assert(line.allocations, 'Missing batch information');
            for (const a of line.allocations) {
                s.lots.push({ id: crypto.randomUUID(), product: line.product, qty: a.qty, cost: a.cost, expiry: a.expiry, location: 'stock' });
            }
        }
        journal(s, username, 'refund', tx.amount, tx.entries.map(x => e(x.account, x.credit, x.debit)), { party: tx.party, method: tx.method, lines: tx.lines, note: tx.id });
    }
    if (action === 'opening') {
        assert(!s.transactions.some(t => t.kind === 'capital'), 'Opening cash already entered | تم إدخال الصندوق الافتتاحي');
        const amount = round(num(p.amount, .01));
        journal(s, username, 'capital', amount, [e('cash', amount), e('equity', 0, amount)], { note: 'Opening cash · الصندوق الافتتاحي' });
    }
    if (action === 'expense') {
        const amount = round(num(p.amount, .01));
        journal(s, username, 'expense', amount, [e('expenses', amount), e('cash', 0, amount)], { note: str(p.note), party: p.party || '' });
    }
    if (action === 'settle') {
        const amount = round(num(p.amount, .01)), party = str(p.party);
        assert(['receivable', 'payable'].includes(p.account));
        const balance = s.transactions.filter(t => t.party === party).flatMap(t => t.entries).filter(e => e.account === p.account).reduce((a, e) => a + (p.account === 'receivable' ? e.debit - e.credit : e.credit - e.debit), 0);
        assert(amount <= balance + .001, 'Payment exceeds outstanding balance | المبلغ يتجاوز الرصيد');
        journal(s, username, 'payment', amount, p.account === 'receivable' ? [e('cash', amount), e('receivable', 0, amount)] : [e('payable', amount), e('cash', 0, amount)], { party, note: p.account });
    }
    if (action === 'user') {
        const login = str(p.username).toLowerCase();
        assert(/^[\p{L}\p{N}][\p{L}\p{N}._@-]{2,63}$/u.test(login), 'Username must be 3–64 letters or numbers, no spaces | اسم المستخدم من ٣ إلى ٦٤ حرفاً أو رقماً بدون مسافات');
        assert(login !== s.owner, 'Owner access cannot be changed');
        assert(['manager', 'cashier', 'storage', 'accountant'].includes(p.role));
        s.users = s.users.filter(u => u.username !== login);
        s.users.push({ username: login, name: str(p.name), role: p.role });
    }
    if (action === 'removeUser') {
        assert(p.username !== s.owner);
        s.users = s.users.filter(u => u.username !== p.username);
    }
    if (action === 'settings') {
        assert(!s.transactions.length || p.currency === s.settings.currency, 'Currency is locked after the first transaction | العملة مقفلة بعد أول عملية');
        s.settings = { name: str(p.name), currency: str(p.currency, 8), tax: num(p.tax), receipt: str(p.receipt) };
        assert(s.settings.tax <= 100);
    }
    if (action === 'demo') {
        assert(s.products.length === 0 && s.transactions.length === 0, 'Sample data requires an empty store');
        const defs = [['Whole milk 1L', 'حليب كامل الدسم', 'Dairy', 'milk', 2000, 1400, 42], ['Fresh eggs · 12 pack', 'بيض طازج · ١٢ حبة', 'Dairy', 'egg', 3500, 2500, 32], ['Basmati rice 5kg', 'أرز بسمتي ٥ كغم', 'Pantry', 'wheat', 14500, 11000, 28], ['Olive oil 1L', 'زيت زيتون ١ لتر', 'Pantry', 'bottle', 12000, 8500, 18], ['Fresh apples 1kg', 'تفاح طازج ١ كغم', 'Produce', 'apple', 2500, 1700, 48], ['Orange juice 1L', 'عصير برتقال ١ لتر', 'Beverages', 'citrus', 2250, 1500, 36], ['Butter croissant', 'كرواسون بالزبدة', 'Bakery', 'croissant', 1250, 800, 24], ['Dishwashing liquid', 'سائل غسيل الصحون', 'Household', 'sparkles', 3000, 2000, 20]];
        let value = 0;
        defs.forEach((d, i) => { const id = crypto.randomUUID(); s.products.push({ id, name: d[0], ar: d[1], category: d[2], icon: d[3], price: d[4], min: 10, barcode: '628100000' + i, unit: 'piece' }); for (const loc of ['stock', 'shown']) {
            const qty = loc === 'stock' ? 60 : d[6];
            value += qty * d[5];
            s.lots.push({ id: crypto.randomUUID(), product: id, qty, cost: d[5], location: loc, expiry: new Date(Date.now() + (i === 0 ? 5 : 120 + i) * 86400000).toISOString().slice(0, 10) });
        } });
        journal(s, username, 'opening', value, [e('inventory', value), e('equity', 0, value)], { note: 'Sample opening inventory · مخزون تجريبي' });
    }
    s.audit.unshift({ date: new Date().toISOString(), user: username, action });
    return s;
}
export function visible(s, role) { if (role === 'manager')
    return s; if (role === 'accountant')
    return { ...s, owner: '', users: [], audit: [] }; if (role === 'storage')
    return { ...s, owner: '', users: [], transactions: [], audit: [] }; return { ...s, owner: '', users: [], audit: [], transactions: s.transactions.filter(t => ['sale', 'purchase', 'refund'].includes(t.kind)).map(t => ({ ...t, entries: [] })) }; }
