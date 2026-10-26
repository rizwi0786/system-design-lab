// Sample datasets for the SQL playground page. Data is generated deterministically (fixed-seed PRNG), so
// every learner gets exactly the same rows and the exercise prompts can quote real values.

export interface SqlDataset { id: string; title: string; description: string; tables: string[]; setupSql: string }

function prng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}
const lit = (v: string | number | null) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`);
const insert = (table: string, cols: string[], rows: (string | number | null)[][]) =>
  `INSERT INTO ${table} (${cols.join(', ')}) VALUES\n${rows.map((r) => '  (' + r.map(lit).join(', ') + ')').join(',\n')};\n`;
const pad = (n: number) => String(n).padStart(2, '0');
const addDays = (iso: string, days: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

// ---------- shop ----------
const CUSTOMERS: [string, string, string][] = [
  ['Aarav Sharma', 'Delhi', '2025-11-03'], ['Diya Patel', 'Ahmedabad', '2025-11-10'], ['Vihaan Gupta', 'Pune', '2025-11-18'], ['Ananya Iyer', 'Chennai', '2025-11-25'],
  ['Arjun Reddy', 'Hyderabad', '2025-12-01'], ['Ishita Singh', 'Lucknow', '2025-12-04'], ['Kabir Mehta', 'Mumbai', '2025-12-09'], ['Saanvi Nair', 'Kochi', '2025-12-15'],
  ['Reyansh Joshi', 'Pune', '2025-12-20'], ['Myra Kapoor', 'Delhi', '2026-01-02'], ['Aditya Rao', 'Bengaluru', '2026-01-06'], ['Kiara Das', 'Kolkata', '2026-01-11'],
  ['Rohan Verma', 'Gurgaon', '2026-01-15'], ['Anika Bose', 'Kolkata', '2026-01-19'], ['Vivaan Malhotra', 'Mumbai', '2026-01-24'], ['Tara Menon', 'Bengaluru', '2026-01-29'],
  ['Ayaan Khan', 'Pune', '2026-02-03'], ['Zara Fernandes', 'Goa', '2026-02-08'], ['Krishna Pillai', 'Chennai', '2026-02-14'], ['Meher Chawla', 'Gurgaon', '2026-02-20'],
  ['Laksh Agarwal', 'Jaipur', '2026-02-27'], ['Nisha Kulkarni', 'Pune', '2026-03-05'], ['Omar Siddiqui', 'Hyderabad', '2026-03-12'], ['Pooja Banerjee', 'Delhi', '2026-03-19'],
];
const PRODUCTS: [string, string, number, number][] = [
  ['Wireless Mouse', 'Electronics', 799, 120], ['Mechanical Keyboard', 'Electronics', 3499, 45], ['USB-C Hub', 'Electronics', 1899, 60], ['27" Monitor', 'Electronics', 14999, 12],
  ['Noise-cancelling Headphones', 'Electronics', 8999, 25], ['Laptop Stand', 'Accessories', 1299, 80], ['Desk Mat', 'Accessories', 599, 150], ['Webcam Cover (3-pack)', 'Accessories', 149, 400],
  ['Cable Organiser', 'Accessories', 349, 210], ['Ergonomic Chair', 'Furniture', 18999, 8], ['Standing Desk', 'Furniture', 27999, 5], ['Bookshelf', 'Furniture', 6499, 14],
  ['Clean Code', 'Books', 699, 70], ['Designing Data-Intensive Applications', 'Books', 1499, 40], ['The Pragmatic Programmer', 'Books', 899, 55], ['SQL Performance Explained', 'Books', 1199, 30],
  ['Green Tea (100 bags)', 'Grocery', 450, 300], ['Filter Coffee (500 g)', 'Grocery', 520, 180], ['Dark Chocolate', 'Grocery', 180, 260], ['Almonds (1 kg)', 'Grocery', 1150, 90],
];

function shopSql(): string {
  const r = prng(42);
  const customers = CUSTOMERS.map(([name, city, date], i) => [i + 1, name, name.toLowerCase().replace(/\s+/g, '.') + '@example.in', city, date]);
  const products = PRODUCTS.map(([name, cat, price, stock], i) => [i + 1, name, cat, price, stock]);
  const orders: (string | number)[][] = [];
  const items: (string | number)[][] = [];
  const payments: (string | number)[][] = [];
  const buyers = customers.slice(0, 20); // customers 21-24 never order
  const statuses = ['paid', 'shipped', 'shipped', 'delivered', 'delivered', 'pending', 'cancelled'];
  let itemId = 1;
  for (let o = 1; o <= 40; o++) {
    const cust = buyers[Math.floor(r() * buyers.length)];
    const date = addDays('2026-01-05', Math.floor((o - 1) * 3.6 + r() * 3));
    const status = statuses[Math.floor(r() * statuses.length)];
    orders.push([o, cust[0] as number, date, status]);
    const lines = 1 + Math.floor(r() * 2) + (r() > 0.8 ? 1 : 0);
    const used = new Set<number>();
    let total = 0;
    for (let l = 0; l < lines; l++) {
      let p = Math.floor(r() * products.length);
      while (used.has(p)) p = (p + 1) % products.length;
      used.add(p);
      const qty = 1 + Math.floor(r() * 3);
      const price = products[p][3] as number;
      total += qty * price;
      items.push([itemId++, o, p + 1, qty, price]);
    }
    if (status !== 'pending' && status !== 'cancelled') {
      const method = ['upi', 'card', 'upi', 'netbanking', 'cod'][Math.floor(r() * 5)];
      payments.push([payments.length + 1, o, total, method, `${date} ${pad(9 + Math.floor(r() * 12))}:${pad(Math.floor(r() * 60))}:00`]);
    }
  }
  return `CREATE TABLE customers (
  id          integer PRIMARY KEY,
  name        text NOT NULL,
  email       text NOT NULL UNIQUE,
  city        text NOT NULL,
  signup_date date NOT NULL
);
CREATE TABLE products (
  id       integer PRIMARY KEY,
  name     text NOT NULL,
  category text NOT NULL,
  price    numeric(10,2) NOT NULL CHECK (price >= 0),
  stock    integer NOT NULL DEFAULT 0
);
CREATE TABLE orders (
  id          integer PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers(id),
  order_date  date NOT NULL,
  status      text NOT NULL CHECK (status IN ('pending','paid','shipped','delivered','cancelled'))
);
CREATE TABLE order_items (
  id         integer PRIMARY KEY,
  order_id   integer NOT NULL REFERENCES orders(id),
  product_id integer NOT NULL REFERENCES products(id),
  quantity   integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(10,2) NOT NULL
);
CREATE TABLE payments (
  id       integer PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders(id),
  amount   numeric(12,2) NOT NULL,
  method   text NOT NULL,
  paid_at  timestamp NOT NULL
);
${insert('customers', ['id', 'name', 'email', 'city', 'signup_date'], customers)}
${insert('products', ['id', 'name', 'category', 'price', 'stock'], products)}
${insert('orders', ['id', 'customer_id', 'order_date', 'status'], orders)}
${insert('order_items', ['id', 'order_id', 'product_id', 'quantity', 'unit_price'], items)}
${insert('payments', ['id', 'order_id', 'amount', 'method', 'paid_at'], payments)}`;
}

// ---------- HR ----------
const DEPARTMENTS: [string, string][] = [['Leadership', 'Gurgaon'], ['Engineering', 'Bengaluru'], ['Sales', 'Mumbai'], ['Finance', 'Gurgaon'], ['People', 'Pune'], ['Support', 'Hyderabad']];
// [name, dept, managerIndex (1-based) | null, title, salary, hire date]
const EMPLOYEES: [string, number, number | null, string, number, string][] = [
  ['Rajesh Khanna', 1, null, 'CEO', 650000, '2015-04-01'],
  ['Meera Iyer', 2, 1, 'VP Engineering', 420000, '2016-07-11'],
  ['Sanjay Kapoor', 3, 1, 'VP Sales', 390000, '2017-01-09'],
  ['Farah Ali', 4, 1, 'CFO', 410000, '2016-03-21'],
  ['Neha Joshi', 5, 1, 'Head of People', 260000, '2018-06-04'],
  ['Vikram Rao', 2, 2, 'Engineering Manager', 300000, '2018-09-17'],
  ['Priya Menon', 2, 2, 'Engineering Manager', 305000, '2019-02-25'],
  ['Amit Desai', 2, 6, 'Senior Engineer', 230000, '2019-08-12'],
  ['Sneha Kulkarni', 2, 6, 'Engineer', 160000, '2021-05-03'],
  ['Rahul Nair', 2, 6, 'Engineer', 155000, '2022-01-17'],
  ['Kavya Reddy', 2, 7, 'Senior Engineer', 235000, '2019-11-04'],
  ['Arjun Bhatt', 2, 7, 'Engineer', 150000, '2022-07-25'],
  ['Divya Sinha', 2, 11, 'Junior Engineer', 95000, '2024-02-12'],
  ['Manish Tiwari', 3, 3, 'Sales Manager', 240000, '2018-04-23'],
  ['Pooja Shah', 3, 14, 'Account Executive', 120000, '2021-03-15'],
  ['Karan Malhotra', 3, 14, 'Account Executive', 125000, '2020-10-05'],
  ['Simran Kaur', 3, 14, 'Sales Associate', 85000, '2023-06-19'],
  ['Deepak Jain', 4, 4, 'Finance Manager', 210000, '2019-05-27'],
  ['Anjali Gupta', 4, 18, 'Accountant', 110000, '2021-09-13'],
  ['Rohit Saxena', 4, 18, 'Accountant', 105000, '2022-11-07'],
  ['Tanvi Deshpande', 5, 5, 'HR Business Partner', 140000, '2020-01-20'],
  ['Imran Qureshi', 5, 5, 'Recruiter', 98000, '2022-04-11'],
  ['Lakshmi Pillai', 6, 1, 'Head of Support', 230000, '2018-12-03'],
  ['Gaurav Mishra', 6, 23, 'Support Lead', 130000, '2020-06-29'],
  ['Ritu Chauhan', 6, 24, 'Support Engineer', 80000, '2023-01-09'],
  ['Nikhil Pandey', 6, 24, 'Support Engineer', 82000, '2023-03-27'],
  ['Shreya Ghosh', 6, 24, 'Support Engineer', 80000, '2024-05-06'],
  ['Varun Sethi', 2, 8, 'Engineer', 160000, '2023-08-21'],
];

function hrSql(): string {
  const r = prng(7);
  const deps = DEPARTMENTS.map(([n, l], i) => [i + 1, n, l]);
  const emps = EMPLOYEES.map(([name, d, m, title, sal, hire], i) => [i + 1, name, name.toLowerCase().replace(/\s+/g, '.') + '@corp.example', d, m, title, sal, hire]);
  const leaves: (string | number)[][] = [];
  const types = ['annual', 'annual', 'sick', 'annual', 'unpaid', 'sick'];
  const statuses = ['approved', 'approved', 'approved', 'pending', 'rejected'];
  for (let i = 1; i <= 40; i++) {
    const emp = 2 + Math.floor(r() * (emps.length - 1));
    const start = addDays('2026-01-05', Math.floor(r() * 170));
    const len = types[i % types.length] === 'sick' ? 1 + Math.floor(r() * 2) : 1 + Math.floor(r() * 6);
    leaves.push([i, emp, start, addDays(start, len - 1), types[i % types.length], statuses[Math.floor(r() * statuses.length)]]);
  }
  return `CREATE TABLE departments (
  id       integer PRIMARY KEY,
  name     text NOT NULL UNIQUE,
  location text NOT NULL
);
CREATE TABLE employees (
  id            integer PRIMARY KEY,
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  department_id integer NOT NULL REFERENCES departments(id),
  manager_id    integer REFERENCES employees(id),
  title         text NOT NULL,
  salary        numeric(10,2) NOT NULL,
  hire_date     date NOT NULL
);
CREATE TABLE leave_requests (
  id          integer PRIMARY KEY,
  employee_id integer NOT NULL REFERENCES employees(id),
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  leave_type  text NOT NULL CHECK (leave_type IN ('annual','sick','unpaid')),
  status      text NOT NULL CHECK (status IN ('approved','pending','rejected')),
  CHECK (end_date >= start_date)
);
${insert('departments', ['id', 'name', 'location'], deps)}
${insert('employees', ['id', 'name', 'email', 'department_id', 'manager_id', 'title', 'salary', 'hire_date'], emps)}
${insert('leave_requests', ['id', 'employee_id', 'start_date', 'end_date', 'leave_type', 'status'], leaves)}`;
}

// ---------- audit ----------
const USERS: [string, string][] = [
  ['asha', 'admin'], ['bharat', 'editor'], ['chitra', 'editor'], ['dev', 'viewer'], ['esha', 'viewer'], ['farhan', 'editor'], ['gita', 'viewer'],
  ['harsh', 'admin'], ['indu', 'viewer'], ['jai', 'editor'], ['kriti', 'viewer'], ['lalit', 'viewer'], ['mona', 'editor'], ['naveen', 'viewer'],
  ['ojas', 'viewer'], ['parul', 'editor'], ['qadir', 'viewer'], ['rhea', 'viewer'], ['sahil', 'viewer'], ['tina', 'editor'],
];

export interface AuditLogRow { id: number; userId: number; action: string; entity: string; entityId: number; createdAt: string; ip: string }

/** Deterministic audit log rows. Pairs of rows share a timestamp, so keyset pagination needs the id tie-breaker. */
export function auditLogRows(): AuditLogRow[] {
  const r = prng(2026);
  const actions = ['login', 'login', 'view', 'update', 'create', 'delete', 'export', 'logout'];
  const entities = ['invoice', 'project', 'report', 'user', 'document'];
  const rows: AuditLogRow[] = [];
  let t = Date.UTC(2026, 2, 1, 8, 0, 0);
  for (let i = 1; i <= 60; i++) {
    if (i % 3 !== 0) t += (2 + Math.floor(r() * 25)) * 60_000; // every third row shares the previous timestamp
    const d = new Date(t);
    rows.push({
      id: i, userId: 1 + Math.floor(r() * USERS.length), action: actions[Math.floor(r() * actions.length)], entity: entities[Math.floor(r() * entities.length)],
      entityId: 100 + Math.floor(r() * 900), createdAt: `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 19)}+00`,
      ip: `10.0.${Math.floor(r() * 4)}.${10 + Math.floor(r() * 200)}`,
    });
  }
  // Insert out of id order to show that physical order is not a sort order.
  return rows.map((x, i) => ({ x, k: (i * 37) % 60 })).sort((a, b) => a.k - b.k).map((p) => p.x);
}

function auditSql(): string {
  const r = prng(99);
  const users = USERS.map(([u, role], i) => [i + 1, u, `${u}@example.org`, role, `2025-${pad(1 + (i % 12))}-${pad(1 + ((i * 7) % 28))} 09:00:00+00`]);
  const logs = auditLogRows().map((l) => [l.id, l.userId, l.action, l.entity, l.entityId, l.createdAt, l.ip]);
  const bodies = ['Can you review the March invoice?', 'Approved, thanks!', 'Report exported — see shared drive.', 'Please reset my access.', 'Meeting moved to 3 pm.',
    'Who deleted project #412?', 'Restored from backup.', 'New user onboarded.', 'Ping me when the export finishes.', 'Looks good to me.'];
  const messages: (string | number | null)[][] = [];
  let t = Date.UTC(2026, 2, 1, 9, 0, 0);
  for (let i = 1; i <= 40; i++) {
    t += (5 + Math.floor(r() * 240)) * 60_000;
    const sender = 1 + Math.floor(r() * users.length);
    let recipient = 1 + Math.floor(r() * users.length);
    if (recipient === sender) recipient = (recipient % users.length) + 1;
    const sent = new Date(t);
    const read = r() > 0.3 ? new Date(t + (1 + Math.floor(r() * 300)) * 60_000) : null;
    const fmt = (d: Date) => `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 19)}+00`;
    messages.push([i, sender, recipient, bodies[Math.floor(r() * bodies.length)], fmt(sent), read ? fmt(read) : null]);
  }
  return `CREATE TABLE users (
  id         integer PRIMARY KEY,
  username   text NOT NULL UNIQUE,
  email      text NOT NULL UNIQUE,
  role       text NOT NULL CHECK (role IN ('admin','editor','viewer')),
  created_at timestamptz NOT NULL
);
CREATE TABLE audit_logs (
  id         bigint PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES users(id),
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  integer NOT NULL,
  created_at timestamptz NOT NULL,
  ip         text NOT NULL
);
CREATE INDEX audit_logs_created_at_id_idx ON audit_logs (created_at, id);
CREATE TABLE messages (
  id           integer PRIMARY KEY,
  sender_id    integer NOT NULL REFERENCES users(id),
  recipient_id integer NOT NULL REFERENCES users(id),
  body         text NOT NULL,
  sent_at      timestamptz NOT NULL,
  read_at      timestamptz
);
${insert('users', ['id', 'username', 'email', 'role', 'created_at'], users)}
${insert('audit_logs', ['id', 'user_id', 'action', 'entity', 'entity_id', 'created_at', 'ip'], logs)}
${insert('messages', ['id', 'sender_id', 'recipient_id', 'body', 'sent_at', 'read_at'], messages)}`;
}

export const SQL_DATASETS: SqlDataset[] = [
  { id: 'shop', title: 'Shop', description: '24 customers, 20 products, 40 orders with items and payments', tables: ['customers', 'products', 'orders', 'order_items', 'payments'], setupSql: shopSql() },
  { id: 'hr', title: 'HR', description: '6 departments, 28 employees in a reporting tree, 40 leave requests', tables: ['departments', 'employees', 'leave_requests'], setupSql: hrSql() },
  { id: 'audit', title: 'Audit', description: '20 users, 60 audit log entries, 40 messages', tables: ['users', 'audit_logs', 'messages'], setupSql: auditSql() },
];

export const datasetById = (id: string) => SQL_DATASETS.find((d) => d.id === id) ?? SQL_DATASETS[0];
